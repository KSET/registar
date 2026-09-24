const XLSX = require('xlsx');
const fs = require('fs');
const buffer = fs.readFileSync('/tmp/registar.xlsx');
const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });

for (const name of ['_Bike', '_Comp']) {
  const ws = wb.Sheets[name];
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  console.log(`\n=== ${name} ===`);
  console.log('header:', raw[0]);
  console.log('row2:', raw[1]);
  console.log('row3:', raw[2]);
  console.log('total rows:', raw.length);
}
