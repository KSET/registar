// Single-use, short-lived nonces for the Google email-link flow.
//
// The OAuth `state` param must be an opaque, server-issued, unguessable value
// that we verify on callback - never data the client can construct itself
// (e.g. `link:<memberId>`), or anyone can forge a link request for any
// member by hand-building the Google authorize URL.
const crypto = require('crypto');

const NONCE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const nonces = new Map(); // nonce -> { memberId, expiresAt }

function createLinkNonce(memberId) {
  const nonce = crypto.randomBytes(24).toString('hex');
  nonces.set(nonce, { memberId, expiresAt: Date.now() + NONCE_TTL_MS });
  return nonce;
}

// Single-use: consuming a nonce (valid or not) removes it, so a captured
// callback URL can't be replayed.
function consumeLinkNonce(nonce) {
  const entry = nonces.get(nonce);
  if (!entry) return null;
  nonces.delete(nonce);
  if (entry.expiresAt < Date.now()) return null;
  return entry.memberId;
}

setInterval(() => {
  const now = Date.now();
  for (const [nonce, entry] of nonces) {
    if (entry.expiresAt < now) nonces.delete(nonce);
  }
}, 5 * 60 * 1000).unref();

module.exports = { createLinkNonce, consumeLinkNonce };
