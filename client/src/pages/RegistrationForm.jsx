import { useState } from 'react';
import { jsonHeaders } from '../api/auth';
import { authHeaders } from '../api/auth';
import { useLookupData } from '../useLookupData';
import { useForm } from '../useForm';
import { memberValidators } from '../validation';
import { PageContainer, Card, Alert } from '../components/ui';
import { TextField, SelectField, MultiCheckDropdown, CheckboxField, DateField } from '../components/Field';
import { GENDER_OPTIONS, DIET_TYPE_OPTIONS, SHIRT_SIZE_OPTIONS } from '../constants';

const FACULTY_OTHER = 'OTHER';

function truncate(s, n = 20) {
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
      houseNumber: '',
      postalCode: '',
      city: '',
      gender: '',
      facultyId: '',
      facultyOther: '',
      phone: '',
      privateEmail: '',
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

  const handleHomeSectionChange = (name, value) => {
    handleChange(name, value);
    handleChange('sectionIds', values.sectionIds.filter((id) => String(id) !== String(value)));
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
      if (['membershipLevel', 'memberSince', 'cardNumber', 'fullMemberSince'].includes(f)) return false;
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
      fd.append('houseNumber', values.houseNumber);
      fd.append('postalCode', values.postalCode);
      fd.append('city', values.city);
      fd.append('gender', values.gender);
      fd.append('phone', values.phone);
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
            <DateField name="dateOfBirth" label="Datum rođenja" required
              value={values.dateOfBirth} onChange={handleChange} onBlur={handleBlur} error={showError('dateOfBirth')} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
            <TextField name="address" label="Ulica" required
              value={values.address} onChange={handleChange} onBlur={handleBlur} error={showError('address')} />
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
            <p className="text-xs text-content-muted mb-2">
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
            {certError && <p className="field-error">{certError}</p>}
          </div>
        </Card>

        <Card title="Članstvo">
          <p className="text-sm text-content-secondary">Razina članstva: Plavi</p>

          <SelectField name="homeSectionId" label="Matična sekcija" required
            options={lookups.sections.map((s) => ({ value: s.id, label: s.name }))}
            value={values.homeSectionId} onChange={handleHomeSectionChange} onBlur={handleBlur} error={showError('homeSectionId')} />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
            <MultiCheckDropdown name="sectionIds" label="Pridružene sekcije"
              options={lookups.sections.filter((section) => String(section.id) !== String(values.homeSectionId))}
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

          <div className="mt-2">
            <CheckboxField name="acceptedDocuments"
              label={
                <>
                  Prihvaćam{' '}
                  <a
                    href="https://www.ssfer.hr/dokumenti.html"
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-brand-orange underline"
                  >
                    akte i dokumente udruge
                  </a>
                </>
              }
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
