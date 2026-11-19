import { useEffect, useState } from 'react';
import { authHeaders } from '../api/auth';
import { Alert, PageContainer } from '../components/ui';

export default function DeletedMembersPage({ isAdmin }) {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedMember, setSelectedMember] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [restoringId, setRestoringId] = useState(null);

  useEffect(() => {
    const loadDeletedMembers = async () => {
      try {
        const response = await fetch('/api/members/deleted', { headers: authHeaders() });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Nije moguće učitati obrisane korisnike.');
        setMembers(data);
      } catch (loadError) {
        setError(loadError.message || 'Mrežna greška pri učitavanju obrisanih korisnika.');
      } finally {
        setLoading(false);
      }
    };

    loadDeletedMembers();
  }, []);

  const permanentlyDelete = async () => {
    if (!selectedMember) return;
    setError('');
    setDeletingId(selectedMember.id);

    try {
      const response = await fetch(`/api/members/${selectedMember.id}/permanent`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Trajno brisanje nije uspjelo.');

      setMembers((current) => current.filter((member) => member.id !== selectedMember.id));
      setSelectedMember(null);
    } catch (deleteError) {
      setError(deleteError.message || 'Mrežna greška pri trajnom brisanju korisnika.');
    } finally {
      setDeletingId(null);
    }
  };

  const restoreMember = async (member) => {
    setError('');
    setRestoringId(member.id);

    try {
      const response = await fetch(`/api/members/${member.id}/restore`, {
        method: 'POST',
        headers: authHeaders(),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Vraćanje korisnika nije uspjelo.');

      setMembers((current) => current.filter((item) => item.id !== member.id));
    } catch (restoreError) {
      setError(restoreError.message || 'Mrežna greška pri vraćanju korisnika.');
    } finally {
      setRestoringId(null);
    }
  };

  return (
    <PageContainer title="Obrisani korisnici" maxWidth="max-w-5xl">
      {error && <Alert kind="error">{error}</Alert>}

      {loading ? (
        <p className="text-sm text-content-secondary">Učitavanje obrisanih korisnika...</p>
      ) : members.length === 0 ? (
        <p className="text-sm text-content-secondary">Nema obrisanih korisnika.</p>
      ) : (
        <div className="card overflow-x-auto">
          <table className="table-base w-full">
            <thead>
              <tr>
                <th>Ime i prezime</th>
                <th>Matična sekcija</th>
                <th>E-mail</th>
                <th>Obrisan</th>
                {isAdmin && <th><span className="sr-only">Radnje</span></th>}
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr key={member.id}>
                  <td>{member.firstName} {member.lastName}</td>
                  <td>{member.homeSection?.name || '-'}</td>
                  <td>{member.privateEmail || member.ksetEmail || '-'}</td>
                  <td>{new Date(member.deletedAt).toLocaleDateString('hr-HR')}</td>
                  {isAdmin && (
                    <td>
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => restoreMember(member)}
                          disabled={restoringId !== null || deletingId !== null}
                        >
                          {restoringId === member.id ? 'Vraćam...' : 'Vrati među aktivne'}
                        </button>
                        <button
                          type="button"
                          className="btn-secondary border-state-error text-state-error hover:bg-state-error/10"
                          onClick={() => setSelectedMember(member)}
                          disabled={restoringId !== null || deletingId !== null}
                        >
                          Trajno izbriši
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="card w-full max-w-sm p-6" role="dialog" aria-modal="true" aria-labelledby="permanent-delete-title">
            <h2 id="permanent-delete-title" className="mb-2 text-lg font-semibold">Trajno brisanje korisnika</h2>
            <p className="mb-6 text-sm text-content-secondary">
              Trajno izbrisati {selectedMember.firstName} {selectedMember.lastName}? Ova radnja se ne može poništiti.
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setSelectedMember(null)}
                disabled={deletingId !== null}
              >
                Odustani
              </button>
              <button
                type="button"
                className="btn-secondary border-state-error text-state-error hover:bg-state-error/10 disabled:opacity-50"
                onClick={permanentlyDelete}
                disabled={deletingId !== null}
              >
                {deletingId === selectedMember.id ? 'Brišem...' : 'Trajno izbriši'}
              </button>
            </div>
          </div>
        </div>
      )}
    </PageContainer>
  );
}
