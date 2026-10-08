function nextCertificateValidUntil(now = new Date()) {
  return new Date(Date.UTC(now.getFullYear() + 1, 9, 1));
}

module.exports = { nextCertificateValidUntil };