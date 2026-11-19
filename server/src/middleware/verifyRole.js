const prisma = require('../lib/prisma');

// Refreshes role, administrator flag, and managed section from the database
// instead of trusting JWT claims, which remain valid after those values change.
// Use after authenticateToken on routes that rely on these authorization fields.
async function verifyCurrentRole(req, res, next) {
  const { memberId } = req.user;

  if (!memberId) {
    req.user.appRole = null;
    req.user.isAdministrator = false;
    req.user.managedSectionId = null;
    return next();
  }

  try {
    const current = await prisma.member.findUnique({
      where: { id: memberId },
      select: { appRole: true, isAdministrator: true, managedSectionId: true, deletedAt: true },
    });

    req.user.appRole = current && !current.deletedAt ? current.appRole : null;
    req.user.isAdministrator = current && !current.deletedAt ? current.isAdministrator : false;
    req.user.managedSectionId = current && !current.deletedAt ? current.managedSectionId : null;
    next();
  } catch (err) {
    console.error('Verify current role error:', err);
    res.status(500).json({ error: 'Greška na serveru.' });
  }
}

module.exports = { verifyCurrentRole };
