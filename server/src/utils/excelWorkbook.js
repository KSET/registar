const ExcelJS = require('exceljs');

async function loadWorkbook(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  return workbook;
}

function cellValue(value) {
  if (value instanceof Date || value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;
  if ('result' in value) return cellValue(value.result);
  if (Array.isArray(value.richText)) return value.richText.map((part) => part.text).join('');
  if (typeof value.text === 'string') return value.text;
  return '';
}

module.exports = { loadWorkbook, cellValue };
