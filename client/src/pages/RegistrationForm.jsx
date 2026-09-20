import { useState } from 'react';
import { jsonHeaders } from '../api/auth';
import { useLookupData } from '../useLookupData';
import FieldRenderer from '../components/FieldRenderer';

function isValidOib(oib) {
  if (!/^\d{11}$/.test(oib || '')) return false;
  let remainder = 10;
  for (let i = 0; i < 10; i++) {
    remainder = (remainder + parseInt(oib[i], 10)) % 10;
    if (remainder === 0) remainder = 10;
    remainder = (remainder * 2) % 11;
  }
  const checkDigit = (11 - remainder) % 10;
  return checkDigit === parseInt(oib[10], 10);
}


export default function RegistrationForm({ email, onSubmitted }) {
  const lookups = useLookupData();
  const [errors, setErrors] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const isKset = email.toLowerCase().endsWith('@kset.org');

  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    oib: '',
    dateOfBirth: '',
    address: '',
    gender: '',
    faculty: '',
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
  });

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const handleMultiSelect = (e, field) => {
    const selected = Array.from(e.target.selectedOptions, (o) => parseInt(o.value));
    setForm((prev) => ({ ...prev, [field]: selected }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrors([]);

    if (!isValidOib(form.oib)) {
      setErrors(['OIB nije ispravan (provjerite kontrolnu znamenku).']);
      return;
    }
    setSubmitting(true);

    try {
      const body = { ...form, homeSectionId: parseInt(form.homeSectionId) };

      const res = await fetch('/api/pending', {
        method: 'POST',
        headers: jsonHeaders(),
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) {
        setErrors(data.errors || [data.error || 'Greška pri slanju.']);
        return;
      }
      onSubmitted(data);
    } catch (err) {
      setErrors(['Mrežna greška. Pokušajte ponovo.']);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ padding: '2rem', maxWidth: '700px', margin: '0 auto' }}>
      <h2>Pristupna forma</h2>
      {isKset ? (
        <p>E-mail pri udruzi: <strong>{email}</strong> (postavlja se automatski)</p>
      ) : (
        <p>
          Privatna e-pošta: <strong>{email}</strong> (postavlja se automatski). KSET e-poštu
          možete kasnije povezati u svom profilu, ako je imate.
        </p>
      )}

      {errors.length > 0 && (
        <div style={{ color: 'red', marginBottom: '1rem' }}>
          {errors.map((err, i) => <p key={i}>{err}</p>)}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <fieldset>
          <legend>Osobni podatci</legend>

          <label>Ime *<br />
            <input name="firstName" value={form.firstName} onChange={handleChange} required />
          </label><br /><br />

          <label>Prezime *<br />
            <input name="lastName" value={form.lastName} onChange={handleChange} required />
          </label><br /><br />

          <label>OIB (11 znamenaka) *<br />
            <input name="oib" value={form.oib} onChange={handleChange} maxLength={11} pattern="\d{11}" required />
          </label><br /><br />

          <label>Datum rođenja *<br />
            <input name="dateOfBirth" type="date" value={form.dateOfBirth} onChange={handleChange} required />
          </label><br /><br />

          <label>Adresa *<br />
            <input name="address" value={form.address} onChange={handleChange} required style={{ width: '100%' }} />
          </label><br /><br />

          <label>Spol *<br />
            <select name="gender" value={form.gender} onChange={handleChange} required>
              <option value="">-- Odaberite --</option>
              <option value="M">Muški</option>
              <option value="Z">Ženski</option>
            </select>
          </label><br /><br />

          <label>Fakultet *<br />
            <input name="faculty" value={form.faculty} onChange={handleChange} required />
          </label><br /><br />

          <label>Broj telefona *<br />
            <input name="phone" value={form.phone} onChange={handleChange} required />
          </label><br /><br />

          {isKset && (
            <label>Privatni e-mail *<br />
              <input name="privateEmail" type="email" value={form.privateEmail} onChange={handleChange} required />
            </label>
          )}<br /><br />
        </fieldset>

        <fieldset>
          <legend>Članstvo</legend>

          <label>Datum učlanjenja *<br />
            <input name="memberSince" type="date" value={form.memberSince} onChange={handleChange} required />
          </label><br /><br />

          <label>Broj iskaznice *<br />
            <input name="cardNumber" value={form.cardNumber} onChange={handleChange} required />
          </label><br /><br />

          <label>Razina članstva *<br />
            <select name="membershipLevel" value={form.membershipLevel} onChange={handleChange} required>
              <option value="PRIDRUZENO">Pridruženo</option>
              <option value="PUNOPRAVNO">Punopravno</option>
              <option value="POCASNO">Počasno</option>
              <option value="STARO">Staro</option>
            </select>
          </label><br /><br />

          {form.membershipLevel === 'PUNOPRAVNO' && (
            <><label>Datum postanka punopravnim članom<br />
              <input name="fullMemberSince" type="date" value={form.fullMemberSince} onChange={handleChange} />
            </label><br /><br /></>
          )}

          <label>Matična sekcija *<br />
            <select name="homeSectionId" value={form.homeSectionId} onChange={handleChange} required>
              <option value="">-- Odaberite --</option>
              {lookups.sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label><br /><br />

          <label>Pridružene sekcije (Ctrl+click za više)<br />
            <select multiple size={5} value={form.sectionIds.map(String)} onChange={(e) => handleMultiSelect(e, 'sectionIds')}>
              {lookups.sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label><br /><br />

          <label>Timovi (Ctrl+click za više)<br />
            <select multiple size={3} value={form.teamIds.map(String)} onChange={(e) => handleMultiSelect(e, 'teamIds')}>
              {lookups.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label><br /><br />
        </fieldset>

        <fieldset>
          <legend>Ostalo</legend>

          <label>Tip prehrane *<br />
            <select name="dietType" value={form.dietType} onChange={handleChange} required>
              <option value="">-- Odaberite --</option>
              <option value="MESOJED">Mesojed</option>
              <option value="VEGETARIJANSTVO">Vegetarijanstvo</option>
              <option value="VEGANSTVO">Veganstvo</option>
              <option value="SVEJED">Svejed</option>
            </select>
          </label><br /><br />

          <label>Pića * (Ctrl+click za više, min. 1)<br />
            <select multiple size={5} value={form.drinkIds.map(String)} onChange={(e) => handleMultiSelect(e, 'drinkIds')} required>
              {lookups.drinks.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </label><br /><br />

          <label>Alergije (Ctrl+click za više)<br />
            <select multiple size={5} value={form.allergyIds.map(String)} onChange={(e) => handleMultiSelect(e, 'allergyIds')}>
              {lookups.allergies.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label><br /><br />

          <label>Veličina majice *<br />
            <input name="shirtSize" value={form.shirtSize} onChange={handleChange} placeholder="S, M, L, XL..." required />
          </label><br /><br />

          <label>
            <input name="acceptedDocuments" type="checkbox" checked={form.acceptedDocuments} onChange={handleChange} required />
            {' '}Prihvaćam akte i dokumente udruge *
          </label><br /><br />
        </fieldset>

        <button type="submit" disabled={submitting} style={{ padding: '0.5rem 2rem', fontSize: '1rem' }}>
          {submitting ? 'Šaljem...' : 'Pošalji prijavu'}
        </button>
      </form>
    </div>
  );
}
