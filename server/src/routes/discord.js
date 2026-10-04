const express = require('express');
const { authenticateDiscordBot } = require('../middleware/discordBot');
const {
  startDiscordVerification,
  getDiscordVerificationStatus,
  getLinkedDiscordMembers,
} = require('../utils/discordVerification');

const router = express.Router();
const DISCORD_ID_PATTERN = /^[1-9]\d{16,19}$/;
const STATE_PATTERN = /^[0-9a-f]{64}$/;
const routerAuth = [authenticateDiscordBot];

router.post('/verification/start', ...routerAuth, async (req, res) => {
  const discordId = req.body?.discordId;
  if (typeof discordId !== 'string' || !DISCORD_ID_PATTERN.test(discordId)) {
    return res.status(400).json({ error: 'Discord ID nije ispravan.' });
  }

  try {
    const result = await startDiscordVerification(discordId);
    if (result.error === 'rate_limited') {
      return res.status(429).json({ error: 'Previše pokušaja verifikacije.' });
    }
    res.set('Cache-Control', 'no-store');
    return res.json({ state: result.state, oauthUrl: result.oauthUrl });
  } catch (error) {
    console.error('Discord verification start failed:', error.code || error.name);
    return res.status(500).json({ error: 'Greška pri pokretanju verifikacije.' });
  }
});

router.post('/verification/status', ...routerAuth, async (req, res) => {
  const state = req.body?.state;
  if (typeof state !== 'string' || !STATE_PATTERN.test(state)) {
    return res.status(400).json({ error: 'State nije ispravan.' });
  }

  try {
    const result = await getDiscordVerificationStatus(state);
    if (!result) return res.status(404).json({ error: 'Verifikacija nije pronađena.' });
    res.set('Cache-Control', 'no-store');
    return res.json(result);
  } catch (error) {
    console.error('Discord verification status failed:', error.code || error.name);
    return res.status(500).json({ error: 'Greška pri provjeri verifikacije.' });
  }
});

router.get('/members', ...routerAuth, async (req, res) => {
  try {
    const members = await getLinkedDiscordMembers();
    res.set('Cache-Control', 'no-store');
    return res.json(members);
  } catch (error) {
    console.error('Discord member sync failed:', error.code || error.name);
    return res.status(500).json({ error: 'Greška pri sinkronizaciji članova.' });
  }
});

module.exports = router;
