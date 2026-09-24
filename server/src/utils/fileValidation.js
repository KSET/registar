// Validates actual file content, not just the client-supplied MIME type -
// multer's fileFilter only sees the Content-Type header the uploader sent,
// which is fully attacker-controlled and proves nothing about the bytes.

const PDF_MAGIC = Buffer.from('%PDF-', 'ascii');
const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]); // .xlsx is a zip container

function isPdfBuffer(buffer) {
  return Buffer.isBuffer(buffer) && buffer.subarray(0, 5).equals(PDF_MAGIC);
}

function isXlsxBuffer(buffer) {
  return Buffer.isBuffer(buffer) && buffer.subarray(0, 4).equals(ZIP_MAGIC);
}

module.exports = { isPdfBuffer, isXlsxBuffer };
