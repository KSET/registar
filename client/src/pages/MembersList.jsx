import { useState, useEffect } from 'react';
import { authHeaders, jsonHeaders, openCertificate } from '../api/auth';
import { useLookupData } from '../useLookupData';
import { useForm } from '../useForm';
import { memberValidators } from '../validation';
import { MEMBERSHIP_LEVEL_OPTIONS, DIET_TYPE_OPTIONS, GENDER_OPTIONS, SHIRT_SIZE_OPTIONS } from '../constants';
import { PageContainer, Card, Alert, ConfirmDialog } from '../components/ui';
import { TextField, SelectField, MultiCheckDropdown, DateField } from '../components/Field';

const MEMBERSHIP_LABELS = Object.fromEntries(MEMBERSHIP_LEVEL_OPTIONS.map((o) => [o.value, o.label]));
const DIET_LABELS = Object.fromEntries(DIET_TYPE_OPTIONS.map((o) => [o.value, o.label]));
const GENDER_LABELS = Object.fromEntries(GENDER_OPTIONS.map((o) => [o.value, o.label]));
const ROLE_LABELS = {
  CLAN: 'Član',
  VODITELJ_SEKCIJE: 'Voditelj sekcije',
  ADMINISTRATOR: 'Administrator',
};
const FACULTY_OTHER = 'OTHER';

function formatDate(d) {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('hr');
}

function toDateInput(d) {
  return d ? d.split('T')[0] : '';
}

function facultyDisplay(m) {
  return m.faculty?.name || m.facultyOther || '-';
}

export default function MembersList({ isAdmin }) {
  const lookups = useLookupData();
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sectionFilter, setSectionFilter] = useState(null); // null = svi
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (selectedId === null) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    fetch(`/api/members/${selectedId}`, { headers: authHeaders() })
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => { if (!cancelled) setDetail(data); })
      .catch(() => { if (!cancelled) setDetail(null); })
      .finally(() => { if (!cancelled) setDetailLoading(false); });
    return () => { cancelled = true; };
  }, [selectedId]);

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
    const matchesSearch =
      `${m.firstName} ${m.lastName}`.toLowerCase().includes(q) ||
      (m.ksetEmail || '').toLowerCase().includes(q) ||
      (m.privateEmail || '').toLowerCase().includes(q);
    const matchesSection = sectionFilter === null || m.homeSection?.id === sectionFilter;
    return matchesSearch && matchesSection;
  });

  const sectionCounts = Object.fromEntries(
    lookups.sections.map((s) => [s.id, members.filter((m) => m.homeSection?.id === s.id).length])
  );

  if (loading) {
    return <PageContainer title="Članovi"><p className="text-content-secondary">Učitavanje...</p></PageContainer>;
  }

  if (selectedId !== null) {
    if (detailLoading || !detail) {
      return (
        <PageContainer title="Članovi">
          <button onClick={() => setSelectedId(null)} className="btn-ghost mb-4">← Natrag na popis</button>
          <p className="text-content-secondary">Učitavanje...</p>
        </PageContainer>
      );
    }
    return (
      <MemberDetail
        member={detail}
        isAdmin={isAdmin}
        lookups={lookups}
        onBack={() => { setSelectedId(null); }}
        onRoleChanged={() => { setSelectedId(null); load(); }}
        onUpdated={(updated) => { setDetail(updated); load(); }}
        onDeleted={() => { setSelectedId(null); load(); }}
        setMessage={setMessage}
      />
    );
  }

  return (
    <PageContainer title="Članovi" maxWidth="max-w-5xl">
      {message && <Alert kind="success">{message}</Alert>}

      <div className="mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setSectionFilter(null)}
          className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
            sectionFilter === null
              ? 'bg-brand-orange text-brand-dark border-brand-orange'
              : 'border-surface-border text-content-secondary hover:text-content-primary hover:bg-surface-overlay'
          }`}
        >
          Sve sekcije ({members.length})
        </button>
        {lookups.sections.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSectionFilter(s.id)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              sectionFilter === s.id
                ? 'bg-brand-orange text-brand-dark border-brand-orange'
                : 'border-surface-border text-content-secondary hover:text-content-primary hover:bg-surface-overlay'
            }`}
          >
            {s.name} ({sectionCounts[s.id] || 0})
          </button>
        ))}
      </div>

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
              <tr key={m.id} className="hover:bg-surface-overlay cursor-pointer" onClick={() => setSelectedId(m.id)}>
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
            <div onClick={() => setSelectedId(m.id)}>
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

function InfoRow({ label, value, children }) {
  return (
    <div className="flex justify-between gap-4 py-2 border-b border-surface-border last:border-0">
      <span className="text-content-secondary text-sm">{label}</span>
      <span className="text-content-primary text-sm text-right">{children ?? value ?? '-'}</span>
    </div>
  );
}

function MemberDetail({ member, isAdmin, lookups, onBack, onRoleChanged, onUpdated, onDeleted, setMessage }) {
  const [role, setRole] = useState(member.appRole || 'CLAN');
  const [managedSectionId, setManagedSectionId] = useState(member.managedSectionId ? String(member.managedSectionId) : '');
  const [error, setError] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const isLimited = member.limited;

  const handleOpenCert = async () => {
    try {
      await openCertificate(member.id, 'member');
    } catch (err) {
      setError(err.message);
    }
  };

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

  const submitDelete = async () => {
    setDeleteConfirmOpen(false);
    setError('');
    try {
      const res = await fetch(`/api/members/${member.id}`, {
        method: 'DELETE',
        headers: jsonHeaders(),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Greška pri brisanju.');
        return;
      }
      setMessage(`${member.firstName} ${member.lastName} je izbrisan/a.`);
      onDeleted();
    } catch (err) {
      setError('Mrežna greška.');
    }
  };

  return (
    <PageContainer title={`${member.firstName} ${member.lastName}`}>
      <button onClick={onBack} className="btn-ghost mb-4">← Natrag na popis</button>

      {error && <Alert kind="error">{error}</Alert>}

      {editing ? (
        <MemberEditForm
          member={member}
          lookups={lookups}
          submitting={submitting}
          setSubmitting={setSubmitting}
          setError={setError}
          onCancel={() => setEditing(false)}
          onSaved={(updated) => {
            setEditing(false);
            setMessage('Podatci su spremljeni.');
            onUpdated(updated);
          }}
        />
      ) : isLimited ? (
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
            <InfoRow label="Spol" value={GENDER_LABELS[member.gender] || member.gender} />
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
            <InfoRow label="Potvrda valjana do">
              {formatDate(member.certificateValidUntil)}
              {member.certificatePath && (
                <span className="block mt-1">
                  <button type="button" className="text-brand-orange hover:underline text-sm" onClick={handleOpenCert}>
                    Otvori potvrdu
                  </button>
                  <span className="block text-xs text-content-muted mt-0.5">{member.certificatePath}</span>
                </span>
              )}
            </InfoRow>
          </Card>

          <Card title="Ostalo">
            <InfoRow label="Tip prehrane" value={DIET_LABELS[member.dietType]} />
            <InfoRow label="Pića" value={member.drinks?.map((d) => d.drink.name).join(', ') || '-'} />
            <InfoRow label="Alergije" value={member.allergies?.map((a) => a.allergy.name).join(', ') || '-'} />
            <InfoRow label="Veličina majice" value={member.shirtSize} />
          </Card>
        </>
      )}

      {isAdmin && !isLimited && !editing && (
        <Card title="Administracija">
          <div className="flex flex-wrap gap-3">
            <button className="btn-secondary" onClick={() => setEditing(true)}>
              Uredi podatke
            </button>
            <button
              className="btn-secondary border-state-error text-state-error hover:bg-state-error/10"
              onClick={() => setDeleteConfirmOpen(true)}
            >
              Izbriši člana
            </button>
          </div>
        </Card>
      )}

      {isAdmin && !editing && (
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
                  {lookups.sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
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

      <ConfirmDialog
        open={deleteConfirmOpen}
        title="Brisanje člana"
        message={`Trajno izbrisati ${member.firstName} ${member.lastName}? Ova se akcija ne može poništiti.`}
        onConfirm={submitDelete}
        onCancel={() => setDeleteConfirmOpen(false)}
      />
    </PageContainer>
  );
}

function MemberEditForm({ member, lookups, submitting, setSubmitting, setError, onCancel, onSaved }) {
  const initialFacultyId = member.faculty?.id
    ? String(member.faculty.id)
    : member.facultyOther
    ? FACULTY_OTHER
    : '';

  const form = useForm(
    {
      firstName: member.firstName,
      lastName: member.lastName,
      oib: member.oib,
      dateOfBirth: toDateInput(member.dateOfBirth),
      address: member.address,
      gender: member.gender,
      facultyId: initialFacultyId,
      facultyOther: member.facultyOther || '',
      phone: member.phone,
      privateEmail: member.privateEmail,
      memberSince: toDateInput(member.memberSince),
      cardNumber: member.cardNumber,
      membershipLevel: member.membershipLevel,
      fullMemberSince: member.fullMemberSince ? member.fullMemberSince.split('T')[0] : '',
      dietType: member.dietType,
      shirtSize: member.shirtSize,
      homeSectionId: member.homeSectionId ? String(member.homeSectionId) : '',
      sectionIds: member.sections.map((s) => s.section.id),
      teamIds: member.teams.map((t) => t.team.id),
      drinkIds: member.drinks.map((d) => d.drink.id),
      allergyIds: member.allergies.map((a) => a.allergy.id),
    },
    memberValidators
  );

  const { values, handleChange, handleBlur, showError } = form;

  const facultyOptions = [
    ...lookups.faculties.map((f) => ({ value: String(f.id), label: f.name })),
    { value: FACULTY_OTHER, label: 'Ostalo (upišite)' },
  ];

  // Admin edits everything the form manages except acceptedDocuments - that's
  // a historical consent record, not something re-confirmed on someone's behalf.
  const EDITABLE_FIELDS = Object.keys(memberValidators).filter((f) => f !== 'acceptedDocuments');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!form.validateAll(EDITABLE_FIELDS)) {
      setError('Ispravite označena polja prije spremanja.');
      return;
    }

    setSubmitting(true);
    try {
      const payload = { ...values };
      payload.facultyId = values.facultyId && values.facultyId !== FACULTY_OTHER ? parseInt(values.facultyId) : null;
      payload.facultyOther = values.facultyId === FACULTY_OTHER ? values.facultyOther : null;

      const res = await fetch(`/api/members/${member.id}`, {
        method: 'PATCH',
        headers: jsonHeaders(),
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Greška pri spremanju.');
        return;
      }
      onSaved(data);
    } catch (err) {
      setError('Mrežna greška.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <Card title="Osobni podatci">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
          <TextField name="firstName" label="Ime" required
            value={values.firstName} onChange={handleChange} onBlur={handleBlur} error={showError('firstName')} />
          <TextField name="lastName" label="Prezime" required
            value={values.lastName} onChange={handleChange} onBlur={handleBlur} error={showError('lastName')} />
          <TextField name="oib" label="OIB" required maxLength={11}
            value={values.oib} onChange={handleChange} onBlur={handleBlur} error={showError('oib')} />
          <TextField name="dateOfBirth" label="Datum rođenja" type="date" required
            value={values.dateOfBirth} onChange={handleChange} onBlur={handleBlur} error={showError('dateOfBirth')} />
        </div>

        <TextField name="address" label="Adresa" required
          value={values.address} onChange={handleChange} onBlur={handleBlur} error={showError('address')} />
        <p className="text-xs text-content-muted -mt-3 mb-4">(Ulica, kućni broj, poštanski broj, mjesto)</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
          <SelectField name="gender" label="Spol" required options={GENDER_OPTIONS}
            value={values.gender} onChange={handleChange} onBlur={handleBlur} error={showError('gender')} />
          <TextField name="phone" label="Telefon" required
            value={values.phone} onChange={handleChange} onBlur={handleBlur} error={showError('phone')} />
          <TextField name="privateEmail" label="Privatni e-mail" type="email" required
            value={values.privateEmail} onChange={handleChange} onBlur={handleBlur} error={showError('privateEmail')} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
          <SelectField name="facultyId" label="Fakultet" required options={facultyOptions}
            value={values.facultyId} onChange={handleChange} onBlur={handleBlur} error={showError('facultyId')} />
          {values.facultyId === FACULTY_OTHER && (
            <TextField name="facultyOther" label="Upišite fakultet" required
              value={values.facultyOther} onChange={handleChange} onBlur={handleBlur} error={showError('facultyOther')} />
          )}
        </div>
      </Card>

      <Card title="Članstvo">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
          <TextField name="memberSince" label="Datum učlanjenja" type="date" required
            value={values.memberSince} onChange={handleChange} onBlur={handleBlur} error={showError('memberSince')} />
          <TextField name="cardNumber" label="Broj iskaznice" required
            value={values.cardNumber} onChange={handleChange} onBlur={handleBlur} error={showError('cardNumber')} />
          <SelectField name="membershipLevel" label="Razina članstva" required options={MEMBERSHIP_LEVEL_OPTIONS}
            value={values.membershipLevel} onChange={handleChange} onBlur={handleBlur} error={showError('membershipLevel')} />
          <DateField name="fullMemberSince" label="Datum postanka punopravnim članom"
            value={values.fullMemberSince} onChange={handleChange} onBlur={handleBlur} error={showError('fullMemberSince')} />
          <SelectField name="homeSectionId" label="Matična sekcija" required
            options={lookups.sections.map((s) => ({ value: String(s.id), label: s.name }))}
            value={values.homeSectionId} onChange={handleChange} onBlur={handleBlur} error={showError('homeSectionId')} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
          <MultiCheckDropdown name="sectionIds" label="Pridružene sekcije"
            options={lookups.sections} value={values.sectionIds} onChange={handleChange} onBlur={handleBlur} error={showError('sectionIds')} />
          <MultiCheckDropdown name="teamIds" label="Timovi"
            options={lookups.teams} value={values.teamIds} onChange={handleChange} onBlur={handleBlur} error={showError('teamIds')} />
        </div>
      </Card>

      <Card title="Ostalo">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
          <SelectField name="dietType" label="Tip prehrane" required options={DIET_TYPE_OPTIONS}
            value={values.dietType} onChange={handleChange} onBlur={handleBlur} error={showError('dietType')} />
          <SelectField name="shirtSize" label="Veličina majice" required options={SHIRT_SIZE_OPTIONS}
            value={values.shirtSize} onChange={handleChange} onBlur={handleBlur} error={showError('shirtSize')} />
          <MultiCheckDropdown name="drinkIds" label="Pića" required
            options={lookups.drinks} value={values.drinkIds} onChange={handleChange} onBlur={handleBlur} error={showError('drinkIds')} />
          <MultiCheckDropdown name="allergyIds" label="Alergije"
            options={lookups.allergies} value={values.allergyIds} onChange={handleChange} onBlur={handleBlur} error={showError('allergyIds')} />
        </div>
      </Card>

      <div className="flex gap-3">
        <button type="submit" disabled={submitting} className="btn-primary">
          {submitting ? 'Spremam...' : 'Spremi promjene'}
        </button>
        <button type="button" onClick={onCancel} className="btn-secondary">
          Odustani
        </button>
      </div>
    </form>
  );
}
