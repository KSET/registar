const crypto = require('crypto');
const config = require('../config');

function authenticateDiscordBot(req, res, next) {
  const configuredKey = config.discordBotApiKey;
  if (!configuredKey || configuredKey.length < 32) {
    return res.status(503).json({ error: 'Discord integracija nije konfigurirana.' });
  }

  if (config.isProduction && !req.secure) {
    return res.status(403).json({ error: 'HTTPS je obavezan.' });
  }

  const authorization = req.get('authorization') || '';
  const match = /^Bearer ([\x21-\x7E]{32,256})$/.exec(authorization);
  if (!match) {
    return res.status(401).json({ error: 'Neautoriziran zahtjev.' });
  }

  const expected = crypto.createHash('sha256').update(configuredKey).digest();
  const received = crypto.createHash('sha256').update(match[1]).digest();
  if (!crypto.timingSafeEqual(expected, received)) {
    return res.status(401).json({ error: 'Neautoriziran zahtjev.' });
  }

  next();
}

module.exports = { authenticateDiscordBot };
