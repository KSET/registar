import { useState } from 'react';
import { jsonHeaders } from '../api/auth';
import { useLookupData } from '../useLookupData';
import { useForm } from '../useForm';
import { memberValidators } from '../validation';
import { FIELD_LABELS, GENDER_OPTIONS, MEMBERSHIP_LEVEL_OPTIONS, DIET_TYPE_OPTIONS, SHIRT_SIZE_OPTIONS } from '../constants';
import { PageContainer, Card, Alert } from '../components/ui';
import { TextField, SelectField, MultiCheckDropdown, CheckboxField } from '../components/Field';

function displayValue(value) {
  if (Array.isArray(value)) return value.join(', ') || '-';
  if (typeof value === 'boolean') return value ? 'Da' : 'Ne';
  return String(value ?? '') || '-';
}

function RefillField({ fieldKey, form, lookups }) {
  const { values, handleChange, handleBlur, showError } = form;
  const common = {
    name: fieldKey,
    value: values[fieldKey],
    onChange: handleChange,
    onBlur: handleBlur,
    error: showError(fieldKey),
  };
  const label = FIELD_LABELS[fieldKey] || fieldKey;

  switch (fieldKey) {
    case 'gender':
      return <SelectField {...common} label={label} required options={GENDER_OPTIONS} />;
    case 'membershipLevel':
      return <SelectField {...common} label={label} required options={MEMBERSHIP_LEVEL_OPTIONS} />;
    case 'dietType':
      return <SelectField {...common} label={label} required options={DIET_TYPE_OPTIONS} />;
    case 'shirtSize':
      return <SelectField {...common} label={label} required options={SHIRT_SIZE_OPTIONS} />;
    case 'homeSectionId':
      return <SelectField {...common} label={label} required
        options={lookups.sections.map((s) => ({ value: s.id, label: s.name }))} />;
    case 'sectionIds':
      return <MultiCheckDropdown {...common} label={label} options={lookups.sections} />;
    case 'teamIds':
      return <MultiCheckDropdown {...common} label={label} options={lookups.teams} />;
    case 'drinkIds':
      return <MultiCheckDropdown {...common} label={label} required options={lookups.drinks} />;
    case 'allergyIds':
      return <MultiCheckDropdown {...common} label={label} options={lookups.allergies} />;
    case 'acceptedDocuments':
      return <CheckboxField {...common} label="Prihvaćam akte i dokumente udruge" />;
    case 'dateOfBirth':
    case 'memberSince':
    case 'fullMemberSince':
      return <TextField {...common} label={label} type="date" required={fieldKey !== 'fullMemberSince'} />;
    case 'privateEmail':
      return <TextField {...common} label={label} type="email" required />;
    case 'oib':
      return <TextField {...common} label={label} required maxLength={11} />;
    default:
      return <TextField {...common} label={label} required />;
  }
}

export default function PendingRefillForm({ pending, fieldsToRefill, onUpdated }) {
  const lookups = useLookupData();
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const initialValues = {};
  for (const key of fieldsToRefill) {
    const val = pending.fieldData[key];
    if (Array.isArray(val)) initialValues[key] = [];
    else if (typeof val === 'boolean') initialValues[key] = false;
    else initialValues[key] = '';
  }

  const form = useForm(initialValues, memberValidators);

  const approvedFields = Object.entries(pending.fieldData).filter(
    ([key]) => pending.fieldStatus[key] === 'APPROVED'
  );

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitError('');

    if (!form.validateAll(fieldsToRefill)) {
      setSubmitError('Ispravite označena polja prije slanja.');
      return;
    }

    setSubmitting(true);
    try {
      const fields = { ...form.values };
      if (fields.homeSectionId) {
        fields.homeSectionId = parseInt(fields.homeSectionId);
      }

      const res = await fetch('/api/pending/me', {
        method: 'PATCH',
        headers: jsonHeaders(),
        body: JSON.stringify({ fields }),
      });

      const data = await res.json();
      if (!res.ok) {
        setSubmitError(data.error || 'Greška.');
        return;
      }
      onUpdated(data);
    } catch (err) {
      setSubmitError('Mrežna greška.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PageContainer title="Popunite odbijena polja">
      <Alert kind="info">
        Voditelj sekcije je odbio neka polja. Molimo ispunite ih ponovo. Odobrena polja ostaju nepromijenjena.
      </Alert>

      {submitError && <Alert kind="error">{submitError}</Alert>}

      {approvedFields.length > 0 && (
        <Card title="Odobrena polja (ne mogu se mijenjati)">
          <table className="table-base">
            <tbody>
              {approvedFields.map(([key, value]) => (
                <tr key={key}>
                  <td className="text-content-secondary">{FIELD_LABELS[key] || key}</td>
                  <td>{displayValue(value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Card title="Polja za popuniti">
        <form onSubmit={handleSubmit}>
          {fieldsToRefill.map((key) => (
            <RefillField key={key} fieldKey={key} form={form} lookups={lookups} />
          ))}
          <div className="flex justify-center">
            <button type="submit" disabled={submitting} className="btn-primary mt-2">
              {submitting ? 'Šaljem...' : 'Pošalji ispravke'}
            </button>
          </div>
        </form>
      </Card>
    </PageContainer>
  );
}
