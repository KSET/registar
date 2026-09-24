// Shared request-input guards used across route handlers.

const MAX_RELATION_IDS = 100; // generously above any real lookup table size

// Parses a route param as a positive integer, or returns null if it isn't one -
// callers should respond 400 rather than let NaN reach Prisma (which throws a
// generic 500 and, on routes that log failures, spams the audit log).
function parsePositiveIntParam(value) {
  if (!/^\d+$/.test(String(value ?? ''))) return null;
  const n = parseInt(value, 10);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// Validates a body field is an array of at most MAX_RELATION_IDS entries,
// each a positive integer. Returns { ok: true, ids } or { ok: false, error }.
function validateIdArray(value, label) {
  if (!Array.isArray(value)) {
    return { ok: false, error: `${label} mora biti niz.` };
  }
  if (value.length > MAX_RELATION_IDS) {
    return { ok: false, error: `${label} sadrži previše stavki.` };
  }
  const ids = [];
  for (const raw of value) {
    const n = parsePositiveIntParam(raw);
    if (n === null) {
      return { ok: false, error: `${label} sadrži nevažeći ID.` };
    }
    ids.push(n);
  }
  return { ok: true, ids };
}

// Server-side length caps for free-text fields - the client's `maxLength`
// attributes are cosmetic only and don't apply to direct API calls.
const FIELD_MAX_LENGTHS = {
  firstName: 100,
  lastName: 100,
  address: 300,
  phone: 30,
  cardNumber: 50,
  shirtSize: 10,
  facultyOther: 200,
  privateEmail: 254,
  ksetEmail: 254,
};

// Returns an error string if `value` exceeds the configured max length for
// `field`, else null. Fields with no configured limit are left alone.
function checkFieldLength(field, value) {
  const max = FIELD_MAX_LENGTHS[field];
  if (!max || typeof value !== 'string') return null;
  return value.length > max ? `Polje "${field}" je predugo (najviše ${max} znakova).` : null;
}

module.exports = { MAX_RELATION_IDS, FIELD_MAX_LENGTHS, parsePositiveIntParam, validateIdArray, checkFieldLength };
