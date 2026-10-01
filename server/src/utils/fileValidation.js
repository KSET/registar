// Validates actual file content, not just the client-supplied MIME type -
// multer's fileFilter only sees the Content-Type header the uploader sent,
// which is fully attacker-controlled and proves nothing about the bytes.

const PDF_MAGIC = Buffer.from('%PDF-', 'ascii');
const PDF_DATA_URL_PREFIX = Buffer.from('data:application/pdf;base64,', 'ascii');
const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]); // .xlsx is a zip container

function normalizePdfBuffer(buffer) {
  if (!Buffer.isBuffer(buffer)) return buffer;
  if (buffer.subarray(0, PDF_DATA_URL_PREFIX.length).equals(PDF_DATA_URL_PREFIX)) {
    return buffer.subarray(PDF_DATA_URL_PREFIX.length);
  }
  return buffer;
}

function isPdfBuffer(buffer) {
  const normalized = normalizePdfBuffer(buffer);
  return Buffer.isBuffer(normalized) && normalized.subarray(0, PDF_MAGIC.length).equals(PDF_MAGIC);
}

function isXlsxBuffer(buffer) {
  return Buffer.isBuffer(buffer) && buffer.subarray(0, 4).equals(ZIP_MAGIC);
}

module.exports = { isPdfBuffer, normalizePdfBuffer, isXlsxBuffer };
