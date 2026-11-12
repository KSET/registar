const ADMIN_ROLES = ['UPRAVA', 'NADZORNI'];

function hasAdminRole(memberOrRole, isAdministrator = false) {
  const role = typeof memberOrRole === 'string' ? memberOrRole : memberOrRole?.appRole;
  const administratorFlag = typeof memberOrRole === 'object' && memberOrRole !== null
    ? memberOrRole.isAdministrator
    : isAdministrator;
  return ADMIN_ROLES.includes(role) || administratorFlag === true;
}

function authorize(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Nije autentificiran.' });
    }

    const roleAllowed = allowedRoles.includes(req.user.appRole)
      || (hasAdminRole(req.user) && allowedRoles.some((role) => ADMIN_ROLES.includes(role)));
    if (!req.user.appRole || !roleAllowed) {
      return res.status(403).json({ error: 'Nema ovlasti.' });
    }

    next();
  };
}

module.exports = { authorize, hasAdminRole };
