function isValidOib(oib) {
  if (!/^\d{11}$/.test(oib || '')) return false;
  let remainder = 10;
  for (let i = 0; i < 10; i++) {
    remainder = (remainder + parseInt(oib[i], 10)) % 10;
    if (remainder === 0) remainder = 10;
    remainder = (remainder * 2) % 11;
  }
  const checkDigit = (11 - remainder) % 10;
  return checkDigit === parseInt(oib[10], 10);
}

module.exports = { isValidOib };
