import { MEMBERSHIP_LEVEL_OPTIONS } from '../constants';

const LABELS = Object.fromEntries(MEMBERSHIP_LEVEL_OPTIONS.map(({ value, label }) => [value, label]));
const COLORS = {
  PRIDRUZENO: 'bg-blue-50 text-blue-800',
  PUNOPRAVNO: 'bg-orange-50 text-orange-800',
  POCASNO: 'bg-red-50 text-red-800',
  STARO: 'bg-gray-100 text-gray-700',
};

export default function MembershipLabel({ value }) {
  return (
    <span className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${COLORS[value] || 'bg-gray-100 text-gray-700'}`}>
      {LABELS[value] || value || '-'}
    </span>
  );
}