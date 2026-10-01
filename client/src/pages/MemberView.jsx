import { useState, useEffect } from 'react';
import { jsonHeaders, getToken, authHeaders, openCertificate } from '../api/auth';
import { useLookupData } from '../useLookupData';
import { useForm } from '../useForm';
import { memberValidators } from '../validation';
import { formatDate, isDateOnOrAfterToday } from '../date';
import { formatAddress } from '../address';
import { PageContainer, Card, Alert } from '../components/ui';
import { TextField, SelectField, MultiCheckDropdown, DateField } from '../components/Field';
import MembershipLabel from '../components/MembershipLabel';
import { GENDER_OPTIONS, DIET_TYPE_OPTIONS, SHIRT_SIZE_OPTIONS } from '../constants';

const FACULTY_OTHER = 'OTHER';

function linkEmailUrl() {
  return `/api/auth/google/link?token=${encodeURIComponent(getToken())}`;
}

function truncate(s, n = 20) {
  if (!s) return '';
  return s.length > n ? s.slice(0, n) + '...' : s;
}

const DIET_LABELS = Object.fromEntries(DIET_TYPE_OPTIONS.map((o) => [o.value, o.label]));
const GENDER_LABELS = Object.fromEntries(GENDER_OPTIONS.map((o) => [o.value, o.label]));

function facultyDisplay(member) {
  return member.faculty?.name || member.facultyOther || '-';
}

function InfoRow({ label, value, children }) {
  return (
    <div className="flex justify-between gap-4 py-2 border-b border-surface-border last:border-0">
      <span className="text-content-secondary text-sm">{label}</span>
      <span className="text-content-primary text-sm text-right min-w-0 break-words">{children ?? value ?? '-'}</span>
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
  const [certFile, setCertFile] = useState(null);
  const [certMsg, setCertMsg] = useState('');
  const [certError, setCertError] = useState('');
  const [certUploading, setCertUploading] = useState(false);

  useEffect(() => {
    setMember(initialMember);
  }, [initialMember]);

  const pendingCert = (member.pendingChanges || []).find((c) => c.fieldName === 'certificatePath');
  const certValid = isDateOnOrAfterToday(member.certificateValidUntil);

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
      houseNumber: member.houseNumber || '',
      postalCode: member.postalCode || '',
      city: member.city || '',
      gender: member.gender,
      facultyId: initialFacultyId,
      facultyOther: member.facultyOther || '',
      phone: member.phone,
      privateEmail: member.privateEmail,
      fullMemberSince: member.fullMemberSince ? member.fullMemberSince.split('T')[0] : '',
      dietType: member.dietType,
      shirtSize: member.shirtSize,
      sectionIds: member.sections.map((s) => s.section.id).filter((id) => id !== member.homeSectionId),
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
      houseNumber: member.houseNumber || '',
      postalCode: member.postalCode || '',
      city: member.city || '',
      gender: member.gender,
      facultyId: initialFacultyId,
      facultyOther: member.facultyOther || '',
      phone: member.phone,
      privateEmail: member.privateEmail,
      fullMemberSince: member.fullMemberSince ? member.fullMemberSince.split('T')[0] : '',
      dietType: member.dietType,
      shirtSize: member.shirtSize,
      sectionIds: member.sections.map((s) => s.section.id).filter((id) => id !== member.homeSectionId),
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

  const facultyOptions = [
    ...lookups.faculties.map((f) => ({ value: String(f.id), label: f.name })),
    { value: FACULTY_OTHER, label: 'Ostalo (upišite)' },
  ];

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitError('');
    setMessage('');

    const editableFields = [
      'firstName', 'lastName', 'address', 'houseNumber', 'postalCode', 'city', 'gender', 'phone',
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

  const handleCertUpload = async () => {
    setCertMsg('');
    setCertError('');
    if (!certFile) {
      setCertError('Odaberite PDF datoteku.');
      return;
    }
    setCertUploading(true);
    try {
      const fd = new FormData();
      fd.append('certificate', certFile);
      const res = await fetch('/api/uploads/certificate', {
        method: 'POST',
        headers: authHeaders(), // NE dodavati Content-Type, browser postavlja multipart boundary
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) {
        setCertError(data.error || 'Greška pri uploadu.');
        return;
      }
      setCertMsg(data.message);
      setCertFile(null);
      // Refresh profile so pendingChanges reflects the new upload
      const meRes = await fetch('/api/members/me', { headers: authHeaders() });
      if (meRes.ok) {
        const updated = await meRes.json();
        setMember(updated);
        if (onUpdated) onUpdated(updated);
      }
    } catch (err) {
      setCertError('Mrežna greška.');
    } finally {
      setCertUploading(false);
    }
  };

  const handleOpenCert = async () => {
    try {
      await openCertificate(member.id, 'member');
    } catch (err) {
      setCertError(err.message);
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
            <InfoRow label="Spol" value={GENDER_LABELS[member.gender] || member.gender} />
            <InfoRow label="Adresa" value={formatAddress(member)} />
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
              <MembershipLabel value={member.membershipLevel} />
            </InfoRow>
            {member.fullMemberSince && (
              <InfoRow label="Punopravni od" value={formatDate(member.fullMemberSince)} />
            )}
            <InfoRow label="Matična sekcija" value={member.homeSection?.name} />
            <InfoRow label="Pridružene sekcije" value={member.sections.map((s) => s.section.name).join(', ') || '-'} />
            <InfoRow label="Timovi" value={member.teams.map((t) => t.team.name).join(', ') || '-'} />
            <InfoRow label="Potvrda o studiranju">
              {member.certificatePath ? (
                <span className="block">
                  <button type="button" className="text-brand-orange hover:underline text-sm" onClick={handleOpenCert}>
                    Otvori potvrdu
                  </button>
                  <span className="block text-xs text-content-muted mt-0.5">{member.certificatePath}</span>
                  <span className="block text-xs text-content-muted mt-0.5">
                    Potvrda valjana do {formatDate(member.certificateValidUntil)}
                  </span>
                </span>
              ) : (
                '-'
              )}
            </InfoRow>
            {isAdmin && <InfoRow label="Rola" value={member.appRole} />}
          </Card>

          <Card title="Ostalo">
            <InfoRow label="Tip prehrane" value={DIET_LABELS[member.dietType]} />
            <InfoRow label="Pića" value={member.drinks.map((d) => d.drink.name).join(', ') || '-'} />
            <InfoRow label="Alergije" value={member.allergies.map((a) => a.allergy.name).join(', ') || '-'} />
            <InfoRow label="Veličina majice" value={member.shirtSize} />
          </Card>
          <Card title="Potvrda o studiranju">
            {certMsg && <Alert kind="success">{certMsg}</Alert>}
            {certError && <Alert kind="error">{certError}</Alert>}

            {pendingCert ? (
              <p className="text-sm text-content-secondary">
                Potvrda je poslana i čeka odobrenje voditelja.
              </p>
            ) : certValid ? (
              <p className="text-sm text-content-secondary">
                Vaša potvrda je valjana do {formatDate(member.certificateValidUntil)}. Nova se može učitati nakon isteka.
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-content-secondary">
                  Učitajte potvrdu o studiranju (PDF, max 5 MB). Ide voditelju na odobrenje.
                </p>
                <p className="text-xs text-content-muted -mt-2">
                  <a href="https://issp.srce.hr/e-potvrda/student" target="_blank" rel="noopener noreferrer" className="text-brand-orange underline">
                    Preuzmite potvrdu putem e-Građani
                  </a>
                </p>
                <div className="flex items-center gap-3">
                  <label className="btn-secondary cursor-pointer">
                    Odaberi datoteku
                    <input
                      type="file"
                      accept="application/pdf"
                      onChange={(e) => setCertFile(e.target.files[0] || null)}
                      className="hidden"
                    />
                  </label>
                  <span className="text-sm text-content-secondary truncate max-w-[200px]">
                    {certFile ? truncate(certFile.name) : 'Nije odabrano'}
                  </span>
                </div>
                <div>
                  <button type="button" className="btn-primary" disabled={certUploading || !certFile} onClick={handleCertUpload}>
                    {certUploading ? 'Šaljem...' : 'Učitaj potvrdu'}
                  </button>
                </div>
              </div>
            )}
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

          <TextField name="address" label="Ulica" required
            value={values.address} onChange={handleChange} onBlur={handleBlur} error={showError('address')} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
            <TextField name="houseNumber" label="Kućni broj" required
              value={values.houseNumber} onChange={handleChange} onBlur={handleBlur} error={showError('houseNumber')} />
            <TextField name="postalCode" label="Poštanski broj" required
              value={values.postalCode} onChange={handleChange} onBlur={handleBlur} error={showError('postalCode')} />
            <TextField name="city" label="Mjesto" required
              value={values.city} onChange={handleChange} onBlur={handleBlur} error={showError('city')} />
          </div>

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

          <InfoRow label="Razina članstva"><MembershipLabel value={member.membershipLevel} /></InfoRow>

          {member.membershipLevel === 'PUNOPRAVNO' && (
            <DateField name="fullMemberSince" label="Datum postanka punopravnim članom"
              value={values.fullMemberSince} onChange={handleChange} onBlur={handleBlur} error={showError('fullMemberSince')} />
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
            <MultiCheckDropdown name="sectionIds" label="Pridružene sekcije"
              options={lookups.sections.filter((section) => section.id !== member.homeSectionId)}
              value={values.sectionIds} onChange={handleChange} onBlur={handleBlur} error={showError('sectionIds')} />
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
