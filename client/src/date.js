export function formatDate(value) {
  if (!value) return '-';

  const isoDate = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
  if (isoDate) {
    const [, year, month, day] = isoDate;
    return `${Number(day)}. ${Number(month)}. ${year}.`;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return `${date.getDate()}. ${date.getMonth() + 1}. ${date.getFullYear()}.`;
}

export function isDateOnOrAfterToday(value) {
  if (!value) return false;
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
  const today = new Date();

  if (dateOnly) {
    const [, year, month, day] = dateOnly.map(Number);
    const valueDate = new Date(Date.UTC(year, month - 1, day));
    if (valueDate.getUTCFullYear() !== year
      || valueDate.getUTCMonth() !== month - 1
      || valueDate.getUTCDate() !== day) return false;
    return valueDate.getTime() >= Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
    >= Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
}