export function formatAddress(member) {
  const street = [member.address, member.houseNumber].filter(Boolean).join(' ');
  const locality = [member.postalCode, member.city].filter(Boolean).join(' ');
  return [street, locality].filter(Boolean).join(', ') || '-';
}