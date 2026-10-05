// Parses all 10 per-section sheets (_Bike, _Disco, ...) of the legacy KSET
// Excel registar, instead of the flattened "_Svi" sheet. A member who
// belongs to more than one section appears once per section sheet they're
// in - this reconciles those into one person per OIB, deriving their
// section memberships from *which sheets they appear in* rather than from
// the sheet's own "Jeste li pridruženi..." text column, and treats any
// sheet-to-sheet disagreement on a person's data as an error rather than
// guessing which copy is right.
const { loadWorkbook, cellValue } = require('./excelWorkbook');
const { REQUIRED_HEADERS, parseMemberRow, toDateOnlyString } = require('./importMemberRow');
const { canonicalSectionName, createSectionNameLookup, sectionSheetNames } = require('./sectionNames');

const SECTION_SHEETS = ['_Bike', '_Disco', '_Dramska', '_Foto', '_Glazbena', '_Media', '_Pi', '_Comp', '_Tech', '_Video'];

// Fields compared across a person's occurrences to detect sheet-to-sheet
// disagreement. Deliberately excludes "Jeste li pridruženi nekoj drugoj
// sekciji?" - section membership is derived from sheet presence instead.
const COMPARE_FIELDS = [
  'Ime i prezime', 'Aktivan član', 'Datum rođenja', 'Datum učlanjenja', 'Trenutna vrsta članstva',
  'Datum postanka narančastim', 'Fakultet', 'Adresa prebivališta', 'Poštanski broj',
  'Kontakt broj mobitela', 'Privatna e-pošta', 'KSET e-pošta', 'Matična sekcija',
  'Veličina majice', 'Šifra iskaznice', 'Spol', 'Kako ste saznali za KSET?',
  'Jeste li pridruženi nekom timu?',
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
async function parseSectionSheets(buffer, lookups, existing) {
  const workbook = await loadWorkbook(buffer);
  const worksheetsBySection = new Map();
  const missingSheets = [];
  for (const sheetName of SECTION_SHEETS) {
    const sectionName = canonicalSectionName(sheetName.replace(/^_/, ''));
    const aliases = sectionSheetNames(sectionName);
    const worksheet = aliases
      .map((sheetName) => workbook.getWorksheet(sheetName))
      .find(Boolean)
      || workbook.worksheets.find((candidate) =>
        canonicalSectionName(candidate.name.replace(/^_/, '')) === sectionName
      );
    if (!worksheet) missingSheets.push(aliases[0]);
    else worksheetsBySection.set(sectionName, worksheet);
  }
  if (missingSheets.length > 0) {
    throw new Error(`Nedostaju listovi sekcija u datoteci (nazivi trenutni ili stari): ${missingSheets.join(', ')}`);
  }

  const sectionNameLookup = createSectionNameLookup(lookups.sections);
  const sectionByName = new Map(
    [...sectionNameLookup].map(([canonicalName, section]) => [canonicalName, section.id])
  );
  const teamByName = new Map(lookups.teams.map((t) => [t.name, t.id]));
  const drinkByName = new Map(lookups.drinks.map((d) => [d.name, d.id]));
  const facultyByName = new Map(lookups.faculties.map((f) => [f.name, f.id]));

  const occurrencesByOib = new Map();
  let totalRawRows = 0;

  for (const sheetName of SECTION_SHEETS) {
    const sectionName = canonicalSectionName(sheetName.replace(/^_/, ''));
    const worksheet = worksheetsBySection.get(sectionName);
    if (worksheet.rowCount === 0) continue;
    const headerRow = worksheet.getRow(1);
    const header = Array.from({ length: headerRow.cellCount }, (_, index) =>
      String(cellValue(headerRow.getCell(index + 1).value) || '').trim()
    )
      .map((h) => h === 'Adresa prebivališa' ? 'Adresa prebivališta' : h);
    const missingHeaders = REQUIRED_HEADERS.filter((h) => !header.includes(h));
    if (missingHeaders.length > 0) {
      throw new Error(`Nedostaju stupci u listu "${sheetName}": ${missingHeaders.join(', ')}`);
    }
    for (let rowNum = 2; rowNum <= worksheet.rowCount; rowNum++) {
      const excelRow = worksheet.getRow(rowNum);
      const row = {};
      header.forEach((h, idx) => { row[h] = cellValue(excelRow.getCell(idx + 1).value) ?? ''; });
      const personName = (row['Ime i prezime'] || '').toString().trim();
      if (!personName) continue;
      totalRawRows++;

      const oib = (row.OIB || '').toString().trim();
      const identityKey = oib ? `oib:${oib}` : `row:${sheetName}:${rowNum}`;
      if (!occurrencesByOib.has(identityKey)) occurrencesByOib.set(identityKey, []);
      occurrencesByOib.get(identityKey).push({ sheetName, rowNum, row });
    }
  }

  const result = {
    totalRows: totalRawRows,
    inactiveSkipped: 0,
    valid: [],
    updates: [],
    invalid: [],
    newDrinkNames: new Set(),
  };

  const batchOibs = new Set();
  const batchEmails = new Set();

  for (const occurrences of occurrencesByOib.values()) {
    const personName = (occurrences[0].row['Ime i prezime'] || '').toString().trim();
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
    const existingMember = existing.membersByOib?.get(data.oib);

    // Associated sections = every section sheet this person appears in,
    // minus their own home section.
    const sectionNames = [...new Set(occurrences.map((o) => canonicalSectionName(o.sheetName.replace(/^_/, ''))))]
      .filter((n) => n !== data.homeSectionName);
    const unresolvedSections = sectionNames.filter((n) => !sectionNameLookup.has(n));

    const errors = [];
    if (unresolvedSections.length > 0) errors.push(`Nepoznata pridružena sekcija: ${unresolvedSections.join(', ')}`);

    if (batchOibs.has(data.oib) || (!existingMember && existing.oibs.has(data.oib))) {
      errors.push('OIB se dupliciran (već postoji).');
    }
    if (!existingMember) {
      for (const email of [data.privateEmail, data.ksetEmail].filter(Boolean)) {
        if (batchEmails.has(email) || existing.privateEmails.has(email) || existing.ksetEmails.has(email)) {
          errors.push(`E-mail se duplicira: ${email}`);
        }
      }
    }

    if (errors.length > 0) {
      result.invalid.push({ personName, locations, errors });
      continue;
    }

    batchOibs.add(data.oib);
    if (existingMember) {
      if (!existingMember.referralSource && data.referralSource) {
        result.updates.push({
          memberId: existingMember.id,
          referralSource: data.referralSource,
          personName,
          locations,
        });
      }
      continue;
    }

    for (const name of data.drinkNames) {
      if (!drinkByName.has(name)) result.newDrinkNames.add(name);
    }
    if (data.privateEmail) batchEmails.add(data.privateEmail);
    if (data.ksetEmail) batchEmails.add(data.ksetEmail);

    result.valid.push({
      personName,
      locations,
      data: {
        ...data,
        sectionNames: sectionNames.map((name) => sectionNameLookup.get(name).name),
      },
    });
  }

  result.newDrinkNames = [...result.newDrinkNames];
  return result;
}

module.exports = { parseSectionSheets, SECTION_SHEETS };
