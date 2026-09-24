const XLSX = require('xlsx');
const fs = require('fs');
const buffer = fs.readFileSync('/tmp/registar.xlsx');
const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });

const SECTION_SHEETS = ['_Bike', '_Disco', '_Dramska', '_Foto', '_Glazbena', '_Media', '_Pi', '_Comp', '_Tech', '_Video'];

const nameToSheets = new Map();
let totalAcrossSheets = 0;

for (const sheetName of SECTION_SHEETS) {
  const ws = wb.Sheets[sheetName];
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const header = raw[0].map((h) => (h || '').toString().trim());
  const nameCol = header.indexOf('Ime i prezime');
  const homeCol = header.indexOf('Matična sekcija');
  const assocCol = header.indexOf('Jeste li pridruženi nekoj drugoj sekciji?');
  const dataRows = raw.slice(1).filter((r) => (r[nameCol] || '').toString().trim());
  totalAcrossSheets += dataRows.length;
  for (const r of dataRows) {
    const name = (r[nameCol] || '').toString().trim();
    const home = (r[homeCol] || '').toString().trim();
    const assoc = (r[assocCol] || '').toString().trim();
    if (!nameToSheets.has(name)) nameToSheets.set(name, []);
    nameToSheets.get(name).push({ sheet: sheetName, home, assoc });
  }
}

console.log('Total rows summed across the 10 section sheets:', totalAcrossSheets);

// _Svi total for comparison
const wsSvi = wb.Sheets['_Svi'];
const rawSvi = XLSX.utils.sheet_to_json(wsSvi, { header: 1, defval: '' });
const headerSvi = rawSvi[0].map((h) => (h || '').toString().trim());
const nameColSvi = headerSvi.indexOf('Ime i prezime');
const sviDataRows = rawSvi.slice(1).filter((r) => (r[nameColSvi] || '').toString().trim());
console.log('_Svi total rows:', sviDataRows.length);

console.log('\nNames appearing in MORE than one section sheet:');
let dupCount = 0;
for (const [name, occurrences] of nameToSheets.entries()) {
  if (occurrences.length > 1) {
    dupCount++;
    if (dupCount <= 15) {
      console.log(name, JSON.stringify(occurrences));
    }
  }
}
console.log('Total names appearing in >1 section sheet:', dupCount);
