import { useState, useEffect } from 'react';
import { jsonHeaders, getToken } from '../api/auth';
import { useLookupData } from '../useLookupData';
import { tdStyle } from '../styles';
import {
  GENDER_OPTIONS,
  MEMBERSHIP_LEVEL_OPTIONS,
  DIET_TYPE_OPTIONS,
} from '../constants';

function formatDate(d) {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('hr');
}

function linkEmailUrl() {
  return `/api/auth/google/link?token=${encodeURIComponent(getToken())}`;
}

const MEMBERSHIP_LABELS = Object.fromEntries(
  MEMBERSHIP_LEVEL_OPTIONS.map((o) => [o.value, o.label])
);

export default function MemberView({ member: initialMember, onUpdated }) {
  const lookups = useLookupData();
  const [member, setMember] = useState(initialMember);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(null);
  const [errors, setErrors] = useState([]);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setMember(initialMember);
  }, [initialMember]);

  const pendingMembership = (member.pendingChanges || []).find(
    (c) => c.fieldName === 'membershipLevel'
  );

  const startEditing = () => {
    setMessage('');
    setErrors([]);
    setForm({
      firstName: member.firstName,
      lastName: member.lastName,
      address: member.address,
      gender: member.gender,
      faculty: member.faculty,
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
    setForm(null);
    setErrors([]);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleMultiSelect = (e, field) => {
    const selected = Array.from(e.target.selectedOptions, (o) => parseInt(o.value));
    setForm((prev) => ({ ...prev, [field]: selected }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrors([]);
    setMessage('');
    setSubmitting(true);

    try {
      const payload = { ...form };
      if (pendingMembership) {
        delete payload.membershipLevel;
      }

      const res = await fetch('/api/members/me', {
        method: 'PATCH',
        headers: jsonHeaders(),
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        setErrors([data.error || 'Greška pri spremanju.']);
        return;
      }

      setMember(data);
      if (onUpdated) onUpdated(data);
      setEditing(false);
      setForm(null);
      setMessage(data.notice || 'Podatci su spremljeni.');
    } catch (err) {
      setErrors(['Mrežna greška.']);
    } finally {
      setSubmitting(false);
    }
  };

  if (!editing) {
    return (
      <div style={{ padding: '2rem', maxWidth: '700px', margin: '0 auto' }}>
        <h2>Moj profil</h2>

        {message && <p>{message}</p>}

        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <tbody>
            <tr><td style={tdStyle}>Ime</td><td style={tdStyle}>{member.firstName}</td></tr>
            <tr><td style={tdStyle}>Prezime</td><td style={tdStyle}>{member.lastName}</td></tr>
            <tr><td style={tdStyle}>OIB (zaključano)</td><td style={tdStyle}>{member.oib}</td></tr>
            <tr><td style={tdStyle}>Datum rođenja (zaključano)</td><td style={tdStyle}>{formatDate(member.dateOfBirth)}</td></tr>
            <tr><td style={tdStyle}>Adresa</td><td style={tdStyle}>{member.address}</td></tr>
            <tr><td style={tdStyle}>Spol</td><td style={tdStyle}>{member.gender === 'M' ? 'Muški' : 'Ženski'}</td></tr>
            <tr><td style={tdStyle}>Fakultet</td><td style={tdStyle}>{member.faculty}</td></tr>
            <tr><td style={tdStyle}>Telefon</td><td style={tdStyle}>{member.phone}</td></tr>
            <tr>
              <td style={tdStyle}>Privatni e-mail</td>
              <td style={tdStyle}>
                {member.privateEmail}
                {!member.privateEmailVerified && (
                  <>
                    {' '}(nepotvrđeno — <a href={linkEmailUrl()}>potvrdi Google prijavom</a>)
                  </>
                )}
              </td>
            </tr>
            <tr>
              <td style={tdStyle}>E-mail pri udruzi</td>
              <td style={tdStyle}>
                {member.ksetEmail || (
                  <>
                    nije povezano — <a href={linkEmailUrl()}>poveži KSET e-poštu</a>
                  </>
                )}
              </td>
            </tr>
            <tr><td style={tdStyle}>Datum učlanjenja (zaključano)</td><td style={tdStyle}>{formatDate(member.memberSince)}</td></tr>
            <tr><td style={tdStyle}>Broj iskaznice (zaključano)</td><td style={tdStyle}>{member.cardNumber}</td></tr>
            <tr>
              <td style={tdStyle}>Razina članstva</td>
              <td style={tdStyle}>
                {MEMBERSHIP_LABELS[member.membershipLevel]}
                {pendingMembership && (
                  <> (promjena na {MEMBERSHIP_LABELS[pendingMembership.newValue]} čeka odobrenje)</>
                )}
              </td>
            </tr>
            {member.fullMemberSince && (
              <tr><td style={tdStyle}>Punopravni od</td><td style={tdStyle}>{formatDate(member.fullMemberSince)}</td></tr>
            )}
            <tr><td style={tdStyle}>Matična sekcija</td><td style={tdStyle}>{member.homeSection?.name}</td></tr>
            <tr><td style={tdStyle}>Pridružene sekcije</td><td style={tdStyle}>{member.sections.map((s) => s.section.name).join(', ') || '-'}</td></tr>
            <tr><td style={tdStyle}>Timovi</td><td style={tdStyle}>{member.teams.map((t) => t.team.name).join(', ') || '-'}</td></tr>
            <tr><td style={tdStyle}>Tip prehrane</td><td style={tdStyle}>{member.dietType}</td></tr>
            <tr><td style={tdStyle}>Pića</td><td style={tdStyle}>{member.drinks.map((d) => d.drink.name).join(', ') || '-'}</td></tr>
            <tr><td style={tdStyle}>Alergije</td><td style={tdStyle}>{member.allergies.map((a) => a.allergy.name).join(', ') || '-'}</td></tr>
            <tr><td style={tdStyle}>Veličina majice</td><td style={tdStyle}>{member.shirtSize}</td></tr>
            <tr><td style={tdStyle}>Potvrda valjana do (upload uskoro)</td><td style={tdStyle}>{formatDate(member.certificateValidUntil)}</td></tr>
            <tr><td style={tdStyle}>Rola</td><td style={tdStyle}>{member.appRole}</td></tr>
          </tbody>
        </table>

        <br />
        <button onClick={startEditing} style={{ padding: '0.5rem 2rem', fontSize: '1rem' }}>
          Uredi profil
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '700px', margin: '0 auto' }}>
      <h2>Uredi profil</h2>

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

          <p>OIB (zaključano): {member.oib}</p>
          <p>Datum rođenja (zaključano): {formatDate(member.dateOfBirth)}</p>

          <label>Adresa *<br />
            <input name="address" value={form.address} onChange={handleChange} required style={{ width: '100%' }} />
          </label><br /><br />

          <label>Spol *<br />
            <select name="gender" value={form.gender} onChange={handleChange} required>
              {GENDER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label><br /><br />

          <label>Fakultet *<br />
            <input name="faculty" value={form.faculty} onChange={handleChange} required />
          </label><br /><br />

          <label>Telefon *<br />
            <input name="phone" value={form.phone} onChange={handleChange} required />
          </label><br /><br />

          <label>Privatni e-mail *<br />
            <input name="privateEmail" type="email" value={form.privateEmail} onChange={handleChange} required />
          </label><br /><br />
        </fieldset>

        <fieldset>
          <legend>Članstvo</legend>

          <p>Broj iskaznice (zaključano): {member.cardNumber}</p>
          <p>Datum učlanjenja (zaključano): {formatDate(member.memberSince)}</p>

          {pendingMembership ? (
            <p>Razina članstva: promjena na {MEMBERSHIP_LABELS[pendingMembership.newValue]} čeka odobrenje voditelja. Ne možete je mijenjati dok se ne obradi.</p>
          ) : (
            <>
              <label>Razina članstva (promjena ide voditelju na odobrenje)<br />
                <select name="membershipLevel" value={form.membershipLevel} onChange={handleChange}>
                  {MEMBERSHIP_LEVEL_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label><br /><br />
            </>
          )}

          {member.membershipLevel === 'PUNOPRAVNO' && (
            <><label>Datum postanka punopravnim članom<br />
              <input name="fullMemberSince" type="date" value={form.fullMemberSince} onChange={handleChange} />
            </label><br /><br /></>
          )}

          <p>Matična sekcija (zaključano): {member.homeSection?.name}</p>

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
              {DIET_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
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
            <input name="shirtSize" value={form.shirtSize} onChange={handleChange} required />
          </label><br /><br />
        </fieldset>

        <button type="submit" disabled={submitting} style={{ padding: '0.5rem 2rem', fontSize: '1rem' }}>
          {submitting ? 'Spremam...' : 'Spremi promjene'}
        </button>
        {' '}
        <button type="button" onClick={cancelEditing} style={{ padding: '0.5rem 2rem', fontSize: '1rem' }}>
          Odustani
        </button>
      </form>
    </div>
  );
}
