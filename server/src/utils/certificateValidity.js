function nextCertificateValidUntil(now = new Date()) {
  let year = now.getFullYear();
  const september30 = new Date(year, 8, 30);
  if (now > september30) year += 1;
  return new Date(Date.UTC(year, 9, 1));
}

module.exports = { nextCertificateValidUntil };