const prisma = require('../lib/prisma');

// Re-checks the acting member's role/managedSection against the database
// instead of trusting the JWT's appRole/managedSectionId claims, which stay
// valid for the token's full 24h lifetime even after an admin changes the
// holder's role. Use after authenticateToken on any route that branches on
// req.user.appRole or req.user.managedSectionId - it overwrites both with
// current values so existing handlers need no other changes.
async function verifyCurrentRole(req, res, next) {
  const { memberId } = req.user;

  if (!memberId) {
    req.user.appRole = null;
    req.user.managedSectionId = null;
    return next();
  }

  try {
    const current = await prisma.member.findUnique({
      where: { id: memberId },
      select: { appRole: true, managedSectionId: true },
    });

    req.user.appRole = current?.appRole ?? null;
    req.user.managedSectionId = current?.managedSectionId ?? null;
    next();
  } catch (err) {
    console.error('Verify current role error:', err);
    res.status(500).json({ error: 'Greška na serveru.' });
  }
}

module.exports = { verifyCurrentRole };
