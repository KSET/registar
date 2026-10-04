const crypto = require('crypto');
const config = require('../config');
const prisma = require('../lib/prisma');

const VERIFICATION_TTL_MS = 5 * 60 * 1000;
const RETENTION_MS = 24 * 60 * 60 * 1000;
const START_LIMIT = 5;
const START_WINDOW_MS = 15 * 60 * 1000;

function createOAuthUrl(state) {
  if (!config.google.clientId || !config.google.clientSecret) {
    throw new Error('Google OAuth is not configured.');
  }

  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', config.google.clientId);
  url.searchParams.set('redirect_uri', `${config.serverUrl}/api/auth/google/callback`);
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('state', `discord:${state}`);
  url.searchParams.set('prompt', 'select_account');
  return url.toString();
}

async function startDiscordVerification(discordId) {
  const state = crypto.randomBytes(32).toString('hex');
  const oauthUrl = createOAuthUrl(state);

  const now = new Date();
  const windowStart = new Date(now.getTime() - START_WINDOW_MS);
  const attempts = await prisma.discordVerification.count({
    where: { discordId, createdAt: { gte: windowStart } },
  });
  if (attempts >= START_LIMIT) {
    return { error: 'rate_limited' };
  }

  await prisma.discordVerification.deleteMany({
    where: { createdAt: { lt: new Date(now.getTime() - RETENTION_MS) } },
  });
  await prisma.discordVerification.updateMany({
    where: { discordId, status: 'PENDING' },
    data: { status: 'EXPIRED', completedAt: now },
  });

  await prisma.discordVerification.create({
    data: { state, discordId },
  });

  return { state, oauthUrl };
}

function memberBotData(member) {
  return {
    full_name: `${member.firstName} ${member.lastName}`,
    section: member.homeSection.name,
    status_clanstva: member.membershipLevel,
    transport_volunteer: member.transportVolunteer,
  };
}

async function completeDiscordVerification(state, email, emailVerified) {
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const claimed = await tx.discordVerification.updateMany({
      where: {
        state,
        status: 'PENDING',
        createdAt: { gte: new Date(now.getTime() - VERIFICATION_TTL_MS) },
      },
      data: { status: 'PROCESSING', completedAt: now },
    });

    if (claimed.count !== 1) {
      const attempt = await tx.discordVerification.findUnique({
        where: { state },
        select: { status: true, createdAt: true },
      });
      if (attempt?.status === 'PENDING') {
        await tx.discordVerification.update({
          where: { state },
          data: { status: 'EXPIRED', completedAt: now },
        });
      }
      return { status: attempt?.status === 'SUCCESS' ? 'SUCCESS' : 'FAILED' };
    }

    const attempt = await tx.discordVerification.findUnique({
      where: { state },
      select: { discordId: true },
    });
    if (!attempt) return { status: 'FAILED' };

    if (emailVerified !== true || typeof email !== 'string') {
      await tx.discordVerification.update({
        where: { state },
        data: { status: 'FAILED', completedAt: now },
      });
      return { status: 'FAILED' };
    }

    const normalizedEmail = email.trim().toLowerCase();
    const matchingMembers = await tx.member.findMany({
      where: {
        OR: [
          { privateEmail: { equals: normalizedEmail, mode: 'insensitive' } },
          { ksetEmail: { equals: normalizedEmail, mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        discordId: true,
        privateEmail: true,
        ksetEmail: true,
      },
    });

    if (matchingMembers.length !== 1) {
      await tx.discordVerification.update({
        where: { state },
        data: { status: 'FAILED', completedAt: now },
      });
      return { status: 'FAILED' };
    }

    const member = matchingMembers[0];
    const discordOwner = await tx.member.findUnique({
      where: { discordId: attempt.discordId },
      select: { id: true },
    });
    if (discordOwner && discordOwner.id !== member.id) {
      await tx.discordVerification.update({
        where: { state },
        data: { status: 'FAILED', completedAt: now },
      });
      return { status: 'FAILED' };
    }

    const verifyEmailFields = {};
    if (member.privateEmail?.toLowerCase() === normalizedEmail) {
      verifyEmailFields.privateEmailVerified = true;
    }
    if (member.ksetEmail?.toLowerCase() === normalizedEmail) {
      verifyEmailFields.ksetEmailVerified = true;
    }

    const linked = await tx.member.updateMany({
      where: {
        id: member.id,
        discordId: member.discordId,
      },
      data: { discordId: attempt.discordId, ...verifyEmailFields },
    });
    if (linked.count !== 1) {
      await tx.discordVerification.update({
        where: { state },
        data: { status: 'FAILED', completedAt: now },
      });
      return { status: 'FAILED' };
    }

    const currentMember = await tx.member.findUnique({
      where: { id: member.id },
      select: {
        firstName: true,
        lastName: true,
        membershipLevel: true,
        transportVolunteer: true,
        homeSection: { select: { name: true } },
      },
    });

    await tx.discordVerification.update({
      where: { state },
      data: { status: 'SUCCESS', memberId: member.id, completedAt: now },
    });

    return { status: 'SUCCESS', member: memberBotData(currentMember) };
  }).catch(async (error) => {
    console.error('Discord verification completion failed:', error.code || error.name);
    await prisma.discordVerification.updateMany({
      where: { state, status: 'PROCESSING' },
      data: { status: 'FAILED', completedAt: now },
    });
    return { status: 'FAILED' };
  });
}

async function getDiscordVerificationStatus(state) {
  const attempt = await prisma.discordVerification.findUnique({
    where: { state },
    select: { status: true, createdAt: true, member: {
      select: {
        firstName: true,
        lastName: true,
        membershipLevel: true,
        transportVolunteer: true,
        homeSection: { select: { name: true } },
      },
    } },
  });

  if (!attempt) return null;
  if (
    ['PENDING', 'PROCESSING'].includes(attempt.status) &&
    Date.now() - attempt.createdAt.getTime() > VERIFICATION_TTL_MS
  ) {
    await prisma.discordVerification.updateMany({
      where: { state, status: { in: ['PENDING', 'PROCESSING'] } },
      data: { status: 'EXPIRED', completedAt: new Date() },
    });
    return { status: 'EXPIRED' };
  }

  return {
    status: attempt.status,
    ...(attempt.status === 'SUCCESS' && attempt.member
      ? { member: memberBotData(attempt.member) }
      : {}),
  };
}

async function getLinkedDiscordMembers() {
  const members = await prisma.member.findMany({
    where: { discordId: { not: null } },
    select: {
      discordId: true,
      firstName: true,
      lastName: true,
      membershipLevel: true,
      transportVolunteer: true,
      homeSection: { select: { name: true } },
    },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  });

  return members.map((member) => ({
    discord_id: member.discordId,
    ...memberBotData(member),
  }));
}

module.exports = {
  createOAuthUrl,
  startDiscordVerification,
  completeDiscordVerification,
  getDiscordVerificationStatus,
  getLinkedDiscordMembers,
};
