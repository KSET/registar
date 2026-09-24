import { useState } from 'react';
import { jsonHeaders } from '../api/auth';
import { authHeaders } from '../api/auth';
import { useLookupData } from '../useLookupData';
import { useForm } from '../useForm';
import { memberValidators } from '../validation';
import { PageContainer, Card, Alert } from '../components/ui';
import { TextField, SelectField, MultiCheckDropdown, CheckboxField, DateField } from '../components/Field';
import { GENDER_OPTIONS, MEMBERSHIP_LEVEL_OPTIONS, DIET_TYPE_OPTIONS, SHIRT_SIZE_OPTIONS } from '../constants';

const FACULTY_OTHER = 'OTHER';

function truncate(s, n = 30) {
  if (!s) return '';
  return s.length > n ? s.slice(0, n) + '...' : s;
}

export default function RegistrationForm({ email, onSubmitted }) {
  const lookups = useLookupData();
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [certFile, setCertFile] = useState(null);
  const [certError, setCertError] = useState('');
  const isKset = email.toLowerCase().endsWith('@kset.org');

  const form = useForm(
    {
      firstName: '',
      lastName: '',
      oib: '',
      dateOfBirth: '',
      address: '',
      gender: '',
      facultyId: '',
      facultyOther: '',
      phone: '',
      privateEmail: '',
      memberSince: new Date().toISOString().split('T')[0],
      cardNumber: '',
      membershipLevel: 'PRIDRUZENO',
      fullMemberSince: '',
      homeSectionId: '',
      sectionIds: [],
      teamIds: [],
      drinkIds: [],
      allergyIds: [],
      dietType: '',
      shirtSize: '',
      acceptedDocuments: false,
    },
    memberValidators
  );

  const { values, handleChange, handleBlur, showError, validateAll } = form;

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
    setCertError('');

    const fieldsToValidate = Object.keys(memberValidators).filter((f) => {
      if (f === 'privateEmail' && !isKset) return false;
      if (f === 'facultyOther' && values.facultyId !== FACULTY_OTHER) return false;
      return true;
    });

    if (!validateAll(fieldsToValidate)) {
      setSubmitError('Ispravite označena polja prije slanja.');
      return;
    }

    if (!certFile) {
      setCertError('Priložite potvrdu o studiranju (PDF).');
      return;
    }

    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('firstName', values.firstName);
      fd.append('lastName', values.lastName);
      fd.append('oib', values.oib);
      fd.append('dateOfBirth', values.dateOfBirth);
      fd.append('address', values.address);
      fd.append('gender', values.gender);
      fd.append('phone', values.phone);
      fd.append('memberSince', values.memberSince);
      fd.append('cardNumber', values.cardNumber);
      fd.append('membershipLevel', values.membershipLevel);
      fd.append('fullMemberSince', values.fullMemberSince || '');
      fd.append('homeSectionId', String(parseInt(values.homeSectionId)));
      fd.append('dietType', values.dietType);
      fd.append('shirtSize', values.shirtSize);
      fd.append('acceptedDocuments', String(values.acceptedDocuments));
      if (isKset) fd.append('privateEmail', values.privateEmail);

      fd.append('facultyId', values.facultyId && values.facultyId !== FACULTY_OTHER ? String(parseInt(values.facultyId)) : '');
      fd.append('facultyOther', values.facultyId === FACULTY_OTHER ? values.facultyOther : '');

      fd.append('sectionIds', JSON.stringify(values.sectionIds));
      fd.append('teamIds', JSON.stringify(values.teamIds));
      fd.append('drinkIds', JSON.stringify(values.drinkIds));
      fd.append('allergyIds', JSON.stringify(values.allergyIds));

      // file
      fd.append('certificate', certFile);

      const res = await fetch('/api/pending', {
        method: 'POST',
        headers: authHeaders(),
        body: fd,
      });

      const data = await res.json();
      if (!res.ok) {
        const msg = data.errors ? data.errors.join(' ') : data.error || 'Greška pri slanju.';
        setSubmitError(msg);
        return;
      }
      onSubmitted(data);
    } catch (err) {
      setSubmitError('Mrežna greška. Pokušajte ponovo.');
    } finally {
      setSubmitting(false);
    }
  };


  return (
    <PageContainer title="Pristupna forma">
      <Alert kind="info">
        {isKset ? (
          <>KSET e-pošta: <strong>{email}</strong> (postavlja se automatski). Unesite i privatnu e-poštu.</>
        ) : (
          <>Privatna e-pošta: <strong>{email}</strong> (postavlja se automatski). KSET e-poštu možete kasnije povezati u profilu.</>
        )}
      </Alert>

      {submitError && <Alert kind="error">{submitError}</Alert>}

      <form onSubmit={handleSubmit}>
        <Card title="Osobni podatci">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
            <TextField name="firstName" label="Ime" required
              value={values.firstName} onChange={handleChange} onBlur={handleBlur} error={showError('firstName')} />
            <TextField name="lastName" label="Prezime" required
              value={values.lastName} onChange={handleChange} onBlur={handleBlur} error={showError('lastName')} />
            <TextField name="oib" label="OIB (11 znamenaka)" required maxLength={11}
              value={values.oib} onChange={handleChange} onBlur={handleBlur} error={showError('oib')} />
            <TextField name="dateOfBirth" label="Datum rođenja" type="date" required
              value={values.dateOfBirth} onChange={handleChange} onBlur={handleBlur} error={showError('dateOfBirth')} />
          </div>

          <TextField name="address" label="Adresa" required
            value={values.address} onChange={handleChange} onBlur={handleBlur} error={showError('address')} />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
            <SelectField name="gender" label="Spol" required options={GENDER_OPTIONS}
              value={values.gender} onChange={handleChange} onBlur={handleBlur} error={showError('gender')} />
            <TextField name="phone" label="Broj telefona" required
              value={values.phone} onChange={handleChange} onBlur={handleBlur} error={showError('phone')} />
            {isKset && (
              <TextField name="privateEmail" label="Privatni e-mail" type="email" required
                value={values.privateEmail} onChange={handleChange} onBlur={handleBlur} error={showError('privateEmail')} />
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
            <SelectField name="facultyId" label="Fakultet" required options={facultyOptions}
              value={values.facultyId} onChange={handleChange} onBlur={handleBlur} error={showError('facultyId')} />
            {values.facultyId === FACULTY_OTHER && (
              <TextField name="facultyOther" label="Upišite fakultet" required
                value={values.facultyOther} onChange={handleChange} onBlur={handleBlur} error={showError('facultyOther')} />
            )}
          </div>
          <div className="mt-2">
            <label className="label">Potvrda o studiranju (PDF) <span className="text-brand-orange">*</span></label>
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
              <span className="text-sm text-content-secondary">
                {certFile ? truncate(certFile.name, 30) : 'Nije odabrano'}
              </span>
            </div>
            {certError && <p className="field-error">{certError}</p>}
          </div>
        </Card>

        <Card title="Članstvo">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
            <TextField name="memberSince" label="Datum učlanjenja" type="date" required
              value={values.memberSince} onChange={handleChange} onBlur={handleBlur} error={showError('memberSince')} />
            <TextField name="cardNumber" label="Broj iskaznice" required
              value={values.cardNumber} onChange={handleChange} onBlur={handleBlur} error={showError('cardNumber')} />
            <SelectField name="membershipLevel" label="Razina članstva" required options={MEMBERSHIP_LEVEL_OPTIONS}
              value={values.membershipLevel} onChange={handleMembershipChange} onBlur={handleBlur} error={showError('membershipLevel')} />
            {values.membershipLevel === 'PUNOPRAVNO' && (
              <DateField name="fullMemberSince" label="Datum postanka punopravnim članom"
                value={values.fullMemberSince} onChange={handleChange} onBlur={handleBlur} error={showError('fullMemberSince')} />
            )}
          </div>

          <SelectField name="homeSectionId" label="Matična sekcija" required
            options={lookups.sections.map((s) => ({ value: s.id, label: s.name }))}
            value={values.homeSectionId} onChange={handleChange} onBlur={handleBlur} error={showError('homeSectionId')} />

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

          <div className="mt-2">
            <CheckboxField name="acceptedDocuments" label="Prihvaćam akte i dokumente udruge"
              value={values.acceptedDocuments} onChange={handleChange} onBlur={handleBlur} error={showError('acceptedDocuments')} />
          </div>
        </Card>

        <div className="flex justify-center">
          <button type="submit" disabled={submitting} className="btn-primary">
            {submitting ? 'Šaljem...' : 'Pošalji prijavu'}
          </button>
        </div>

      </form>
    </PageContainer>
  );
}
