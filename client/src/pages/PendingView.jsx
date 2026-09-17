import { FIELD_LABELS } from '../constants';
import { thStyle, tdStyle } from '../styles';
import PendingRefillForm from './PendingRefillForm';

export default function PendingView({ pending, onUpdated }) {
  const data = pending.fieldData;
  const status = pending.fieldStatus;

  // Fields still PENDING with an empty value need refilling.

  const fieldsToRefill = Object.entries(status)
    .filter(([key, s]) => {
      if (key === 'associationEmail') return false;
      if (s !== 'PENDING') return false;
      const val = data[key];
      if (Array.isArray(val)) return val.length === 0;
      if (typeof val === 'boolean') return val === false;
      return !val || val === '';
    })
    .map(([key]) => key);

  const hasFieldsToRefill = fieldsToRefill.length > 0;

  if (hasFieldsToRefill) {
    return <PendingRefillForm pending={pending} fieldsToRefill={fieldsToRefill} onUpdated={onUpdated} />;
  }

  return (
    <div style={{ padding: '2rem' }}>
      <h2>Vaša prijava čeka odobrenje</h2>
      <p>Voditelj sekcije <strong>{pending.homeSection?.name}</strong> mora odobriti vašu prijavu.</p>
      <br />
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr>
            <th style={thStyle}>Polje</th>
            <th style={thStyle}>Vrijednost</th>
            <th style={thStyle}>Status</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(data).map(([key, value]) => {
            const fieldLabel = FIELD_LABELS[key] || key;
            const displayValue = Array.isArray(value) ? value.join(', ') : String(value ?? '');
            const fieldSt = status[key] || 'PENDING';
            return (
              <tr key={key}>
                <td style={tdStyle}>{fieldLabel}</td>
                <td style={tdStyle}>{displayValue}</td>
                <td style={tdStyle}>
                  {fieldSt === 'PENDING' ? 'Na čekanju' : fieldSt === 'APPROVED' ? 'Odobreno' : 'Odbijeno'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
