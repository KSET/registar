import { useState, useEffect } from 'react';
import { authHeaders, jsonHeaders, openCertificate, openPendingCertificate } from '../api/auth';
import { useLookupData } from '../useLookupData';
import { FIELD_LABELS, MEMBERSHIP_LEVEL_OPTIONS, DIET_TYPE_OPTIONS, GENDER_OPTIONS, fieldOrderIndex } from '../constants';
import { PageContainer, Card, Alert, ConfirmDialog } from '../components/ui';

const MEMBERSHIP_LABELS = Object.fromEntries(MEMBERSHIP_LEVEL_OPTIONS.map((o) => [o.value, o.label]));
const DIET_LABELS = Object.fromEntries(DIET_TYPE_OPTIONS.map((o) => [o.value, o.label]));
const GENDER_LABELS = Object.fromEntries(GENDER_OPTIONS.map((o) => [o.value, o.label]));

export default function ApprovalDashboard() {
  const lookups = useLookupData();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedKey, setExpandedKey] = useState(null);
  const [decisions, setDecisions] = useState({});
  const [message, setMessage] = useState('');
  const [confirmReq, setConfirmReq] = useState(null);

  // ID -> name maps for human-readable values (stavka 17)
  const nameMaps = {
    sectionIds: Object.fromEntries(lookups.sections.map((s) => [s.id, s.name])),
    teamIds: Object.fromEntries(lookups.teams.map((t) => [t.id, t.name])),
    drinkIds: Object.fromEntries(lookups.drinks.map((d) => [d.id, d.name])),
    allergyIds: Object.fromEntries(lookups.allergies.map((a) => [a.id, a.name])),
  };
  const homeSectionMap = Object.fromEntries(lookups.sections.map((s) => [s.id, s.name]));
  const facultyMap = Object.fromEntries(lookups.faculties.map((f) => [f.id, f.name]));

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

  const buildRequests = (applications, fieldChanges) => {
    const appReqs = applications.map((p) => {
      const pendingFields = Object.entries(p.fieldStatus)
        .filter(([, s]) => s === 'PENDING')
        .map(([name]) => ({ name, value: p.fieldData[name] }))
        .sort((a, b) => fieldOrderIndex(a.name) - fieldOrderIndex(b.name));
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
      memberId: c.member.id,
      personName: `${c.member.firstName} ${c.member.lastName}`,
      email: c.member.ksetEmail || c.member.privateEmail,
      section: c.member.homeSection?.name || '-',
      date: c.createdAt,
      fields: [{ name: c.fieldName, value: c.newValue }],
    }));

    return [...appReqs, ...fcReqs].sort((a, b) => new Date(a.date) - new Date(b.date));
  };

  const displayValue = (fieldName, value) => {
    if (fieldName === 'membershipLevel') return MEMBERSHIP_LABELS[value] || value;
    if (fieldName === 'dietType') return DIET_LABELS[value] || value;
    if (fieldName === 'gender') return GENDER_LABELS[value] || value;
    if (fieldName === 'homeSectionId') return homeSectionMap[value] || value;
    if (fieldName === 'facultyId') return facultyMap[value] || value;
    if (fieldName === 'acceptedDocuments') return value ? 'Da' : 'Ne';
    if (nameMaps[fieldName]) {
      const arr = Array.isArray(value) ? value : [];
      return arr.map((id) => nameMaps[fieldName][id] || id).join(', ') || '-';
    }
    if (Array.isArray(value)) return value.join(', ') || '-';
    return String(value ?? '') || '-';
  };

  const expand = (req) => {
    if (expandedKey === req.key) {
      setExpandedKey(null);
      setDecisions({});
      return;
    }
    setExpandedKey(req.key);
    setMessage('');
    // Default: nothing decided (stavka 16)
    const initial = {};
    for (const f of req.fields) initial[f.name] = null;
    setDecisions(initial);
  };

  const setDecision = (fieldName, value) => {
    setDecisions((prev) => ({ ...prev, [fieldName]: value }));
  };

  const expandedReq = requests.find((r) => r.key === expandedKey);
  const allDecided = expandedReq
    ? expandedReq.fields.every((f) => decisions[f.name] === 'APPROVED' || decisions[f.name] === 'REJECTED')
    : false;

  const doSubmit = async () => {
    const req = confirmReq;
    setConfirmReq(null);
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

  if (loading) {
    return <PageContainer title="Zahtjevi za odobrenje"><p className="text-content-secondary">Učitavanje...</p></PageContainer>;
  }

  return (
    <PageContainer title="Zahtjevi za odobrenje" maxWidth="max-w-5xl">
      {message && <Alert kind="success">{message}</Alert>}

      {requests.length === 0 && (
        <Card><p className="text-content-secondary">Nema zahtjeva na čekanju.</p></Card>
      )}

      <div className="space-y-3">
        {requests.map((r) => (
          <Card key={r.key} className="!mb-0 !p-0 overflow-hidden">
            <button
              onClick={() => expand(r)}
              className="w-full flex items-center justify-between px-5 py-4 hover:bg-surface-overlay transition-colors text-left"
            >
              <div>
                <div className="font-medium">{r.personName}</div>
                <div className="text-sm text-content-secondary">{r.email} · {r.section}</div>
              </div>
              <div className="flex items-center gap-4">
                <span className={`text-xs px-2 py-1 rounded ${r.type === 'application' ? 'bg-brand-orange/15 text-brand-orange' : 'bg-surface-overlay text-content-secondary'}`}>
                  {r.type === 'application' ? 'Nova prijava' : 'Promjena podataka'}
                </span>
                <span className="text-sm text-content-muted">{r.fields.length} polja</span>
                <span className="text-content-muted">{expandedKey === r.key ? '▲' : '▼'}</span>
              </div>
            </button>

            {expandedKey === r.key && (
              <div className="border-t border-surface-border px-5 py-4">
                <div className="overflow-x-auto">
                  <table className="table-base mb-4">
                    <thead>
                      <tr>
                        <th>Polje</th>
                        <th>Vrijednost</th>
                        <th className="text-right">Odluka</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.fields.map((f) => (
                        <tr key={f.name}>
                          <td className="text-content-secondary">{FIELD_LABELS[f.name] || f.name}</td>
                          <td>
                            {f.name === 'certificatePath' ? (
                              <button
                                type="button"
                                className="text-brand-orange hover:underline"
                                onClick={() =>
                                  (r.type === 'application'
                                    ? openPendingCertificate(r.id)
                                    : openCertificate(r.memberId, true)
                                  ).catch((e) => setMessage(e.message))
                                }
                              >Otvori PDF
                              </button>
                            ) : (
                              displayValue(f.name, f.value)
                            )}
                          </td>
                          <td>
                            <div className="flex gap-2 justify-end">
                              <button
                                type="button"
                                onClick={() => setDecision(f.name, 'APPROVED')}
                                className={decisions[f.name] === 'APPROVED' ? 'btn-decision-approve-active' : 'btn-decision-approve'}
                              >
                                Prihvati
                              </button>
                              <button
                                type="button"
                                onClick={() => setDecision(f.name, 'REJECTED')}
                                className={decisions[f.name] === 'REJECTED' ? 'btn-decision-reject-active' : 'btn-decision-reject'}
                              >
                                Odbij
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-xs text-content-muted">
                    {allDecided ? 'Sva polja su odlučena.' : 'Odlučite za svako polje prije slanja.'}
                  </span>
                  <button
                    type="button"
                    disabled={!allDecided}
                    onClick={() => setConfirmReq(r)}
                    className="btn-primary"
                  >
                    Pošalji odluke
                  </button>
                </div>
              </div>
            )}
          </Card>
        ))}
      </div>

      <ConfirmDialog
        open={!!confirmReq}
        title="Potvrda odluka"
        message="Jeste li sigurni da želite poslati ove odluke? Ova akcija se ne može poništiti."
        onConfirm={doSubmit}
        onCancel={() => setConfirmReq(null)}
      />
    </PageContainer>
  );
}
