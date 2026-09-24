import { useState, useEffect } from 'react';
import { authHeaders, jsonHeaders } from '../api/auth';
import { PageContainer, Card, Alert, ConfirmDialog } from '../components/ui';

export default function HonoraryMembersPage({ isAdmin }) {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [adding, setAdding] = useState(false);
  const [toDelete, setToDelete] = useState(null);

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/honorary-members', { headers: authHeaders() });
      if (res.ok) setMembers(await res.json());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    setError('');
    if (!firstName.trim() || !lastName.trim()) {
      setError('Ime i prezime su obavezni.');
      return;
    }
    setAdding(true);
    try {
      const res = await fetch('/api/honorary-members', {
        method: 'POST',
        headers: jsonHeaders(),
        body: JSON.stringify({ firstName: firstName.trim(), lastName: lastName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Greška pri dodavanju.');
        return;
      }
      setFirstName('');
      setLastName('');
      setMessage(`${data.firstName} ${data.lastName} je dodan/a.`);
      load();
    } catch (err) {
      setError('Mrežna greška.');
    } finally {
      setAdding(false);
    }
  };

  const confirmDelete = async () => {
    const target = toDelete;
    setToDelete(null);
    setError('');
    try {
      const res = await fetch(`/api/honorary-members/${target.id}`, {
        method: 'DELETE',
        headers: jsonHeaders(),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Greška pri brisanju.');
        return;
      }
      setMessage(`${target.firstName} ${target.lastName} je uklonjen/a.`);
      load();
    } catch (err) {
      setError('Mrežna greška.');
    }
  };

  if (loading) {
    return <PageContainer title="Počasni članovi"><p className="text-content-secondary">Učitavanje...</p></PageContainer>;
  }

  return (
    <PageContainer title="Počasni članovi" maxWidth="max-w-3xl">
      {message && <Alert kind="success">{message}</Alert>}
      {error && <Alert kind="error">{error}</Alert>}

      {isAdmin && (
        <Card title="Dodaj počasnog člana">
          <form onSubmit={handleAdd} className="flex flex-col sm:flex-row gap-3 items-start sm:items-end">
            <div className="flex-1 w-full">
              <label className="label" htmlFor="hm-first">Ime</label>
              <input
                id="hm-first"
                className="input"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
              />
            </div>
            <div className="flex-1 w-full">
              <label className="label" htmlFor="hm-last">Prezime</label>
              <input
                id="hm-last"
                className="input"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
              />
            </div>
            <button type="submit" className="btn-primary" disabled={adding}>
              {adding ? 'Dodajem...' : 'Dodaj'}
            </button>
          </form>
        </Card>
      )}

      <Card className="!p-0 overflow-hidden">
        <table className="table-base">
          <thead>
            <tr>
              <th>Ime i prezime</th>
              {isAdmin && <th></th>}
            </tr>
          </thead>
          <tbody>
            {members.length === 0 && (
              <tr><td colSpan={isAdmin ? 2 : 1} className="text-content-muted">Nema počasnih članova.</td></tr>
            )}
            {members.map((m) => (
              <tr key={m.id}>
                <td>{m.firstName} {m.lastName}</td>
                {isAdmin && (
                  <td className="text-right">
                    <button
                      type="button"
                      className="text-state-error text-xs hover:underline"
                      onClick={() => setToDelete(m)}
                    >
                      Ukloni
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <ConfirmDialog
        open={!!toDelete}
        title="Uklanjanje počasnog člana"
        message={toDelete ? `Ukloniti ${toDelete.firstName} ${toDelete.lastName} s popisa počasnih članova?` : ''}
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      />
    </PageContainer>
  );
}
