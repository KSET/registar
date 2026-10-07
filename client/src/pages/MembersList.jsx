import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { authHeaders, jsonHeaders, openCertificate } from '../api/auth';
import { useLookupData } from '../useLookupData';
import { useForm } from '../useForm';
import { memberValidators } from '../validation';
import { MEMBERSHIP_LEVEL_OPTIONS, DIET_TYPE_OPTIONS, GENDER_OPTIONS, SHIRT_SIZE_OPTIONS } from '../constants';
import { formatDate } from '../date';
import { formatAddress } from '../address';
import { PageContainer, Card, Alert, ConfirmDialog, ErrorPopup } from '../components/ui';
import { TextField, SelectField, MultiCheckDropdown, CheckboxField, DateField } from '../components/Field';
import MembershipLabel from '../components/MembershipLabel';

const DIET_LABELS = Object.fromEntries(DIET_TYPE_OPTIONS.map((o) => [o.value, o.label]));
const GENDER_LABELS = Object.fromEntries(GENDER_OPTIONS.map((o) => [o.value, o.label]));
const ROLE_LABELS = {
  CLAN: 'Član',
  VODITELJ_SEKCIJE: 'Voditelj sekcije',
  ADMINISTRATOR: 'Administrator',
  NADZORNI: 'Nadzorni',
  SANKER: 'Šef šanka',
  VODITELJ_PROGRAMA: 'Voditelj programa',
};
const COUNCIL_FILTER = 'savjet';
const FACULTY_OTHER = 'OTHER';
const DEFAULT_VISIBLE_COLUMNS = [
  'cardNumber',
  'ksetEmail',
  'privateEmail',
  'phone',
  'section',
  'updated',
];
const MEMBER_COLUMNS = [
  { key: 'name', label: 'Ime i prezime', sortKey: 'name' },
  { key: 'cardNumber', label: 'Šifra iskaznice', sortKey: 'cardNumber' },
  { key: 'ksetEmail', label: 'KSET e-mail', sortKey: 'ksetEmail' },
  { key: 'privateEmail', label: 'Privatni e-mail', sortKey: 'privateEmail' },
  { key: 'phone', label: 'Telefon', sortKey: 'phone' },
  { key: 'section', label: 'Matična sekcija', sortKey: 'section' },
  { key: 'updated', label: 'Ažurirao formu ove akademske godine', sortKey: 'updated' },
  { key: 'faculty', label: 'Fakultet', sortKey: 'faculty' },
  { key: 'membershipLevel', label: 'Boja iskaznice', sortKey: 'membershipLevel' },
  { key: 'birthYear', label: 'Godina rođenja', sortKey: 'birthYear' },
];
const OPTIONAL_MEMBER_COLUMNS = MEMBER_COLUMNS.filter(({ key }) => key !== 'name');

function readSavedColumns() {
  try {
    const saved = JSON.parse(localStorage.getItem('members-table-columns-v1') || 'null');
    if (Array.isArray(saved)) {
      const valid = saved.filter((key) => OPTIONAL_MEMBER_COLUMNS.some((column) => column.key === key));
      return [...new Set(valid)];
    }
  } catch (error) {
    console.warn('Nije moguće učitati spremljene stupce tablice članova.', error);
  }
  return DEFAULT_VISIBLE_COLUMNS;
}

function toDateInput(d) {
  return d ? d.split('T')[0] : '';
}

function facultyDisplay(m) {
  return m.faculty?.name || m.facultyOther || '-';
}

function updatedThisAcademicYear(certificateApprovedAt) {
  if (!certificateApprovedAt) return false;

  const approvedAt = new Date(certificateApprovedAt);
  if (Number.isNaN(approvedAt.getTime())) return false;

  const now = new Date();
  const academicYearStart = new Date(
    now.getFullYear() - (now.getMonth() < 9 ? 1 : 0),
    9,
    1
  );
  return approvedAt >= academicYearStart;
}

function AcademicYearUpdateStatus({ certificateApprovedAt }) {
  const isUpdated = updatedThisAcademicYear(certificateApprovedAt);
  return (
    <span
      className={isUpdated ? 'font-bold text-state-success' : 'font-bold text-state-error'}
      aria-label={isUpdated ? 'Ažurirao formu ove akademske godine' : 'Nije ažurirao formu ove akademske godine'}
      title={isUpdated ? 'Ažurirao formu ove akademske godine' : 'Nije ažurirao formu ove akademske godine'}
    >
      {isUpdated ? '✓' : '✕'}
    </span>
  );
}

function SortableHeader({ column, label, sortBy, sortDirection, onSort }) {
  const active = sortBy === column;
  return (
    <th aria-sort={active ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button
        type="button"
      className="flex w-full items-start gap-1 text-left text-xs whitespace-normal break-words hover:text-content-primary"
        onClick={() => onSort(column)}
      >
        {label}
      <span aria-hidden="true" className="shrink-0 text-content-muted">
          {active ? (sortDirection === 'asc' ? '↑' : '↓') : '↕'}
        </span>
      </button>
    </th>
  );
}

function CopyableValue({ value, label, copyKey, feedback, onCopy }) {
  if (!value) return '-';

  return (
    <>
      <button
        type="button"
        className="text-left hover:text-brand-orange focus:outline-none focus:underline"
        title={`Kliknite za kopiranje: ${label}`}
        onClick={(event) => onCopy(event, value, copyKey, label)}
      >
        {value}
      </button>
      {feedback?.key === copyKey && (
        <span
          className={`block text-xs ${feedback.status === 'copied' ? 'text-state-success' : 'text-state-error'}`}
          role="status"
        >
          {feedback.status === 'copied' ? 'Kopirano' : 'Kopiranje nije uspjelo'}
        </span>
      )}
    </>
  );
}

export default function MembersList({ isAdmin, canManageMembership }) {
  const lookups = useLookupData();
  const [searchParams, setSearchParams] = useSearchParams();
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sectionFilter, setSectionFilter] = useState(null); // null = svi
  const [showOnlyHomeMembers, setShowOnlyHomeMembers] = useState(false);
  const [sortBy, setSortBy] = useState('name');
  const [sortDirection, setSortDirection] = useState('asc');
  const [facultyFilter, setFacultyFilter] = useState('');
  const [membershipFilter, setMembershipFilter] = useState('');
  const [birthYearFilter, setBirthYearFilter] = useState('');
  const [visibleColumns, setVisibleColumns] = useState(readSavedColumns);
  const selectedMemberParam = searchParams.get('member');
  const selectedId = selectedMemberParam && /^[1-9]\d*$/.test(selectedMemberParam)
    ? Number(selectedMemberParam)
    : null;
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [copyFeedback, setCopyFeedback] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');

  const openMember = (id) => {
    setSearchParams((params) => {
      params.set('member', String(id));
      return params;
    });
  };

  const closeMember = () => {
    setSearchParams((params) => {
      params.delete('member');
      return params;
    }, { replace: true });
  };

  const handleSort = (column) => {
    if (sortBy === column) {
      setSortDirection((direction) => (direction === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(column);
      setSortDirection('asc');
    }
  };

  const toggleColumn = (column) => {
    setVisibleColumns((current) => {
      const next = current.includes(column)
        ? current.filter((key) => key !== column)
        : [...current, column];
      try {
        localStorage.setItem('members-table-columns-v1', JSON.stringify(next));
      } catch (error) {
        console.warn('Nije moguće spremiti odabrane stupce tablice članova.', error);
      }
      return next;
    });
  };

  const handleExport = async () => {
    setExportError('');
    setExporting(true);
    try {
      const response = await fetch('/api/members/export', { headers: authHeaders() });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Izvoz članova nije uspio.');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${isAdmin ? 'kset-clanovi' : 'kset-sekcija-clanovi'}-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      setExportError(error.message || 'Izvoz članova nije uspio.');
    } finally {
      setExporting(false);
    }
  };

  const openMemberUnlessTextSelected = (id) => {
    if (window.getSelection()?.toString()) return;
    openMember(id);
  };

  const copyValue = async (event, value, key, label) => {
    event.stopPropagation();
    if (!value) return;

    try {
      await navigator.clipboard.writeText(value);
      setCopyFeedback({ key, status: 'copied' });
    } catch (error) {
      console.error(`Kopiranje polja "${label}" nije uspjelo.`, error);
      setCopyFeedback({ key, status: 'error' });
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (selectedId === null) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    fetch(`/api/members/${selectedId}`, { headers: authHeaders() })
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => { if (!cancelled) setDetail(data); })
      .catch(() => { if (!cancelled) setDetail(null); })
      .finally(() => { if (!cancelled) setDetailLoading(false); });
    return () => { cancelled = true; };
  }, [selectedId]);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/members', { headers: authHeaders() });
      if (res.ok) setMembers(await res.json());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const filtered = members.filter((m) => {
    const q = search.toLowerCase();
    const matchesSearch =
      `${m.firstName} ${m.lastName}`.toLowerCase().includes(q) ||
      (m.ksetEmail || '').toLowerCase().includes(q) ||
      (m.privateEmail || '').toLowerCase().includes(q);
    const matchesSection =
      sectionFilter === null ||
      (sectionFilter === COUNCIL_FILTER
        ? m.isCouncilMember
        : m.homeSection?.id === sectionFilter
          || (!showOnlyHomeMembers
            && m.isManagedSectionMember
            && m.managedSectionId === sectionFilter));
    const matchesManagedSection = !canManageMembership || isAdmin
      || (showOnlyHomeMembers ? m.isHomeSectionMember : m.isManagedSectionMember);
    return matchesSearch
      && matchesSection
      && matchesManagedSection
      && (!facultyFilter || (m.facultyName || '').toLocaleLowerCase('hr').includes(facultyFilter.trim().toLocaleLowerCase('hr')))
      && (!membershipFilter || m.membershipLevel === membershipFilter)
      && (!birthYearFilter || String(m.birthYear) === birthYearFilter);
  });

  const sortedMembers = [...filtered].sort((a, b) => {
    const getValue = (member) => {
      switch (sortBy) {
        case 'name': return `${member.firstName} ${member.lastName}`;
        case 'section': return member.homeSection?.name || '';
        case 'updated': return updatedThisAcademicYear(member.certificateApprovedAt) ? 'Da' : 'Ne';
        case 'faculty': return member.facultyName || '';
        case 'membershipLevel': return MEMBERSHIP_LEVEL_OPTIONS.find((option) => option.value === member.membershipLevel)?.label || '';
        case 'birthYear': return member.birthYear || '';
        default: return member[sortBy] || '';
      }
    };
    const comparison = String(getValue(a)).localeCompare(String(getValue(b)), 'hr', {
      sensitivity: 'base',
      numeric: true,
    });
    return sortDirection === 'asc' ? comparison : -comparison;
  });
  const availableFaculties = [...new Set(members.map((member) => member.facultyName).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'hr', { sensitivity: 'base' }));
  const availableBirthYears = [...new Set(members.map((member) => member.birthYear).filter(Boolean))]
    .sort((a, b) => b - a);
  const columnsToShow = isAdmin ? DEFAULT_VISIBLE_COLUMNS : visibleColumns;
  const tableColumns = MEMBER_COLUMNS.filter(
    ({ key }) => key === 'name' || columnsToShow.includes(key)
  );
  const renderColumnValue = (member, column) => {
    switch (column.key) {
      case 'name': return `${member.firstName} ${member.lastName}`;
      case 'cardNumber': return member.cardNumber || '-';
      case 'ksetEmail':
      case 'privateEmail':
      case 'phone':
        return (
          <CopyableValue
            value={member[column.key]}
            label={column.label}
            copyKey={`${member.id}-${column.key}`}
            feedback={copyFeedback}
            onCopy={copyValue}
          />
        );
      case 'section': return member.homeSection?.name || '-';
      case 'updated': return <AcademicYearUpdateStatus certificateApprovedAt={member.certificateApprovedAt} />;
      case 'faculty': return member.facultyName || '-';
      case 'membershipLevel': return <MembershipLabel value={member.membershipLevel} />;
      case 'birthYear': return member.birthYear || '-';
      default: return '-';
    }
  };

  if (loading) {
    return <PageContainer title="Članovi"><p className="text-content-secondary">Učitavanje...</p></PageContainer>;
  }

  if (selectedId !== null) {
    if (detailLoading || !detail) {
      return (
        <PageContainer title="Članovi">
          <button onClick={closeMember} className="btn-ghost mb-4">← Natrag na popis</button>
          <p className="text-content-secondary">Učitavanje...</p>
        </PageContainer>
      );
    }
    return (
      <MemberDetail
        member={detail}
        isAdmin={isAdmin}
        canManageMembership={canManageMembership}
        lookups={lookups}
        onBack={closeMember}
        onRoleChanged={() => { closeMember(); load(); }}
        onUpdated={(updated) => { setDetail(updated); load(); }}
        onDeleted={() => { closeMember(); load(); }}
        setMessage={setMessage}
      />
    );
  }

  return (
    <PageContainer title="Članovi" maxWidth="max-w-full">
      {message && <Alert kind="success">{message}</Alert>}
      {exportError && <Alert kind="error">{exportError}</Alert>}

      {(isAdmin || canManageMembership) && (
        <div className="mb-4 flex justify-end">
          <button type="button" className="btn-primary" onClick={handleExport} disabled={exporting}>
            {exporting ? 'Izvozim...' : isAdmin ? 'Izvezi sve u Excel' : 'Izvezi svoju sekciju u Excel'}
          </button>
        </div>
      )}
      <div className="mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setSectionFilter(null)}
          className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
            sectionFilter === null
              ? 'bg-brand-orange text-brand-dark border-brand-orange'
              : 'border-surface-border text-content-secondary hover:text-content-primary hover:bg-surface-overlay'
          }`}
        >
          Sve članovi
        </button>
        {lookups.sections.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSectionFilter(s.id)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              sectionFilter === s.id
                ? 'bg-brand-orange text-brand-dark border-brand-orange'
                : 'border-surface-border text-content-secondary hover:text-content-primary hover:bg-surface-overlay'
            }`}
          >
            {s.name}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setSectionFilter(COUNCIL_FILTER)}
          className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
            sectionFilter === COUNCIL_FILTER
              ? 'bg-brand-orange text-brand-dark border-brand-orange'
              : 'border-surface-border text-content-secondary hover:text-content-primary hover:bg-surface-overlay'
          }`}
        >
          Savjet
        </button>
      </div>

      {!isAdmin && canManageMembership && (
        <label className="mb-4 flex w-fit cursor-pointer items-center gap-2 text-sm text-content-secondary">
          <input
            type="checkbox"
            checked={showOnlyHomeMembers}
            onChange={(event) => setShowOnlyHomeMembers(event.target.checked)}
          />
          Vidi samo matične
        </label>
      )}

      <div className="mb-4">
        <input
          className="input max-w-sm"
          placeholder="Pretraži po imenu ili e-mailu..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="text-xs text-content-secondary">
          Fakultet
          <input
            className="input mt-1 block min-w-44"
            list="member-faculty-options"
            placeholder="Svi fakulteti"
            value={facultyFilter}
            onChange={(event) => setFacultyFilter(event.target.value)}
          />
          <datalist id="member-faculty-options">
            {availableFaculties.map((faculty) => <option key={faculty} value={faculty} />)}
          </datalist>
        </label>
        <label className="text-xs text-content-secondary">
          Boja iskaznice
          <select className="input mt-1 block min-w-40" value={membershipFilter} onChange={(event) => setMembershipFilter(event.target.value)}>
            <option value="">Sve boje</option>
            {MEMBERSHIP_LEVEL_OPTIONS.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="text-xs text-content-secondary">
          Godina rođenja
          <select className="input mt-1 block min-w-40" value={birthYearFilter} onChange={(event) => setBirthYearFilter(event.target.value)}>
            <option value="">Sve godine</option>
            {availableBirthYears.map((year) => <option key={year} value={year}>{year}</option>)}
          </select>
        </label>
        {(facultyFilter || membershipFilter || birthYearFilter) && (
          <button
            type="button"
            className="btn-ghost text-xs"
            onClick={() => {
              setFacultyFilter('');
              setMembershipFilter('');
              setBirthYearFilter('');
            }}
          >
            Očisti filtre
          </button>
        )}
      </div>

      {!isAdmin && canManageMembership && (
        <details className="mb-4 rounded-lg border border-surface-border p-3">
          <summary className="cursor-pointer text-sm font-medium">Odaberi stupce</summary>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
            {OPTIONAL_MEMBER_COLUMNS.map(({ key, label }) => (
              <label key={key} className="flex items-center gap-2 text-sm text-content-secondary">
                <input
                  type="checkbox"
                  checked={visibleColumns.includes(key)}
                  onChange={() => toggleColumn(key)}
                />
                {label}
              </label>
            ))}
          </div>
        </details>
      )}

      {/* Desktop */}
      <Card className="!p-0 overflow-hidden hidden md:block">
        <table className="table-base w-full table-fixed text-xs">
          <thead>
            <tr>
              {tableColumns.map((column) => (
                <SortableHeader
                  key={column.key}
                  column={column.key}
                  label={column.label}
                  {...{ sortBy, sortDirection, onSort: handleSort }}
                />
              ))}
              <th aria-label="Detalji" className="!px-1.5"></th>
            </tr>
          </thead>
          <tbody>
            {sortedMembers.length === 0 && (
              <tr><td colSpan={tableColumns.length + 1} className="!px-1.5 text-content-muted">Nema članova.</td></tr>
            )}
            {sortedMembers.map((m) => (
              <tr key={m.id} className="hover:bg-surface-overlay cursor-pointer" onClick={() => openMemberUnlessTextSelected(m.id)}>
                {tableColumns.map((column) => (
                  <td key={column.key} className="!px-1.5 break-words [overflow-wrap:anywhere]">
                    {renderColumnValue(m, column)}
                  </td>
                ))}
                <td className="!px-1.5 break-words text-brand-orange">Detalji →</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/* Mobile */}
      <div className="md:hidden space-y-3">
        {sortedMembers.length === 0 && (
          <Card><p className="text-content-muted">Nema članova.</p></Card>
        )}
        {sortedMembers.map((m) => (
          <Card key={m.id} className="!mb-0 cursor-pointer hover:bg-surface-overlay" >
            <div onClick={() => openMemberUnlessTextSelected(m.id)}>
              <div className="font-medium mb-1">{m.firstName} {m.lastName}</div>
              {tableColumns.filter(({ key }) => key !== 'name').map((column) => (
                <div key={column.key} className="text-sm text-content-secondary mt-1">
                  <span className="text-content-muted">{column.label}: </span>
                  {renderColumnValue(m, column)}
                </div>
              ))}
              <div className="text-brand-orange text-sm mt-2">Detalji →</div>
            </div>
          </Card>
        ))}
      </div>

    </PageContainer>
  );
}

function InfoRow({ label, value, children }) {
  return (
    <div className="flex justify-between gap-4 py-2 border-b border-surface-border last:border-0">
      <span className="text-content-secondary text-sm">{label}</span>
      <span className="text-content-primary text-sm text-right min-w-0 break-words">{children ?? value ?? '-'}</span>
    </div>
  );
}

function MembershipManager({ member, onSaved }) {
  const [membershipLevel, setMembershipLevel] = useState(member.membershipLevel);
  const [cardNumber, setCardNumber] = useState(member.cardNumber || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSaving(true);
    try {
      const res = await fetch(`/api/members/${member.id}/management`, {
        method: 'PATCH',
        headers: jsonHeaders(),
        body: JSON.stringify({ membershipLevel, cardNumber }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Greška pri spremanju.');
        return;
      }
      onSaved(data);
    } catch (err) {
      setError('Mrežna greška.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card title="Upravljanje članstvom">
      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
          <div className="mb-4">
            <label className="label" htmlFor="managed-membership-level">Razina članstva</label>
            <select id="managed-membership-level" className="input" value={membershipLevel} onChange={(event) => setMembershipLevel(event.target.value)}>
              {MEMBERSHIP_LEVEL_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>
          <div className="mb-4">
            <label className="label" htmlFor="managed-card-number">Broj iskaznice</label>
            <input id="managed-card-number" className="input" value={cardNumber} onChange={(event) => setCardNumber(event.target.value)} />
          </div>
        </div>
        {error && <Alert kind="error">{error}</Alert>}
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? 'Spremam...' : 'Spremi'}
        </button>
      </form>
    </Card>
  );
}

function MemberDetail({ member, isAdmin, canManageMembership, lookups, onBack, onRoleChanged, onUpdated, onDeleted, setMessage }) {
  const [role, setRole] = useState(member.appRole || 'CLAN');
  const [managedSectionId, setManagedSectionId] = useState(member.managedSectionId ? String(member.managedSectionId) : '');
  const [error, setError] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const isLimited = member.limited;

  const handleOpenCert = async () => {
    try {
      await openCertificate(member.id, 'member');
    } catch (err) {
      setError(err.message);
    }
  };

  const submitRole = async () => {
    setConfirmOpen(false);
    setError('');
    try {
      const res = await fetch(`/api/members/${member.id}/role`, {
        method: 'PATCH',
        headers: jsonHeaders(),
        body: JSON.stringify({
          appRole: role,
          managedSectionId: role === 'VODITELJ_SEKCIJE' ? managedSectionId : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Greška pri promjeni uloge.');
        return;
      }
      setMessage('Uloga je promijenjena.');
      onRoleChanged();
    } catch (err) {
      setError('Mrežna greška.');
    }
  };

  const submitDelete = async () => {
    setDeleteConfirmOpen(false);
    setError('');
    try {
      const res = await fetch(`/api/members/${member.id}`, {
        method: 'DELETE',
        headers: jsonHeaders(),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Greška pri brisanju.');
        return;
      }
      setMessage(`${member.firstName} ${member.lastName} je izbrisan/a.`);
      onDeleted();
    } catch (err) {
      setError('Mrežna greška.');
    }
  };

  return (
    <PageContainer title={`${member.firstName} ${member.lastName}`}>
      <button onClick={onBack} className="btn-ghost mb-4">← Natrag na popis</button>

      {error && <Alert kind="error">{error}</Alert>}

      {editing ? (
        <MemberEditForm
          member={member}
          lookups={lookups}
          submitting={submitting}
          setSubmitting={setSubmitting}
          setError={setError}
          onCancel={() => setEditing(false)}
          onSaved={(updated) => {
            setEditing(false);
            setMessage('Podatci su spremljeni.');
            onUpdated(updated);
          }}
        />
      ) : isLimited ? (
        <Card title="Osnovni podatci">
          <InfoRow label="Ime" value={member.firstName} />
          <InfoRow label="Prezime" value={member.lastName} />
          <InfoRow label="KSET e-mail" value={member.ksetEmail} />
          <InfoRow label="Privatni e-mail" value={member.privateEmail} />
          <InfoRow label="Telefon" value={member.phone} />
          <InfoRow label="Matična sekcija" value={member.homeSection?.name} />
          <p className="text-xs text-content-muted mt-3">
            Ovaj član nije u vašoj sekciji, pa vidite samo osnovne podatke.
          </p>
        </Card>
      ) : (
        <>
          <Card title="Osobni podatci">
            <InfoRow label="Ime" value={member.firstName} />
            <InfoRow label="Prezime" value={member.lastName} />
            <InfoRow label="OIB" value={member.oib} />
            <InfoRow label="Datum rođenja" value={formatDate(member.dateOfBirth)} />
            <InfoRow label="Spol" value={GENDER_LABELS[member.gender] || member.gender} />
            <InfoRow label="Adresa" value={formatAddress(member)} />
            <InfoRow label="Fakultet" value={facultyDisplay(member)} />
            <InfoRow label="Telefon" value={member.phone} />
            <InfoRow label="Privatni e-mail" value={member.privateEmail} />
            <InfoRow label="KSET e-mail" value={member.ksetEmail} />
            <InfoRow label="Kako ste saznali za KSET?" value={member.referralSource} />
          </Card>

          <Card title="Članstvo">
            <InfoRow label="Datum učlanjenja" value={formatDate(member.memberSince)} />
            <InfoRow label="Broj iskaznice" value={member.cardNumber || '-'} />
            <InfoRow label="Razina članstva"><MembershipLabel value={member.membershipLevel} /></InfoRow>
            {member.fullMemberSince && <InfoRow label="Punopravni od" value={formatDate(member.fullMemberSince)} />}
            <InfoRow label="Matična sekcija" value={member.homeSection?.name} />
            <InfoRow label="Pridružene sekcije" value={member.sections?.map((s) => s.section.name).join(', ') || '-'} />
            <InfoRow label="Timovi" value={member.teams?.map((t) => t.team.name).join(', ') || '-'} />
            <InfoRow label="Uloga" value={ROLE_LABELS[member.appRole]} />
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
          </Card>

          <Card title="Ostalo">
            <InfoRow label="Tip prehrane" value={DIET_LABELS[member.dietType]} />
            <InfoRow label="Pića" value={member.drinks?.map((d) => d.drink.name).join(', ') || '-'} />
            <InfoRow label="Alergije" value={member.allergies?.map((a) => a.allergy.name).join(', ') || '-'} />
            <InfoRow label="Veličina majice" value={member.shirtSize} />
          </Card>
        </>
      )}

      {canManageMembership && member.canManageMembership && !isLimited && !editing && (
        <MembershipManager
          member={member}
          onSaved={(changes) => {
            onUpdated({ ...member, ...changes });
            setMessage('Podatci o članstvu su spremljeni.');
          }}
        />
      )}

      {isAdmin && !isLimited && !editing && (
        <Card title="Administracija">
          <div className="flex flex-wrap gap-3">
            <button className="btn-secondary" onClick={() => setEditing(true)}>
              Uredi podatke
            </button>
            <button
              className="btn-secondary border-state-error text-state-error hover:bg-state-error/10"
              onClick={() => setDeleteConfirmOpen(true)}
            >
              Izbriši člana
            </button>
          </div>
        </Card>
      )}

      {isAdmin && !editing && (
        <Card title="Upravljanje ulogom">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
            <div className="mb-4">
              <label className="label">Uloga</label>
              <select className="input" value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="CLAN">Član</option>
                <option value="VODITELJ_SEKCIJE">Voditelj sekcije</option>
                <option value="ADMINISTRATOR">Administrator</option>
                <option value="NADZORNI">Nadzorni</option>
                <option value="SANKER">Šef šanka</option>
                <option value="VODITELJ_PROGRAMA">Voditelj programa</option>
              </select>
            </div>

            {role === 'VODITELJ_SEKCIJE' && (
              <div className="mb-4">
                <label className="label">Sekcija koju vodi</label>
                <select className="input" value={managedSectionId} onChange={(e) => setManagedSectionId(e.target.value)}>
                  <option value="">-- Odaberite --</option>
                  {lookups.sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            )}
          </div>

          <button
            className="btn-primary"
            disabled={role === 'VODITELJ_SEKCIJE' && !managedSectionId}
            onClick={() => setConfirmOpen(true)}
          >
            Spremi ulogu
          </button>
        </Card>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title="Promjena uloge"
        message={`Postaviti ${member.firstName} ${member.lastName} kao ${ROLE_LABELS[role]}?`}
        onConfirm={submitRole}
        onCancel={() => setConfirmOpen(false)}
      />

      <ConfirmDialog
        open={deleteConfirmOpen}
        title="Brisanje člana"
        message={`Trajno izbrisati ${member.firstName} ${member.lastName}? Ova se akcija ne može poništiti.`}
        onConfirm={submitDelete}
        onCancel={() => setDeleteConfirmOpen(false)}
      />

      <ErrorPopup message={error} onClose={() => setError('')} />
    </PageContainer>
  );
}

function MemberEditForm({ member, lookups, submitting, setSubmitting, setError, onCancel, onSaved }) {
  const initialFacultyId = member.faculty?.id
    ? String(member.faculty.id)
    : member.facultyOther
    ? FACULTY_OTHER
    : '';

  const form = useForm(
    {
      firstName: member.firstName,
      lastName: member.lastName,
      oib: member.oib,
      dateOfBirth: toDateInput(member.dateOfBirth),
      address: member.address,
      houseNumber: member.houseNumber || '',
      postalCode: member.postalCode || '',
      city: member.city || '',
      gender: member.gender,
      facultyId: initialFacultyId,
      facultyOther: member.facultyOther || '',
      phone: member.phone,
      privateEmail: member.privateEmail,
      cardNumber: member.cardNumber || '',
      membershipLevel: member.membershipLevel,
      fullMemberSince: member.fullMemberSince ? member.fullMemberSince.split('T')[0] : '',
      dietType: member.dietType,
      shirtSize: member.shirtSize,
      transportVolunteer: member.transportVolunteer ?? false,
      homeSectionId: member.homeSectionId ? String(member.homeSectionId) : '',
      sectionIds: member.sections.map((s) => s.section.id).filter((id) => String(id) !== String(member.homeSectionId)),
      teamIds: member.teams.map((t) => t.team.id),
      drinkIds: member.drinks.map((d) => d.drink.id),
      allergyIds: member.allergies.map((a) => a.allergy.id),
    },
    memberValidators
  );

  const { values, handleChange, handleBlur, showError } = form;

  const handleHomeSectionChange = (name, value) => {
    handleChange(name, value);
    handleChange('sectionIds', values.sectionIds.filter((id) => String(id) !== String(value)));
  };

  const facultyOptions = [
    ...lookups.faculties.map((f) => ({ value: String(f.id), label: f.name })),
    { value: FACULTY_OTHER, label: 'Ostalo (upišite)' },
  ];

  // Consent and referral source are historical records and are not editable in
  // this form, so their validators must not block unrelated profile changes.
  const EDITABLE_FIELDS = Object.keys(memberValidators).filter(
    (field) => !['acceptedDocuments', 'referralSource'].includes(field)
  );

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!form.validateAll(EDITABLE_FIELDS)) {
      setError('Ispravite označena polja prije spremanja.');
      return;
    }

    setSubmitting(true);
    try {
      const payload = { ...values };
      payload.facultyId = values.facultyId && values.facultyId !== FACULTY_OTHER ? parseInt(values.facultyId) : null;
      payload.facultyOther = values.facultyId === FACULTY_OTHER ? values.facultyOther : null;
      payload.cardNumber = values.cardNumber.trim() || null;

      const res = await fetch(`/api/members/${member.id}`, {
        method: 'PATCH',
        headers: jsonHeaders(),
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Greška pri spremanju.');
        return;
      }
      onSaved(data);
    } catch (err) {
      setError('Mrežna greška.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <Card title="Osobni podatci">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
          <TextField name="firstName" label="Ime" required
            value={values.firstName} onChange={handleChange} onBlur={handleBlur} error={showError('firstName')} />
          <TextField name="lastName" label="Prezime" required
            value={values.lastName} onChange={handleChange} onBlur={handleBlur} error={showError('lastName')} />
          <TextField name="oib" label="OIB" required maxLength={11}
            value={values.oib} onChange={handleChange} onBlur={handleBlur} error={showError('oib')} />
          <DateField name="dateOfBirth" label="Datum rođenja" required
            value={values.dateOfBirth} onChange={handleChange} onBlur={handleBlur} error={showError('dateOfBirth')} />
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
          <TextField name="cardNumber" label="Broj iskaznice"
            value={values.cardNumber} onChange={handleChange} onBlur={handleBlur} error={showError('cardNumber')} />
          <SelectField name="membershipLevel" label="Razina članstva" required options={MEMBERSHIP_LEVEL_OPTIONS}
            value={values.membershipLevel} onChange={handleChange} onBlur={handleBlur} error={showError('membershipLevel')} />
          <DateField name="fullMemberSince" label="Datum postanka punopravnim članom"
            value={values.fullMemberSince} onChange={handleChange} onBlur={handleBlur} error={showError('fullMemberSince')} />
          <SelectField name="homeSectionId" label="Matična sekcija" required
            options={lookups.sections.map((s) => ({ value: String(s.id), label: s.name }))}
            value={values.homeSectionId} onChange={handleHomeSectionChange} onBlur={handleBlur} error={showError('homeSectionId')} />
        </div>

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
        <CheckboxField name="transportVolunteer"
          label="Imam auto i zainteresiran sam povremeno pomoći klubu s prijevozom stvari i ljudi."
          value={values.transportVolunteer} onChange={handleChange} onBlur={handleBlur}
          error={showError('transportVolunteer')} />
      </Card>

      <div className="flex gap-3">
        <button type="submit" disabled={submitting} className="btn-primary">
          {submitting ? 'Spremam...' : 'Spremi promjene'}
        </button>
        <button type="button" onClick={onCancel} className="btn-secondary">
          Odustani
        </button>
      </div>
    </form>
  );
}
