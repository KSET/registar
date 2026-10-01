const crypto = require('crypto');

const TICKET_TTL_MS = 60 * 1000;
const tickets = new Map();

function createLoginTicket(token) {
  const ticket = crypto.randomBytes(32).toString('hex');
  tickets.set(ticket, { token, expiresAt: Date.now() + TICKET_TTL_MS });
  return ticket;
}

function consumeLoginTicket(ticket) {
  if (typeof ticket !== 'string') return null;
  const entry = tickets.get(ticket);
  if (!entry) return null;
  tickets.delete(ticket);
  return entry.expiresAt >= Date.now() ? entry.token : null;
}

setInterval(() => {
  const now = Date.now();
  for (const [ticket, entry] of tickets) {
    if (entry.expiresAt < now) tickets.delete(ticket);
  }
}, TICKET_TTL_MS).unref();

module.exports = { createLoginTicket, consumeLoginTicket };