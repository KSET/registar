// Parses the "_Svi" sheet of the legacy KSET Excel registar into rows ready
// for Member.create(). Pure/DB-agnostic: callers pass in the current lookup
// tables (sections, teams, drinks, faculties) and get back validated rows -
// nothing here touches Prisma directly, so it's easy to test and to re-run
// as a dry-run preview before committing anything.
const XLSX = require('xlsx');
const { isValidOib } = require('./oib');

const REQUIRED_HEADERS = [
  'Ime i prezime', 'OIB', 'Datum rođenja', 'Datum učlanjenja',
  'Trenutna vrsta članstva', 'Fakultet', 'Adresa prebivališta', 'Aktivan član',
  'Kontakt broj mobitela', 'Privatna e-pošta', 'KSET e-pošta', 'Matična sekcija',
  'Veličina majice', 'Šifra iskaznice', 'Spol', 'Jeste li pridruženi nekoj drugoj sekciji?',
  'Jeste li pridruženi nekom timu?', 'Koju vrste prehrane konzumirate?',
  'Koju vrstu pića konzumirate?', 'Imate li kakve alergije u vezi pića ili hrane?',
  'Statut i drugi akti udruge', 'GDPR Privola', 'Kodeks Udruge',
  'Kodeks nulte tolerancije', 'Politika privatnosti',
];

// "Bike" -> Biciklistička etc. - the sheet's per-member "Matična sekcija" /
// "pridruženi drugoj sekciji" columns use short codes that match the
// workbook's own per-section sheet names, not our full section names.
const SECTION_ABBR = {
  Bike: 'Biciklistička',
  Disco: 'Disco',
  Dramska: 'Dramska',
  Foto: 'Foto',
  Glazbena: 'Glazbena',
  Media: 'Media',
  Pi: 'Planinarska',
  Comp: 'Računarska',
  Tech: 'Tehnička',
  Video: 'Video',
};

// Card colour -> membership level, per the club's own convention (confirmed
// with the admin): narančasti (orange) = PUNOPRAVNO, plavi (blue) = PRIDRUZENO.
const MEMBERSHIP_LEVEL_MAP = {
  Plava: 'PRIDRUZENO',
  Narančasta: 'PUNOPRAVNO',
};

const GENDER_MAP = { M: 'M', Ž: 'Z' };

const DIET_MAP = {
  Svejed: 'SVEJED',
  Mesojed: 'MESOJED',
  Veganstvo: 'VEGANSTVO',
  Vegetarijanstvo: 'VEGETARIJANSTVO',
};

// The sheet always spells these out in full, combined with ", " when a
// member picked more than one - matched by substring rather than split on
// "," because several of the phrases themselves contain commas.
const DRINK_CATEGORIES = [
  'Alkoholno (piva, vodka itd.)',
  'Gazirano (radenska, cola, fanta)',
  'Negazirano (sok, voda, cedevita)',
  'Čaj (topli, ledeni)',
  'Kava (s mlijekom, bez mlijeka)',
];

// Free-text allergy answers are too inconsistent to parse reliably (typos,
// jokes, "Ne"/"Nope"/"nemam" for "none") - only match the handful of clear,
// unambiguous keywords onto the 3 allergies this app already tracks; leave
// everything else for a human to read and add by hand afterward.
const ALLERGY_KEYWORDS = [
  { re: /gluten/i, name: 'Gluten' },
  { re: /laktoz/i, name: 'Laktoza' },
  { re: /kikirik/i, name: 'Kikiriki' },
];

function splitName(fullName) {
  const trimmed = (fullName || '').trim().replace(/\s+/g, ' ');
  const spaceIdx = trimmed.indexOf(' ');
  if (spaceIdx === -1) return { firstName: trimmed, lastName: '' };
  return { firstName: trimmed.slice(0, spaceIdx), lastName: trimmed.slice(spaceIdx + 1) };
}

function toDateOnlyString(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  // Local getters, not toISOString - the sheet's dates come back shifted to
  // the previous day in UTC (xlsx applies local-timezone construction).
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseShirtSize(raw) {
  const v = (raw || '').trim();
  if (!v) return null;
  const size = v.replace(/^[mž]/i, '').toUpperCase();
  return ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'].includes(size) ? size : null;
}

function parseMultiSection(raw) {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s && s.toLowerCase() !== 'nisam')
    .map((abbr) => SECTION_ABBR[abbr] || abbr);
}

function parseTeams(raw) {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s && s.toLowerCase() !== 'nisam');
}

function parseDrinks(raw) {
  if (!raw) return [];
  return DRINK_CATEGORIES.filter((cat) => raw.includes(cat));
}

function parseAllergies(raw) {
  if (!raw) return [];
  const found = new Set();
  for (const { re, name } of ALLERGY_KEYWORDS) {
    if (re.test(raw)) found.add(name);
  }
  return [...found];
}

function hasAcceptedDocuments(row) {
  return ['Statut i drugi akti udruge', 'GDPR Privola', 'Kodeks Udruge', 'Kodeks nulte tolerancije', 'Politika privatnosti']
    .every((h) => (row[h] || '').toString().trim().length > 0);
}

// `lookups` = { sections: [{id,name}], teams: [...], drinks: [...], faculties: [...] }
// `existing` = { oibs: Set, privateEmails: Set, ksetEmails: Set, cardNumbers: Set } of what's already in the DB
function parseSviBuffer(buffer, lookups, existing) {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  if (!wb.SheetNames.includes('_Svi')) {
    throw new Error('List "_Svi" nije pronađen u datoteci.');
  }
  const ws = wb.Sheets['_Svi'];
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  if (raw.length === 0) {
    throw new Error('List "_Svi" je prazan.');
  }
  const header = raw[0].map((h) => (h || '').toString().trim());
  const missingHeaders = REQUIRED_HEADERS.filter((h) => !header.includes(h));
  if (missingHeaders.length > 0) {
    throw new Error(`Nedostaju stupci u listu "_Svi": ${missingHeaders.join(', ')}`);
  }
  const col = (name) => header.indexOf(name);

  const sectionByName = new Map(lookups.sections.map((s) => [s.name, s.id]));
  const teamByName = new Map(lookups.teams.map((t) => [t.name, t.id]));
  const drinkByName = new Map(lookups.drinks.map((d) => [d.name, d.id]));
  const facultyByName = new Map(lookups.faculties.map((f) => [f.name, f.id]));

  const dataRows = raw.slice(1).filter((r) => (r[col('Ime i prezime')] || '').toString().trim());

  const result = {
    totalRows: dataRows.length,
    inactiveSkipped: 0,
    valid: [],
    invalid: [],
    newDrinkNames: new Set(),
  };

  const batchOibs = new Set();
  const batchEmails = new Set();
  const batchCardNumbers = new Set();

  for (let i = 0; i < dataRows.length; i++) {
    const arr = dataRows[i];
    const row = {};
    header.forEach((h, idx) => { row[h] = arr[idx]; });
    const rowNum = i + 2; // +1 for header, +1 for 1-indexing

    const isActive = (row['Aktivan član'] || '').toString().trim().toLowerCase() === 'da';
    if (!isActive) {
      result.inactiveSkipped++;
      continue;
    }

    const errors = [];
    const { firstName, lastName } = splitName(row['Ime i prezime']);
    if (!firstName || !lastName) errors.push('Ime i prezime nije u obliku "Ime Prezime".');

    const oib = (row['OIB'] || '').toString().trim();
    if (!isValidOib(oib)) errors.push('OIB nije ispravan.');
    else if (batchOibs.has(oib) || existing.oibs.has(oib)) errors.push('OIB se dupliciran (već postoji).');

    const dateOfBirth = toDateOnlyString(row['Datum rođenja']);
    if (!dateOfBirth) errors.push('Datum rođenja nedostaje ili je neispravan.');

    const memberSince = toDateOnlyString(row['Datum učlanjenja']);
    if (!memberSince) errors.push('Datum učlanjenja nedostaje ili je neispravan.');

    const fullMemberSince = toDateOnlyString(row['Datum postanka narančastim']);

    const membershipLevel = MEMBERSHIP_LEVEL_MAP[(row['Trenutna vrsta članstva'] || '').toString().trim()];
    if (!membershipLevel) errors.push(`Nepoznata vrsta članstva: "${row['Trenutna vrsta članstva']}".`);

    const gender = GENDER_MAP[(row['Spol'] || '').toString().trim()];
    if (!gender) errors.push(`Nepoznat spol: "${row['Spol']}".`);

    const facultyRaw = (row['Fakultet'] || '').toString().trim();
    const facultyId = facultyByName.get(facultyRaw) || null;
    const facultyOther = facultyId ? null : facultyRaw || null;
    if (!facultyId && !facultyOther) errors.push('Fakultet nedostaje.');

    const address = (row['Adresa prebivališta'] || '').toString().trim();
    const postal = (row['Poštanski broj'] || '').toString().trim();
    const fullAddress = postal ? `${address}, ${postal}` : address;
    if (!address) errors.push('Adresa nedostaje.');

    const phone = (row['Kontakt broj mobitela'] || '').toString().trim();
    if (!phone) errors.push('Broj mobitela nedostaje.');

    const ksetEmail = (row['KSET e-pošta'] || '').toString().trim() || null;
    const privateEmail = (row['Privatna e-pošta'] || '').toString().trim() || (ksetEmail ? null : null);
    if (!privateEmail && !ksetEmail) errors.push('Nema ni privatne ni KSET e-pošte.');
    const effectivePrivateEmail = privateEmail || ksetEmail;
    for (const email of [privateEmail, ksetEmail].filter(Boolean)) {
      if (batchEmails.has(email) || existing.privateEmails.has(email) || existing.ksetEmails.has(email)) {
        errors.push(`E-mail se duplicira: ${email}`);
      }
    }

    const homeSectionAbbr = (row['Matična sekcija'] || '').toString().trim();
    const homeSectionName = SECTION_ABBR[homeSectionAbbr] || homeSectionAbbr;
    const homeSectionId = sectionByName.get(homeSectionName);
    if (!homeSectionId) errors.push(`Nepoznata matična sekcija: "${homeSectionAbbr}".`);

    const shirtSize = parseShirtSize(row['Veličina majice']);
    if (!shirtSize) errors.push(`Nepoznata veličina majice: "${row['Veličina majice']}".`);

    const cardNumber = (row['Šifra iskaznice'] || '').toString().trim();
    if (!cardNumber) errors.push('Šifra iskaznice nedostaje.');
    else if (batchCardNumbers.has(cardNumber) || existing.cardNumbers.has(cardNumber)) {
      errors.push('Šifra iskaznice se dupliciran (već postoji).');
    }

    const dietType = DIET_MAP[(row['Koju vrste prehrane konzumirate?'] || '').toString().trim()];
    if (!dietType) errors.push(`Nepoznat tip prehrane: "${row['Koju vrste prehrane konzumirate?']}".`);

    const drinkNames = parseDrinks(row['Koju vrstu pića konzumirate?']);
    if (drinkNames.length === 0) errors.push('Nema odabranih pića.');
    for (const name of drinkNames) {
      if (!drinkByName.has(name)) result.newDrinkNames.add(name);
    }

    const sectionNames = parseMultiSection(row['Jeste li pridruženi nekoj drugoj sekciji?']);
    const unresolvedSections = sectionNames.filter((n) => !sectionByName.has(n));
    if (unresolvedSections.length > 0) errors.push(`Nepoznata pridružena sekcija: ${unresolvedSections.join(', ')}`);

    const teamNames = parseTeams(row['Jeste li pridruženi nekom timu?']);
    const unresolvedTeams = teamNames.filter((n) => !teamByName.has(n));
    if (unresolvedTeams.length > 0) errors.push(`Nepoznat tim: ${unresolvedTeams.join(', ')}`);

    const allergyNames = parseAllergies(row['Imate li kakve alergije u vezi pića ili hrane?']);

    const acceptedDocuments = hasAcceptedDocuments(row);
    if (!acceptedDocuments) errors.push('Nisu prihvaćeni svi akti udruge.');

    const entry = {
      rowNum,
      personName: `${firstName} ${lastName}`.trim(),
      errors,
    };

    if (errors.length > 0) {
      result.invalid.push(entry);
      continue;
    }

    batchOibs.add(oib);
    if (privateEmail) batchEmails.add(privateEmail);
    if (ksetEmail) batchEmails.add(ksetEmail);
    batchCardNumbers.add(cardNumber);

    entry.data = {
      firstName,
      lastName,
      oib,
      dateOfBirth,
      address: fullAddress,
      gender,
      facultyId,
      facultyOther,
      phone,
      privateEmail: effectivePrivateEmail,
      privateEmailVerified: false,
      ksetEmail,
      ksetEmailVerified: false,
      memberSince,
      cardNumber,
      membershipLevel,
      fullMemberSince,
      dietType,
      shirtSize,
      acceptedDocuments,
      appRole: 'CLAN',
      homeSectionId,
      sectionNames,
      teamNames,
      drinkNames,
      allergyNames,
    };
    result.valid.push(entry);
  }

  result.newDrinkNames = [...result.newDrinkNames];
  return result;
}

module.exports = { parseSviBuffer, SECTION_ABBR, MEMBERSHIP_LEVEL_MAP };
