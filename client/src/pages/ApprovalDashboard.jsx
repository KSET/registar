import { useState, useEffect } from 'react';
import { authHeaders, jsonHeaders } from '../api/auth';
import { FIELD_LABELS, MEMBERSHIP_LEVEL_OPTIONS } from '../constants';
import { thStyle, tdStyle } from '../styles';

const MEMBERSHIP_LABELS = Object.fromEntries(
  MEMBERSHIP_LEVEL_OPTIONS.map((o) => [o.value, o.label])
);

function displayValue(fieldName, value) {
  if (fieldName === 'membershipLevel') return MEMBERSHIP_LABELS[value] || value;
  if (Array.isArray(value)) return value.join(', ');
  return String(value ?? '');
}

// Normalizes both sources into a common request shape:
// { key, type, personName, email, section, date, fields: [{ name, value }] }
function buildRequests(applications, fieldChanges) {
  const appReqs = applications.map((p) => {
    const pendingFields = Object.entries(p.fieldStatus)
      .filter(([, s]) => s === 'PENDING')
      .map(([name]) => ({ name, value: p.fieldData[name] }));

    return {
      key: `app-${p.id}`,
      type: 'application',
      id: p.id,
      personName: `${p.fieldData.firstName || ''} ${p.fieldData.lastName || ''}`.trim() || '(nepoznato)',
      email: p.googleEmail,
      section: p.homeSection?.name || '-',
      date: p.createdAt,
      fields: pendingFields,
    };
  });

  const fcReqs = fieldChanges.map((c) => ({
    key: `fc-${c.id}`,
    type: 'fieldChange',
    id: c.id,
    personName: `${c.member.firstName} ${c.member.lastName}`,
    email: c.member.associationEmail || c.member.privateEmail,
    section: c.member.homeSection?.name || '-',
    date: c.createdAt,
    fields: [{ name: c.fieldName, value: c.newValue }],
  }));

  return [...appReqs, ...fcReqs].sort((a, b) => new Date(a.date) - new Date(b.date));
}

export default function ApprovalDashboard() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedKey, setExpandedKey] = useState(null);
  const [decisions, setDecisions] = useState({});
  const [message, setMessage] = useState('');

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [pRes, fRes] = await Promise.all([
        fetch('/api/pending/section', { headers: authHeaders() }),
        fetch('/api/field-changes', { headers: authHeaders() }),
      ]);
      const applications = pRes.ok ? await pRes.json() : [];
      const fieldChanges = fRes.ok ? await fRes.json() : [];
      setRequests(buildRequests(applications, fieldChanges));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const expand = (req) => {
    if (expandedKey === req.key) {
      // Collapse if already open
      setExpandedKey(null);
      setDecisions({});
      return;
    }
    setExpandedKey(req.key);
    setMessage('');
    // Default all decisions to APPROVED
    const initial = {};
    for (const f of req.fields) {
      initial[f.name] = 'APPROVED';
    }
    setDecisions(initial);
  };

  const toggleDecision = (fieldName) => {
    setDecisions((prev) => ({
      ...prev,
      [fieldName]: prev[fieldName] === 'APPROVED' ? 'REJECTED' : 'APPROVED',
    }));
  };

  const submit = async (req) => {
    setMessage('');
    try {
      let res;
      if (req.type === 'application') {
        res = await fetch(`/api/pending/${req.id}/review`, {
          method: 'PATCH',
          headers: jsonHeaders(),
          body: JSON.stringify({ decisions }),
        });
      } else {
        // fieldChange - single decision
        const decision = decisions[req.fields[0].name];
        res = await fetch(`/api/field-changes/${req.id}/review`, {
          method: 'PATCH',
          headers: jsonHeaders(),
          body: JSON.stringify({ decision }),
        });
      }

      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error || 'Greška pri slanju.');
        return;
      }

      setMessage(data.message);
      setExpandedKey(null);
      setDecisions({});
      loadAll();
    } catch (err) {
      setMessage('Mrežna greška.');
    }
  };

  if (loading) return <p style={{ padding: '2rem' }}>Učitavanje zahtjeva...</p>;

  return (
    <div style={{ padding: '2rem' }}>
      <h2>Zahtjevi za odobrenje</h2>

      {message && <p>{message}</p>}

      {requests.length === 0 && <p>Nema zahtjeva na čekanju.</p>}

      {requests.length > 0 && (
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr>
              <th style={thStyle}>Osoba</th>
              <th style={thStyle}>E-mail</th>
              <th style={thStyle}>Sekcija</th>
              <th style={thStyle}>Tip zahtjeva</th>
              <th style={thStyle}>Datum</th>
              <th style={thStyle}>Broj polja</th>
            </tr>
          </thead>
          <tbody>
            {requests.map((req) => (
              <>
                <tr
                  key={req.key}
                  onClick={() => expand(req)}
                  style={{ cursor: 'pointer' }}
                >
                  <td style={tdStyle}>{req.personName}</td>
                  <td style={tdStyle}>{req.email}</td>
                  <td style={tdStyle}>{req.section}</td>
                  <td style={tdStyle}>
                    {req.type === 'application' ? 'Nova prijava' : 'Promjena podataka'}
                  </td>
                  <td style={tdStyle}>{new Date(req.date).toLocaleDateString('hr')}</td>
                  <td style={tdStyle}>{req.fields.length}</td>
                </tr>

                {expandedKey === req.key && (
                  <tr key={`${req.key}-detail`}>
                    <td style={tdStyle} colSpan={6}>
                      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                        <thead>
                          <tr>
                            <th style={thStyle}>Polje</th>
                            <th style={thStyle}>Vrijednost</th>
                            <th style={thStyle}>Odluka</th>
                          </tr>
                        </thead>
                        <tbody>
                          {req.fields.map((f) => (
                            <tr key={f.name}>
                              <td style={tdStyle}>{FIELD_LABELS[f.name] || f.name}</td>
                              <td style={tdStyle}>{displayValue(f.name, f.value)}</td>
                              <td style={tdStyle}>
                                <button onClick={() => toggleDecision(f.name)}>
                                  {decisions[f.name] === 'APPROVED' ? 'Prihvaćam' : 'Odbijam'}
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <br />
                      <button onClick={() => submit(req)}>Pošalji odluke</button>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
