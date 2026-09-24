const jwt = require('jsonwebtoken');
const config = require('../config');

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Pristup odbijen. Token nije pronađen.' });
  }

  try {
    const decoded = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Nevažeći token.' });
  }
}

module.exports = { authenticateToken };
