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
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  const today = new Date();
  date.setUTCHours(0, 0, 0, 0);
  today.setUTCHours(0, 0, 0, 0);
  return date >= today;
}