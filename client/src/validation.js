// Validation rules per field. Each returns an error string or null (valid).

const required = (label) => (v) =>
  v === null || v === undefined || (typeof v === 'string' && !v.trim())
    ? `${label} je obavezno polje.`
    : null;

const requiredArray = (label, min = 1) => (v) =>
  !Array.isArray(v) || v.length < min
    ? `Odaberite barem ${min} (${label}).`
    : null;

// ISO 7064, MOD 11,10
export function isValidOib(oib) {
  if (!/^\d{11}$/.test(oib || '')) return false;
  let remainder = 10;
  for (let i = 0; i < 10; i++) {
    remainder = (remainder + parseInt(oib[i], 10)) % 10;
    if (remainder === 0) remainder = 10;
    remainder = (remainder * 2) % 11;
  }
  const checkDigit = (11 - remainder) % 10;
  return checkDigit === parseInt(oib[10], 10);
}

const oibRule = (v) => {
  if (!/^\d{11}$/.test(v || '')) return 'OIB mora imati točno 11 znamenaka.';
  if (!isValidOib(v)) return 'OIB nije ispravan (kontrolna znamenka).';
  return null;
};

const emailRule = (label) => (v) =>
  v && !/^\S+@\S+\.\S+$/.test(v) ? `${label} nije ispravan e-mail.` : null;

const phoneRule = (v) =>
  v && !/^[\d\s+()/-]{6,}$/.test(v) ? 'Broj telefona nije ispravan.' : null;

function compose(...rules) {
  return (value, form) => {
    for (const rule of rules) {
      const err = rule(value, form);
      if (err) return err;
    }
    return null;
  };
}

export const memberValidators = {
  firstName: required('Ime'),
  lastName: required('Prezime'),
  oib: compose(required('OIB'), oibRule),
  dateOfBirth: required('Datum rođenja'),
  address: required('Adresa'),
  gender: required('Spol'),
  facultyId: required('Fakultet'),
  facultyOther: (v, form) =>
    form.facultyId === 'OTHER' && (!v || !v.trim()) ? 'Upišite fakultet.' : null,
  phone: compose(required('Broj telefona'), phoneRule),
  privateEmail: compose(required('Privatni e-mail'), emailRule('Privatni e-mail')),
  memberSince: required('Datum učlanjenja'),
  cardNumber: required('Broj iskaznice'),
  membershipLevel: required('Razina članstva'),
  homeSectionId: required('Matična sekcija'),
  dietType: required('Tip prehrane'),
  shirtSize: required('Veličina majice'),
  drinkIds: requiredArray('Pića', 1),
  acceptedDocuments: (v) => (v ? null : 'Morate prihvatiti akte i dokumente udruge.'),
};

export function validateForm(form, validators, fields) {
  const errors = {};
  const keys = fields || Object.keys(validators);
  for (const key of keys) {
    const validator = validators[key];
    if (!validator) continue;
    const err = validator(form[key], form);
    if (err) errors[key] = err;
  }
  return errors;
}
