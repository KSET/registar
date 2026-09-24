import { useState, useRef } from 'react';
import { authHeaders } from '../api/auth';
import { PageContainer, Card, Alert, ConfirmDialog } from '../components/ui';

export default function ImportPage() {
  const fileInputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [previewing, setPreviewing] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const handleFileChange = (e) => {
    setFile(e.target.files[0] || null);
    setPreview(null);
    setResult(null);
    setError('');
  };

  const runPreview = async () => {
    if (!file) return;
    setPreviewing(true);
    setError('');
    setPreview(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/import/preview', {
        method: 'POST',
        headers: authHeaders(),
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Greška pri pregledu datoteke.');
        return;
      }
      setPreview(data);
    } catch (err) {
      setError('Mrežna greška.');
    } finally {
      setPreviewing(false);
    }
  };

  const runCommit = async () => {
    setConfirmOpen(false);
    setCommitting(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/import/commit', {
        method: 'POST',
        headers: authHeaders(),
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Greška pri uvozu.');
        return;
      }
      setResult(data);
      setPreview(null);
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      setError('Mrežna greška.');
    } finally {
      setCommitting(false);
    }
  };

  return (
    <PageContainer title="Uvoz podataka iz Excela" maxWidth="max-w-4xl">
      <Alert kind="info">
        Uvoz čita list <strong>„_Svi"</strong> (redovni članovi, samo <strong>„Aktivan član: Da"</strong>)
        i list <strong>„C"</strong> (počasni članovi, samo ime i prezime) iz istog Excel registra.
        Potvrde o studiranju (PDF) se ne uvoze — članovi ih naknadno sami učitavaju kroz svoj profil.
      </Alert>

      {error && <Alert kind="error">{error}</Alert>}

      {result && (
        <Alert kind="success">
          Uvoz završen: <strong>{result.created}</strong> novih članova i{' '}
          <strong>{result.honoraryCreated}</strong> novih počasnih članova stvoreno.
          {result.skippedInvalid > 0 && ` ${result.skippedInvalid} redak(a) preskočeno zbog grešaka.`}
          {result.skippedInactive > 0 && ` ${result.skippedInactive} neaktivnih redaka preskočeno.`}
          {result.honoraryDuplicateSkipped > 0 && ` ${result.honoraryDuplicateSkipped} počasnih članova preskočeno (duplikat).`}
        </Alert>
      )}

      <Card title="1. Odaberite datoteku">
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx"
          onChange={handleFileChange}
          className="block text-sm text-content-secondary file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:bg-brand-orange file:text-brand-dark file:text-sm file:font-medium file:cursor-pointer"
        />
        <div className="mt-4">
          <button
            type="button"
            className="btn-primary"
            disabled={!file || previewing}
            onClick={runPreview}
          >
            {previewing ? 'Analiziram...' : 'Pregledaj'}
          </button>
        </div>
      </Card>

      {preview && (
        <Card title="2. Pregled prije uvoza">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4 text-sm">
            <div>
              <div className="text-content-muted">Ukupno redaka</div>
              <div className="text-content-primary text-lg font-semibold">{preview.totalRows}</div>
            </div>
            <div>
              <div className="text-content-muted">Neaktivni (preskočeno)</div>
              <div className="text-content-primary text-lg font-semibold">{preview.inactiveSkipped}</div>
            </div>
            <div>
              <div className="text-state-success">Spremno za uvoz</div>
              <div className="text-state-success text-lg font-semibold">{preview.validCount}</div>
            </div>
            <div>
              <div className="text-state-error">Greške (preskočeno)</div>
              <div className="text-state-error text-lg font-semibold">{preview.invalidCount}</div>
            </div>
          </div>

          {preview.newDrinkNames.length > 0 && (
            <p className="text-xs text-content-muted mb-2">
              Nova pića koja će se stvoriti: {preview.newDrinkNames.join(', ')}
            </p>
          )}

          {preview.honorary && (
            <p className="text-xs text-content-muted mb-4">
              Počasni članovi (list „C"): {preview.honorary.newCount} novih od {preview.honorary.totalRows}
              {preview.honorary.duplicateSkipped > 0 && ` (${preview.honorary.duplicateSkipped} već postoji ili se ponavlja)`}
            </p>
          )}

          {preview.invalid.length > 0 && (
            <div className="overflow-x-auto mb-4">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Redak</th>
                    <th>Ime</th>
                    <th>Greške</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.invalid.map((row) => (
                    <tr key={row.rowNum}>
                      <td>{row.rowNum}</td>
                      <td>{row.personName}</td>
                      <td className="text-state-error text-xs">{row.errors.join(' · ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <button
            type="button"
            className="btn-primary"
            disabled={(preview.validCount === 0 && (preview.honorary?.newCount || 0) === 0) || committing}
            onClick={() => setConfirmOpen(true)}
          >
            {committing ? 'Uvozim...' : `Potvrdi uvoz (${preview.validCount} članova, ${preview.honorary?.newCount || 0} počasnih)`}
          </button>
        </Card>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title="Potvrda uvoza"
        message={`Ovo će stvoriti ${preview?.validCount || 0} novih članova i ${preview?.honorary?.newCount || 0} počasnih članova u bazi. Ova akcija se ne može poništiti kroz sučelje. Nastaviti?`}
        onConfirm={runCommit}
        onCancel={() => setConfirmOpen(false)}
      />
    </PageContainer>
  );
}
