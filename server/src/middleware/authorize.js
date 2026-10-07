const ADMIN_ROLES = ['ADMINISTRATOR', 'NADZORNI'];

function hasAdminRole(role) {
  return ADMIN_ROLES.includes(role);
}

function authorize(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Nije autentificiran.' });
    }

    const roleAllowed = allowedRoles.includes(req.user.appRole)
      || (hasAdminRole(req.user.appRole) && allowedRoles.includes('ADMINISTRATOR'));
    if (!req.user.appRole || !roleAllowed) {
      return res.status(403).json({ error: 'Nema ovlasti.' });
    }

    next();
  };
}

module.exports = { authorize, hasAdminRole };
