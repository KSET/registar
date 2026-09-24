const XLSX = require('xlsx');
const fs = require('fs');
const buffer = fs.readFileSync('/tmp/registar.xlsx');
const wb = XLSX.read(buffer, { type: 'buffer' });
console.log(wb.SheetNames);
