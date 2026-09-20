import { useState, useEffect } from 'react';
import { authHeaders, jsonHeaders } from '../api/auth';
import { useLookupData } from '../useLookupData';
import { MEMBERSHIP_LEVEL_OPTIONS, DIET_TYPE_OPTIONS } from '../constants';
import { PageContainer, Card, Alert, ConfirmDialog } from '../components/ui';

const MEMBERSHIP_LABELS = Object.fromEntries(MEMBERSHIP_LEVEL_OPTIONS.map((o) => [o.value, o.label]));
const DIET_LABELS = Object.fromEntries(DIET_TYPE_OPTIONS.map((o) => [o.value, o.label]));
const ROLE_LABELS = {
  CLAN: 'Član',
  VODITELJ_SEKCIJE: 'Voditelj sekcije',
  ADMINISTRATOR: 'Administrator',
};

function formatDate(d) {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('hr');
}

function facultyDisplay(m) {
  return m.faculty?.name || m.facultyOther || '-';
}

export default function MembersList({ isAdmin }) {
  const lookups = useLookupData();
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/members', { headers: authHeaders() });
      if (res.ok) setMembers(await res.json());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const filtered = members.filter((m) => {
    const q = search.toLowerCase();
    return (
      `${m.firstName} ${m.lastName}`.toLowerCase().includes(q) ||
      (m.ksetEmail || '').toLowerCase().includes(q) ||
      (m.privateEmail || '').toLowerCase().includes(q)
    );
  });

  if (loading) {
    return <PageContainer title="Članovi"><p className="text-content-secondary">Učitavanje...</p></PageContainer>;
  }

  if (selected) {
    return (
      <MemberDetail
        member={selected}
        isAdmin={isAdmin}
        sections={lookups.sections}
        onBack={() => { setSelected(null); }}
        onRoleChanged={() => { setSelected(null); load(); }}
        setMessage={setMessage}
      />
    );
  }

  return (
    <PageContainer title="Članovi" maxWidth="max-w-5xl">
      {message && <Alert kind="success">{message}</Alert>}

      <div className="mb-4">
        <input
          className="input max-w-sm"
          placeholder="Pretraži po imenu ili e-mailu..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Desktop */}
      <Card className="!p-0 overflow-hidden hidden md:block">
        <table className="table-base">
          <thead>
            <tr>
              <th>Ime i prezime</th>
              <th>KSET e-mail</th>
              <th>Telefon</th>
              <th>Matična sekcija</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={5} className="text-content-muted">Nema članova.</td></tr>
            )}
            {filtered.map((m) => (
              <tr key={m.id} className="hover:bg-surface-overlay cursor-pointer" onClick={() => setSelected(m)}>
                <td>{m.firstName} {m.lastName}</td>
                <td>{m.ksetEmail || '-'}</td>
                <td>{m.phone}</td>
                <td>{m.homeSection?.name || '-'}</td>
                <td className="text-brand-orange text-sm">Detalji →</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/* Mobile */}
      <div className="md:hidden space-y-3">
        {filtered.length === 0 && (
          <Card><p className="text-content-muted">Nema članova.</p></Card>
        )}
        {filtered.map((m) => (
          <Card key={m.id} className="!mb-0 cursor-pointer hover:bg-surface-overlay" >
            <div onClick={() => setSelected(m)}>
              <div className="font-medium mb-1">{m.firstName} {m.lastName}</div>
              <div className="text-sm text-content-secondary">{m.ksetEmail || m.privateEmail || '-'}</div>
              <div className="text-sm text-content-secondary">{m.phone}</div>
              <div className="text-sm text-content-muted mt-1">{m.homeSection?.name || '-'}</div>
              <div className="text-brand-orange text-sm mt-2">Detalji →</div>
            </div>
          </Card>
        ))}
      </div>

    </PageContainer>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="flex justify-between gap-4 py-2 border-b border-surface-border last:border-0">
      <span className="text-content-secondary text-sm">{label}</span>
      <span className="text-content-primary text-sm text-right">{value ?? '-'}</span>
    </div>
  );
}

function MemberDetail({ member, isAdmin, sections, onBack, onRoleChanged, setMessage }) {
  const [role, setRole] = useState(member.appRole || 'CLAN');
  const [managedSectionId, setManagedSectionId] = useState(member.managedSectionId ? String(member.managedSectionId) : '');
  const [error, setError] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);

  const isLimited = member.limited;

  const submitRole = async () => {
    setConfirmOpen(false);
    setError('');
    try {
      const res = await fetch(`/api/members/${member.id}/role`, {
        method: 'PATCH',
        headers: jsonHeaders(),
        body: JSON.stringify({
          appRole: role,
          managedSectionId: role === 'VODITELJ_SEKCIJE' ? managedSectionId : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Greška pri promjeni uloge.');
        return;
      }
      setMessage('Uloga je promijenjena.');
      onRoleChanged();
    } catch (err) {
      setError('Mrežna greška.');
    }
  };

  return (
    <PageContainer title={`${member.firstName} ${member.lastName}`}>
      <button onClick={onBack} className="btn-ghost mb-4">← Natrag na popis</button>

      {error && <Alert kind="error">{error}</Alert>}

      {isLimited ? (
        <Card title="Osnovni podatci">
          <InfoRow label="Ime" value={member.firstName} />
          <InfoRow label="Prezime" value={member.lastName} />
          <InfoRow label="KSET e-mail" value={member.ksetEmail} />
          <InfoRow label="Privatni e-mail" value={member.privateEmail} />
          <InfoRow label="Telefon" value={member.phone} />
          <InfoRow label="Matična sekcija" value={member.homeSection?.name} />
          <p className="text-xs text-content-muted mt-3">
            Ovaj član nije u vašoj sekciji, pa vidite samo osnovne podatke.
          </p>
        </Card>
      ) : (
        <>
          <Card title="Osobni podatci">
            <InfoRow label="Ime" value={member.firstName} />
            <InfoRow label="Prezime" value={member.lastName} />
            <InfoRow label="OIB" value={member.oib} />
            <InfoRow label="Datum rođenja" value={formatDate(member.dateOfBirth)} />
            <InfoRow label="Spol" value={member.gender === 'M' ? 'Muški' : 'Ženski'} />
            <InfoRow label="Adresa" value={member.address} />
            <InfoRow label="Fakultet" value={facultyDisplay(member)} />
            <InfoRow label="Telefon" value={member.phone} />
            <InfoRow label="Privatni e-mail" value={member.privateEmail} />
            <InfoRow label="KSET e-mail" value={member.ksetEmail} />
          </Card>

          <Card title="Članstvo">
            <InfoRow label="Datum učlanjenja" value={formatDate(member.memberSince)} />
            <InfoRow label="Broj iskaznice" value={member.cardNumber} />
            <InfoRow label="Razina članstva" value={MEMBERSHIP_LABELS[member.membershipLevel]} />
            {member.fullMemberSince && <InfoRow label="Punopravni od" value={formatDate(member.fullMemberSince)} />}
            <InfoRow label="Matična sekcija" value={member.homeSection?.name} />
            <InfoRow label="Pridružene sekcije" value={member.sections?.map((s) => s.section.name).join(', ') || '-'} />
            <InfoRow label="Timovi" value={member.teams?.map((t) => t.team.name).join(', ') || '-'} />
            <InfoRow label="Uloga" value={ROLE_LABELS[member.appRole]} />
          </Card>

          <Card title="Ostalo">
            <InfoRow label="Tip prehrane" value={DIET_LABELS[member.dietType]} />
            <InfoRow label="Pića" value={member.drinks?.map((d) => d.drink.name).join(', ') || '-'} />
            <InfoRow label="Alergije" value={member.allergies?.map((a) => a.allergy.name).join(', ') || '-'} />
            <InfoRow label="Veličina majice" value={member.shirtSize} />
          </Card>
        </>
      )}

      {isAdmin && (
        <Card title="Upravljanje ulogom">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
            <div className="mb-4">
              <label className="label">Uloga</label>
              <select className="input" value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="CLAN">Član</option>
                <option value="VODITELJ_SEKCIJE">Voditelj sekcije</option>
                <option value="ADMINISTRATOR">Administrator</option>
              </select>
            </div>

            {role === 'VODITELJ_SEKCIJE' && (
              <div className="mb-4">
                <label className="label">Sekcija koju vodi</label>
                <select className="input" value={managedSectionId} onChange={(e) => setManagedSectionId(e.target.value)}>
                  <option value="">-- Odaberite --</option>
                  {sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            )}
          </div>

          <button
            className="btn-primary"
            disabled={role === 'VODITELJ_SEKCIJE' && !managedSectionId}
            onClick={() => setConfirmOpen(true)}
          >
            Spremi ulogu
          </button>
        </Card>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title="Promjena uloge"
        message={`Postaviti ${member.firstName} ${member.lastName} kao ${ROLE_LABELS[role]}?`}
        onConfirm={submitRole}
        onCancel={() => setConfirmOpen(false)}
      />
    </PageContainer>
  );
}
