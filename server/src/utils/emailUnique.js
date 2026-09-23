const prisma = require('../lib/prisma');

async function findEmailOwner(email, excludeMemberId = null) {
  if (!email) return null;
  return prisma.member.findFirst({
    where: {
      ...(excludeMemberId ? { id: { not: excludeMemberId } } : {}),
      OR: [{ ksetEmail: email }, { privateEmail: email }],
    },
  });
}

async function isEmailTaken(email, excludeMemberId = null) {
  if (!email) return false;
  const owner = await findEmailOwner(email, excludeMemberId);
  if (owner) return true;
  return false;
}

module.exports = { findEmailOwner, isEmailTaken };
