// Parses sheet "C" of the legacy KSET Excel registar - honorary members,
// tracked by name only (Prezime / Ime columns). `existingNames` is a Set of
// "firstName|||lastName" (lowercased) already in the DB, used to skip exact
// re-imports if this is run more than once against overlapping data.
const XLSX = require('xlsx');

function nameKey(firstName, lastName) {
  return `${firstName.toLowerCase()}|||${lastName.toLowerCase()}`;
}

function parseHonoraryBuffer(buffer, existingNames) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  if (!wb.SheetNames.includes('C')) {
    return { totalRows: 0, valid: [], duplicateSkipped: 0 };
  }
  const ws = wb.Sheets['C'];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const dataRows = rows
    .slice(1)
    .filter((r) => (r[0] && r[0].toString().trim()) || (r[1] && r[1].toString().trim()));

  const result = { totalRows: dataRows.length, valid: [], duplicateSkipped: 0 };
  const seenInBatch = new Set();

  for (const r of dataRows) {
    const lastName = (r[0] || '').toString().trim();
    const firstName = (r[1] || '').toString().trim();
    if (!firstName || !lastName) continue;

    const key = nameKey(firstName, lastName);
    if (existingNames.has(key) || seenInBatch.has(key)) {
      result.duplicateSkipped++;
      continue;
    }
    seenInBatch.add(key);
    result.valid.push({ firstName, lastName });
  }

  return result;
}

module.exports = { parseHonoraryBuffer, nameKey };
