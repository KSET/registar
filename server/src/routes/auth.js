const express = require('express');
const passport = require('passport');
const jwt = require('jsonwebtoken');
const config = require('../config');
const { authenticateToken } = require('../middleware/auth');
const prisma = require('../lib/prisma');
const { logAction, logError } = require('../utils/auditLog');
const { isKsetEmail } = require('../utils/email');
const { createLinkNonce, consumeLinkNonce } = require('../utils/linkNonce');

const router = express.Router();
const JWT_ALGORITHM = 'HS256';

// Matches on either email, but only if it's verified via OAuth.
function findMemberByVerifiedEmail(email) {
  return prisma.member.findFirst({
    where: {
      OR: [
        { ksetEmail: email, ksetEmailVerified: true },
        { privateEmail: email, privateEmailVerified: true },
      ],
    },
  });
}

// Google OAuth login - redirect to Google
router.get(
  '/google',
  passport.authenticate('google', {
    scope: ['profile', 'email'],
    session: false,
    prompt: 'select_account',
  })
);

// Shared by normal login and the /google/link flow below - Google always
// redirects here, so the two are told apart via `state`, not the route.
router.get(
  '/google/callback',
  passport.authenticate('google', {
    session: false,
    failureRedirect: `${config.clientUrl}/login?error=auth_failed`,
  }),
  async (req, res) => {
    const linkStateMatch = /^link:([0-9a-f]{48})$/.exec(req.query.state || '');

    if (linkStateMatch) {
      const memberId = consumeLinkNonce(linkStateMatch[1]);
      if (!memberId) {
        return res.redirect(`${config.clientUrl}/?linkError=invalid_state`);
      }
      return handleEmailLinkCallback(req, res, memberId);
    }

    try {
      const { email, displayName } = req.user;

      const member = await findMemberByVerifiedEmail(email);

      const tokenPayload = {
        email,
        displayName,
      };

      if (member) {
        tokenPayload.memberId = member.id;
        tokenPayload.appRole = member.appRole;
        tokenPayload.isNewUser = false;
      } else {
        tokenPayload.memberId = null;
        tokenPayload.appRole = null;
        tokenPayload.isNewUser = true;
      }

      const token = jwt.sign(tokenPayload, config.jwtSecret, {
        expiresIn: '24h',
        algorithm: JWT_ALGORITHM,
      });

      // Redirect to frontend with token
      res.redirect(`${config.clientUrl}/auth/callback?token=${token}`);
    } catch (err) {
      console.error('OAuth callback error:', err);
      res.redirect(`${config.clientUrl}/login?error=server_error`);
    }
  }
);

async function handleEmailLinkCallback(req, res, memberId) {
  try {
    const { email } = req.user;

    const member = await prisma.member.findUnique({ where: { id: memberId } });
    if (!member) {
      return res.redirect(`${config.clientUrl}/?linkError=member_not_found`);
    }

    const linkingKset = isKsetEmail(email);
    const currentValue = linkingKset ? member.ksetEmail : member.privateEmail;
    const currentlyVerified = linkingKset ? member.ksetEmailVerified : member.privateEmailVerified;

    if (currentValue === email && currentlyVerified) {
      return res.redirect(`${config.clientUrl}/?linked=already`);
    }

    // Don't bind this email to two different members.
    const claimedByOther = await prisma.member.findFirst({
      where: {
        id: { not: memberId },
        OR: [{ ksetEmail: email }, { privateEmail: email }],
      },
    });
    if (claimedByOther) {
      return res.redirect(`${config.clientUrl}/?linkError=email_taken`);
    }

    await prisma.member.update({
      where: { id: memberId },
      data: linkingKset
        ? { ksetEmail: email, ksetEmailVerified: true }
        : { privateEmail: email, privateEmailVerified: true },
    });

    await logAction(prisma, 'member_email_linked', {
      userId: memberId,
      details: { field: linkingKset ? 'ksetEmail' : 'privateEmail' },
    });

    return res.redirect(`${config.clientUrl}/?linked=success`);
  } catch (err) {
    await logError(prisma, 'member_email_link', err, { userId: memberId || null });
    return res.redirect(`${config.clientUrl}/?linkError=server_error`);
  }
}

// Get current user info
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const { email, memberId, isNewUser } = req.user;

    if (isNewUser || !memberId) {
      // Check if there's a pending application
      const pending = await prisma.pendingMember.findUnique({
        where: { googleEmail: email },
      });

      return res.json({
        email,
        isNewUser: true,
        hasPendingApplication: !!pending,
        member: null,
      });
    }

    const member = await prisma.member.findUnique({
      where: { id: memberId },
      include: {
        homeSection: true,
        faculty: true,
        sections: { include: { section: true } },
        teams: { include: { team: true } },
        drinks: { include: { drink: true } },
        allergies: { include: { allergy: true } },
      },
    });

    if (!member) {
      return res.status(404).json({ error: 'Član nije pronađen.' });
    }

    res.json({
      email,
      isNewUser: false,
      hasPendingApplication: false,
      member,
    });
  } catch (err) {
    console.error('Get me error:', err);
    res.status(500).json({ error: 'Greška na serveru.' });
  }
});

router.post('/refresh', authenticateToken, async (req, res) => {
  try {
    const { email, memberId } = req.user;

    // Once a token is bound to a member, re-fetch that exact member by id -
    // never re-derive identity from `email` alone. findMemberByVerifiedEmail
    // is a findFirst() whose filters Prisma silently drops for an
    // undefined/empty email, which would otherwise hand back an unrelated
    // member's session. Email-based lookup is only for the pre-membership
    // (isNewUser) case, where there's no memberId yet to trust.
    const member = memberId
      ? await prisma.member.findUnique({ where: { id: memberId } })
      : await findMemberByVerifiedEmail(email);

    const tokenPayload = {
      email,
      displayName: req.user.displayName,
    };

    if (member) {
      tokenPayload.memberId = member.id;
      tokenPayload.appRole = member.appRole;
      tokenPayload.isNewUser = false;
    } else {
      tokenPayload.memberId = null;
      tokenPayload.appRole = null;
      tokenPayload.isNewUser = true;
    }

    const token = jwt.sign(tokenPayload, config.jwtSecret, {
      expiresIn: '24h',
      algorithm: JWT_ALGORITHM,
    });

    res.json({ token });
  } catch (err) {
    console.error('Refresh token error:', err);
    res.status(500).json({ error: 'Greška na serveru.' });
  }
});

// Links a second Google-verified email to the logged-in member. The JWT
// comes in as a query param (a link click can't send headers) and rides
// along as OAuth `state` to survive the round-trip to Google.
router.get('/google/link', (req, res, next) => {
  const { token } = req.query;
  if (!token) {
    return res.status(400).json({ error: 'Token je obavezan.' });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, config.jwtSecret, { algorithms: [JWT_ALGORITHM] });
  } catch (err) {
    return res.status(403).json({ error: 'Nevažeći token.' });
  }

  if (!decoded.memberId) {
    return res.status(400).json({ error: 'Morate biti prijavljeni kao član.' });
  }

  const nonce = createLinkNonce(decoded.memberId);

  passport.authenticate('google', {
    scope: ['profile', 'email'],
    session: false,
    prompt: 'select_account',
    state: `link:${nonce}`,
  })(req, res, next);
});

module.exports = router;
