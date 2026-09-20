import { useState, useEffect } from 'react';
import { jsonHeaders, getToken } from '../api/auth';
import { useLookupData } from '../useLookupData';
import { useForm } from '../useForm';
import { memberValidators } from '../validation';
import { PageContainer, Card, Alert } from '../components/ui';
import { TextField, SelectField, MultiCheckDropdown } from '../components/Field';
import { GENDER_OPTIONS, MEMBERSHIP_LEVEL_OPTIONS, DIET_TYPE_OPTIONS, SHIRT_SIZE_OPTIONS } from '../constants';

const FACULTY_OTHER = 'OTHER';

function formatDate(d) {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('hr');
}

function linkEmailUrl() {
  return `/api/auth/google/link?token=${encodeURIComponent(getToken())}`;
}

const MEMBERSHIP_LABELS = Object.fromEntries(MEMBERSHIP_LEVEL_OPTIONS.map((o) => [o.value, o.label]));
const DIET_LABELS = Object.fromEntries(DIET_TYPE_OPTIONS.map((o) => [o.value, o.label]));

function facultyDisplay(member) {
  return member.faculty?.name || member.facultyOther || '-';
}

function InfoRow({ label, value, children }) {
  return (
    <div className="flex justify-between gap-4 py-2 border-b border-surface-border last:border-0">
      <span className="text-content-secondary text-sm">{label}</span>
      <span className="text-content-primary text-sm text-right">{children ?? value ?? '-'}</span>
    </div>
  );
}

export default function MemberView({ member: initialMember, isAdmin, onUpdated }) {
  const lookups = useLookupData();
  const [member, setMember] = useState(initialMember);
  const [editing, setEditing] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setMember(initialMember);
  }, [initialMember]);

  const pendingMembership = (member.pendingChanges || []).find(
    (c) => c.fieldName === 'membershipLevel'
  );

  // Determine initial faculty select value: known faculty id, or OTHER if facultyOther set
  const initialFacultyId = member.faculty?.id
    ? String(member.faculty.id)
    : member.facultyOther
    ? FACULTY_OTHER
    : '';

  const form = useForm(
    {
      firstName: member.firstName,
      lastName: member.lastName,
      address: member.address,
      gender: member.gender,
      facultyId: initialFacultyId,
      facultyOther: member.facultyOther || '',
      phone: member.phone,
      privateEmail: member.privateEmail,
      membershipLevel: member.membershipLevel,
      fullMemberSince: member.fullMemberSince ? member.fullMemberSince.split('T')[0] : '',
      dietType: member.dietType,
      shirtSize: member.shirtSize,
      sectionIds: member.sections.map((s) => s.section.id),
      teamIds: member.teams.map((t) => t.team.id),
      drinkIds: member.drinks.map((d) => d.drink.id),
      allergyIds: member.allergies.map((a) => a.allergy.id),
    },
    memberValidators
  );

  const { values, handleChange, handleBlur, showError } = form;

  const startEditing = () => {
    setMessage('');
    setSubmitError('');
    form.setValues({
      firstName: member.firstName,
      lastName: member.lastName,
      address: member.address,
      gender: member.gender,
      facultyId: initialFacultyId,
      facultyOther: member.facultyOther || '',
      phone: member.phone,
      privateEmail: member.privateEmail,
      membershipLevel: member.membershipLevel,
      fullMemberSince: member.fullMemberSince ? member.fullMemberSince.split('T')[0] : '',
      dietType: member.dietType,
      shirtSize: member.shirtSize,
      sectionIds: member.sections.map((s) => s.section.id),
      teamIds: member.teams.map((t) => t.team.id),
      drinkIds: member.drinks.map((d) => d.drink.id),
      allergyIds: member.allergies.map((a) => a.allergy.id),
    });
    setEditing(true);
  };

  const cancelEditing = () => {
    setEditing(false);
    setSubmitError('');
  };

  const handleMembershipChange = (name, value) => {
    handleChange(name, value);
    if (value !== 'PUNOPRAVNO' && values.fullMemberSince) {
      handleChange('fullMemberSince', '');
    }
  };

  const facultyOptions = [
    ...lookups.faculties.map((f) => ({ value: String(f.id), label: f.name })),
    { value: FACULTY_OTHER, label: 'Ostalo (upišite)' },
  ];

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitError('');
    setMessage('');

    const editableFields = [
      'firstName', 'lastName', 'address', 'gender', 'phone',
      'privateEmail', 'dietType', 'shirtSize', 'drinkIds', 'facultyId',
    ];
    if (values.facultyId === FACULTY_OTHER) editableFields.push('facultyOther');

    if (!form.validateAll(editableFields)) {
      setSubmitError('Ispravite označena polja prije spremanja.');
      return;
    }

    setSubmitting(true);
    try {
      const payload = { ...values };
      if (pendingMembership) {
        delete payload.membershipLevel;
      }
      // Normalize faculty
      payload.facultyId = values.facultyId && values.facultyId !== FACULTY_OTHER ? parseInt(values.facultyId) : null;
      payload.facultyOther = values.facultyId === FACULTY_OTHER ? values.facultyOther : null;

      const res = await fetch('/api/members/me', {
        method: 'PATCH',
        headers: jsonHeaders(),
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        setSubmitError(data.error || 'Greška pri spremanju.');
        return;
      }

      setMember(data);
      if (onUpdated) onUpdated(data);
      setEditing(false);
      setMessage(data.notice || 'Podatci su spremljeni.');
    } catch (err) {
      setSubmitError('Mrežna greška.');
    } finally {
      setSubmitting(false);
    }
  };

  // ---------- VIEW MODE ----------
  if (!editing) {
    return (
      <PageContainer title="Moj profil">
        {message && <Alert kind="success">{message}</Alert>}

        <div className="space-y-6">
          <Card title="Osobni podatci">
            <InfoRow label="Ime" value={member.firstName} />
            <InfoRow label="Prezime" value={member.lastName} />
            <InfoRow label="OIB" value={member.oib} />
            <InfoRow label="Datum rođenja" value={formatDate(member.dateOfBirth)} />
            <InfoRow label="Spol" value={member.gender === 'M' ? 'Muški' : 'Ženski'} />
            <InfoRow label="Adresa" value={member.address} />
            <InfoRow label="Fakultet" value={facultyDisplay(member)} />
            <InfoRow label="Telefon" value={member.phone} />
            <InfoRow label="Privatni e-mail">
              {member.privateEmail}
              {!member.privateEmailVerified && (
                <span className="block text-xs text-content-muted">
                  nepotvrđeno — <a className="text-brand-orange hover:underline" href={linkEmailUrl()}>potvrdi Google prijavom</a>
                </span>
              )}
            </InfoRow>
            <InfoRow label="KSET e-mail">
              {member.ksetEmail || (
                <span className="text-content-muted">
                  nije povezano — <a className="text-brand-orange hover:underline" href={linkEmailUrl()}>poveži KSET e-poštu</a>
                </span>
              )}
            </InfoRow>
          </Card>

          <Card title="Članstvo">
            <InfoRow label="Datum učlanjenja" value={formatDate(member.memberSince)} />
            <InfoRow label="Broj iskaznice" value={member.cardNumber} />
            <InfoRow label="Razina članstva">
              {MEMBERSHIP_LABELS[member.membershipLevel]}
              {pendingMembership && (
                <span className="block text-xs text-brand-orange">
                  promjena na {MEMBERSHIP_LABELS[pendingMembership.newValue]} čeka odobrenje
                </span>
              )}
            </InfoRow>
            {member.fullMemberSince && (
              <InfoRow label="Punopravni od" value={formatDate(member.fullMemberSince)} />
            )}
            <InfoRow label="Matična sekcija" value={member.homeSection?.name} />
            <InfoRow label="Pridružene sekcije" value={member.sections.map((s) => s.section.name).join(', ') || '-'} />
            <InfoRow label="Timovi" value={member.teams.map((t) => t.team.name).join(', ') || '-'} />
            <InfoRow label="Potvrda valjana do">
              {formatDate(member.certificateValidUntil)}
              <span className="block mt-1">
                <button
                  type="button"
                  className="btn-secondary text-xs py-1"
                  onClick={() => alert('Još nije implementirano')}
                >
                  Učitaj potvrdu
                </button>
              </span>
            </InfoRow>
            {isAdmin && <InfoRow label="Rola" value={member.appRole} />}
          </Card>

          <Card title="Ostalo">
            <InfoRow label="Tip prehrane" value={DIET_LABELS[member.dietType]} />
            <InfoRow label="Pića" value={member.drinks.map((d) => d.drink.name).join(', ') || '-'} />
            <InfoRow label="Alergije" value={member.allergies.map((a) => a.allergy.name).join(', ') || '-'} />
            <InfoRow label="Veličina majice" value={member.shirtSize} />
          </Card>
        </div>

        <div className="mt-6">
          <button onClick={startEditing} className="btn-primary">Uredi profil</button>
        </div>
      </PageContainer>
    );
  }

  // ---------- EDIT MODE ----------
  return (
    <PageContainer title="Uredi profil">
      {submitError && <Alert kind="error">{submitError}</Alert>}

      <form onSubmit={handleSubmit}>
        <Card title="Osobni podatci">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
            <TextField name="firstName" label="Ime" required
              value={values.firstName} onChange={handleChange} onBlur={handleBlur} error={showError('firstName')} />
            <TextField name="lastName" label="Prezime" required
              value={values.lastName} onChange={handleChange} onBlur={handleBlur} error={showError('lastName')} />
          </div>

          <div className="mb-4 text-sm text-content-muted">
            <div>OIB: {member.oib}</div>
            <div>Datum rođenja: {formatDate(member.dateOfBirth)}</div>
          </div>

          <TextField name="address" label="Adresa" required
            value={values.address} onChange={handleChange} onBlur={handleBlur} error={showError('address')} />

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
          <div className="mb-4 text-sm text-content-muted">
            <div>Broj iskaznice: {member.cardNumber}</div>
            <div>Datum učlanjenja: {formatDate(member.memberSince)}</div>
            <div>Matična sekcija: {member.homeSection?.name}</div>
          </div>

          {pendingMembership ? (
            <Alert kind="info">
              Promjena razine članstva na <strong>{MEMBERSHIP_LABELS[pendingMembership.newValue]}</strong> čeka
              odobrenje voditelja. Ne možete je mijenjati dok se ne obradi.
            </Alert>
          ) : (
            <SelectField
              name="membershipLevel"
              label="Razina članstva (promjena ide voditelju na odobrenje)"
              options={MEMBERSHIP_LEVEL_OPTIONS}
              value={values.membershipLevel}
              onChange={handleMembershipChange}
              onBlur={handleBlur}
              error={showError('membershipLevel')}
            />
          )}

          {member.membershipLevel === 'PUNOPRAVNO' && (
            <TextField name="fullMemberSince" label="Datum postanka punopravnim članom" type="date"
              value={values.fullMemberSince} onChange={handleChange} onBlur={handleBlur} error={showError('fullMemberSince')} />
          )}

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
          <button type="button" onClick={cancelEditing} className="btn-secondary">
            Odustani
          </button>
        </div>
      </form>
    </PageContainer>
  );
}
