// Parses sheet "C" of the legacy KSET Excel registar - honorary members,
// tracked by name only (Prezime / Ime columns). `existingNames` is a Set of
// "firstName|||lastName" (lowercased) already in the DB, used to skip exact
// re-imports if this is run more than once against overlapping data.
const { loadWorkbook, cellValue } = require('./excelWorkbook');

function nameKey(firstName, lastName) {
  return `${firstName.toLowerCase()}|||${lastName.toLowerCase()}`;
}

async function parseHonoraryBuffer(buffer, existingNames) {
  const workbook = await loadWorkbook(buffer);
  const worksheet = workbook.getWorksheet('C');
  if (!worksheet) {
    return { totalRows: 0, valid: [], duplicateSkipped: 0 };
  }
  const dataRows = [];
  for (let rowNum = 2; rowNum <= worksheet.rowCount; rowNum++) {
    const row = worksheet.getRow(rowNum);
    const lastName = String(cellValue(row.getCell(1).value) || '').trim();
    const firstName = String(cellValue(row.getCell(2).value) || '').trim();
    if (lastName || firstName) dataRows.push([lastName, firstName]);
  }

  const result = { totalRows: dataRows.length, valid: [], duplicateSkipped: 0 };
  const seenInBatch = new Set();

  for (const r of dataRows) {
    const [lastName, firstName] = r;
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
