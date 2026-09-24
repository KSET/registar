// Parses all 10 per-section sheets (_Bike, _Disco, ...) of the legacy KSET
// Excel registar, instead of the flattened "_Svi" sheet. A member who
// belongs to more than one section appears once per section sheet they're
// in - this reconciles those into one person per name, deriving their
// section memberships from *which sheets they appear in* rather than from
// the sheet's own "Jeste li pridruženi..." text column, and treats any
// sheet-to-sheet disagreement on a person's data as an error rather than
// guessing which copy is right.
const XLSX = require('xlsx');
const { REQUIRED_HEADERS, SECTION_ABBR, parseMemberRow, toDateOnlyString } = require('./importMemberRow');

const SECTION_SHEETS = ['_Bike', '_Disco', '_Dramska', '_Foto', '_Glazbena', '_Media', '_Pi', '_Comp', '_Tech', '_Video'];

// Fields compared across a person's occurrences to detect sheet-to-sheet
// disagreement. Deliberately excludes "Jeste li pridruženi nekoj drugoj
// sekciji?" - section membership is derived from sheet presence instead.
const COMPARE_FIELDS = [
  'Aktivan član', 'OIB', 'Datum rođenja', 'Datum učlanjenja', 'Trenutna vrsta članstva',
  'Datum postanka narančastim', 'Fakultet', 'Adresa prebivališta', 'Poštanski broj',
  'Kontakt broj mobitela', 'Privatna e-pošta', 'KSET e-pošta', 'Matična sekcija',
  'Veličina majice', 'Šifra iskaznice', 'Spol', 'Jeste li pridruženi nekom timu?',
  'Koju vrste prehrane konzumirate?', 'Koju vrstu pića konzumirate?',
  'Imate li kakve alergije u vezi pića ili hrane?', 'Statut i drugi akti udruge',
  'GDPR Privola', 'Kodeks Udruge', 'Kodeks nulte tolerancije', 'Politika privatnosti',
];

function cellText(value) {
  if (value instanceof Date) return toDateOnlyString(value) || '';
  return (value ?? '').toString().trim();
}

function isActiveCell(row) {
  return cellText(row['Aktivan član']).toLowerCase() === 'da';
}

function locationLabel(o) {
  return `${o.sheetName} red ${o.rowNum}`;
}

// `lookups` = { sections, teams, drinks, faculties }; `existing` = Sets of
// what's already in the DB (same shape as importSections' caller builds).
function parseSectionSheets(buffer, lookups, existing) {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const missingSheets = SECTION_SHEETS.filter((s) => !wb.SheetNames.includes(s));
  if (missingSheets.length > 0) {
    throw new Error(`Nedostaju listovi sekcija u datoteci: ${missingSheets.join(', ')}`);
  }

  const sectionByName = new Map(lookups.sections.map((s) => [s.name, s.id]));
  const teamByName = new Map(lookups.teams.map((t) => [t.name, t.id]));
  const drinkByName = new Map(lookups.drinks.map((d) => [d.name, d.id]));
  const facultyByName = new Map(lookups.faculties.map((f) => [f.name, f.id]));

  const occurrencesByName = new Map();
  let totalRawRows = 0;

  for (const sheetName of SECTION_SHEETS) {
    const ws = wb.Sheets[sheetName];
    const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    if (raw.length === 0) continue;
    const header = raw[0].map((h) => (h || '').toString().trim());
    const missingHeaders = REQUIRED_HEADERS.filter((h) => !header.includes(h));
    if (missingHeaders.length > 0) {
      throw new Error(`Nedostaju stupci u listu "${sheetName}": ${missingHeaders.join(', ')}`);
    }
    const nameCol = header.indexOf('Ime i prezime');

    const dataRows = raw.slice(1).filter((r) => (r[nameCol] || '').toString().trim());

    for (let i = 0; i < dataRows.length; i++) {
      totalRawRows++;
      const arr = dataRows[i];
      const row = {};
      header.forEach((h, idx) => { row[h] = arr[idx]; });
      const rowNum = i + 2;
      const personName = (row['Ime i prezime'] || '').toString().trim();

      if (!occurrencesByName.has(personName)) occurrencesByName.set(personName, []);
      occurrencesByName.get(personName).push({ sheetName, rowNum, row });
    }
  }

  const result = {
    totalRows: totalRawRows,
    inactiveSkipped: 0,
    valid: [],
    invalid: [],
    newDrinkNames: new Set(),
  };

  const batchOibs = new Set();
  const batchEmails = new Set();
  const batchCardNumbers = new Set();

  for (const [personName, occurrences] of occurrencesByName.entries()) {
    const locations = occurrences.map(locationLabel).join(', ');

    const activeFlags = occurrences.map((o) => isActiveCell(o.row));
    if (activeFlags.every((a) => !a)) {
      result.inactiveSkipped++;
      continue;
    }
    if (!activeFlags.every((a) => a === activeFlags[0])) {
      result.invalid.push({
        personName,
        locations,
        errors: [`Nedosljedan status "Aktivan član" između listova sekcija (${locations}).`],
      });
      continue;
    }

    if (occurrences.length > 1) {
      const base = occurrences[0].row;
      const mismatches = [];
      for (const field of COMPARE_FIELDS) {
        const baseText = cellText(base[field]);
        for (const o of occurrences.slice(1)) {
          if (cellText(o.row[field]) !== baseText) {
            mismatches.push(
              `Polje "${field}" se razlikuje između listova: "${baseText}" (${occurrences[0].sheetName}) vs "${cellText(o.row[field])}" (${o.sheetName}).`
            );
          }
        }
      }
      if (mismatches.length > 0) {
        result.invalid.push({ personName, locations, errors: [...new Set(mismatches)] });
        continue;
      }
    }

    const parsed = parseMemberRow(occurrences[0].row, { sectionByName, teamByName, drinkByName, facultyByName });
    if (parsed.errors.length > 0) {
      result.invalid.push({ personName, locations, errors: parsed.errors });
      continue;
    }

    const data = parsed.data;

    // Associated sections = every section sheet this person appears in,
    // minus their own home section.
    const sectionNames = [...new Set(occurrences.map((o) => SECTION_ABBR[o.sheetName.replace(/^_/, '')]))]
      .filter((n) => n !== data.homeSectionName);
    const unresolvedSections = sectionNames.filter((n) => !sectionByName.has(n));

    const errors = [];
    if (unresolvedSections.length > 0) errors.push(`Nepoznata pridružena sekcija: ${unresolvedSections.join(', ')}`);

    if (batchOibs.has(data.oib) || existing.oibs.has(data.oib)) errors.push('OIB se dupliciran (već postoji).');
    if (batchCardNumbers.has(data.cardNumber) || existing.cardNumbers.has(data.cardNumber)) {
      errors.push('Šifra iskaznice se dupliciran (već postoji).');
    }
    for (const email of [data.privateEmail, data.ksetEmail].filter(Boolean)) {
      if (batchEmails.has(email) || existing.privateEmails.has(email) || existing.ksetEmails.has(email)) {
        errors.push(`E-mail se duplicira: ${email}`);
      }
    }

    if (errors.length > 0) {
      result.invalid.push({ personName, locations, errors });
      continue;
    }

    for (const name of data.drinkNames) {
      if (!drinkByName.has(name)) result.newDrinkNames.add(name);
    }
    batchOibs.add(data.oib);
    if (data.privateEmail) batchEmails.add(data.privateEmail);
    if (data.ksetEmail) batchEmails.add(data.ksetEmail);
    batchCardNumbers.add(data.cardNumber);

    result.valid.push({
      personName,
      locations,
      data: { ...data, sectionNames },
    });
  }

  result.newDrinkNames = [...result.newDrinkNames];
  return result;
}

module.exports = { parseSectionSheets, SECTION_SHEETS };
