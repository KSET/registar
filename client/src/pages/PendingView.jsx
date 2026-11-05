import { FIELD_LABELS, fieldOrderIndex } from '../constants';
import { formatDate } from '../date';
import { useLookupData } from '../useLookupData';
import MembershipLabel from '../components/MembershipLabel';
import { PageContainer, Card, Alert } from '../components/ui';
import PendingRefillForm from './PendingRefillForm';

function truncate(s, n = 30) {
  if (!s) return '';
  return s.length > n ? s.slice(0, n) + '...' : s;
}

function displayValue(key, value) {
  if (['dateOfBirth', 'memberSince', 'fullMemberSince'].includes(key)) return formatDate(value);
  if (key === 'certificatePath') return truncate(String(value ?? ''), 30) || '-';
  if (Array.isArray(value)) return value.join(', ') || '-';
  if (typeof value === 'boolean') return value ? 'Da' : 'Ne';
  return String(value ?? '') || '-';
}

function StatusBadge({ status }) {
  const map = {
    PENDING: { label: 'Na čekanju', cls: 'bg-brand-orange/15 text-brand-orange' },
    APPROVED: { label: 'Odobreno', cls: 'bg-state-success/15 text-state-success' },
    REJECTED: { label: 'Odbijeno', cls: 'bg-state-error/15 text-state-error' },
  };
  const s = map[status] || map.PENDING;
  return <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${s.cls}`}>{s.label}</span>;
}

// Spoji facultyId i facultyOther u jedan redak "Fakultet" koji prikazuje ono
// što je član poslao: naziv odabranog fakulteta (po bazi) ili vlastiti unos.
// Status spojenog retka: REJECTED ako je bilo koje odbijeno, pa PENDING ako
// bilo koje čeka, inače APPROVED.
function buildRows(data, status, facultyMap) {
  const hasFaculty = 'facultyId' in data || 'facultyOther' in data;
  const rows = Object.entries(data)
    .filter(([key]) => key !== 'facultyId' && key !== 'facultyOther')
    .map(([key, value]) => ({ key, value, status: status[key] || 'PENDING' }));

  if (hasFaculty) {
    const facultyStatuses = [status.facultyId, status.facultyOther].filter(Boolean);
    const mergedStatus = facultyStatuses.includes('REJECTED')
      ? 'REJECTED'
      : facultyStatuses.includes('PENDING')
        ? 'PENDING'
        : facultyStatuses[0] || 'PENDING';
    rows.push({
      key: 'faculty',
      value: data.facultyId != null ? (facultyMap[data.facultyId] || data.facultyId) : data.facultyOther,
      status: mergedStatus,
    });
  }

  return rows.sort((a, b) => fieldOrderIndex(a.key) - fieldOrderIndex(b.key));
}

export default function PendingView({ pending, onUpdated }) {
  const lookups = useLookupData();
  const data = pending.fieldData;
  const status = pending.fieldStatus;

  const fieldsToRefill = Object.entries(status)
    .filter(([key, s]) => s === 'REJECTED' && !['membershipLevel', 'cardNumber', 'memberSince'].includes(key))
    .map(([key]) => key);

  if (fieldsToRefill.length > 0) {
    return <PendingRefillForm pending={pending} fieldsToRefill={fieldsToRefill} onUpdated={onUpdated} />;
  }

  const facultyMap = Object.fromEntries(lookups.faculties.map((f) => [f.id, f.name]));
  const rows = buildRows(data, status, facultyMap);

  return (
    <PageContainer title="Prijava na čekanju">
      <Alert kind="info">
        Voditelj sekcije <strong>{pending.homeSection?.name}</strong> mora odobriti vašu prijavu.
        Dok se to ne dogodi, podatke ne možete uređivati.
      </Alert>

      <Card>
        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>Polje</th>
                <th>Vrijednost</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ key, value, status: rowStatus }) => (
                <tr key={key}>
                  <td className="text-content-secondary">{FIELD_LABELS[key] || key}</td>
                  <td>{key === 'membershipLevel' ? <MembershipLabel value={value} /> : displayValue(key, value)}</td>
                  <td><StatusBadge status={rowStatus} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </PageContainer>
  );
}
