import { FIELD_LABELS } from '../constants';
import { PageContainer, Card, Alert } from '../components/ui';
import PendingRefillForm from './PendingRefillForm';

function displayValue(value) {
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

export default function PendingView({ pending, onUpdated }) {
  const data = pending.fieldData;
  const status = pending.fieldStatus;

  const fieldsToRefill = Object.entries(status)
    .filter(([, s]) => s === 'REJECTED')
    .map(([key]) => key);

  if (fieldsToRefill.length > 0) {
    return <PendingRefillForm pending={pending} fieldsToRefill={fieldsToRefill} onUpdated={onUpdated} />;
  }

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
              {Object.entries(data).map(([key, value]) => (
                <tr key={key}>
                  <td className="text-content-secondary">{FIELD_LABELS[key] || key}</td>
                  <td>{displayValue(value)}</td>
                  <td><StatusBadge status={status[key] || 'PENDING'} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </PageContainer>
  );
}
