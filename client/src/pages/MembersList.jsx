import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { authHeaders, jsonHeaders, openCertificate } from '../api/auth';
import { useLookupData } from '../useLookupData';
import { useForm } from '../useForm';
import { memberValidators } from '../validation';
import { MEMBERSHIP_LEVEL_OPTIONS, DIET_TYPE_OPTIONS, GENDER_OPTIONS, SHIRT_SIZE_OPTIONS } from '../constants';
import { formatDate, isDateOnOrAfterToday } from '../date';
import { formatAddress } from '../address';
import { PageContainer, Card, Alert, ConfirmDialog, ErrorPopup } from '../components/ui';
import { TextField, SelectField, MultiCheckDropdown, CheckboxField, DateField } from '../components/Field';
import MembershipLabel from '../components/MembershipLabel';

const DIET_LABELS = Object.fromEntries(DIET_TYPE_OPTIONS.map((o) => [o.value, o.label]));
const GENDER_LABELS = Object.fromEntries(GENDER_OPTIONS.map((o) => [o.value, o.label]));
const MEMBERSHIP_LABELS = Object.fromEntries(MEMBERSHIP_LEVEL_OPTIONS.map((o) => [o.value, o.label]));
const ROLE_LABELS = {
  CLAN: 'Član',
  VODITELJ_SEKCIJE: 'Voditelj sekcije',
  SANKER: 'Šef šanka',
  VODITELJ_PROGRAMA: 'Voditelj programa',
  NADZORNI: 'Nadzorni',
  ADMINISTRATOR: 'Administrator',
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
// Every member field exposed by GET /api/members is toggleable as a column.
// `name` is always shown and is therefore kept out of the toggle list below.
const MEMBER_COLUMNS = [
  { key: 'name', label: 'Ime i prezime', sortKey: 'name' },
  { key: 'firstName', label: 'Ime', sortKey: 'firstName' },
  { key: 'lastName', label: 'Prezime', sortKey: 'lastName' },
  { key: 'oib', label: 'OIB', sortKey: 'oib' },
  { key: 'cardNumber', label: 'Šifra iskaznice', sortKey: 'cardNumber' },
  { key: 'ksetEmail', label: 'KSET e-mail', sortKey: 'ksetEmail' },
  { key: 'privateEmail', label: 'Privatni e-mail', sortKey: 'privateEmail' },
  { key: 'phone', label: 'Telefon', sortKey: 'phone' },
  { key: 'section', label: 'Matična sekcija', sortKey: 'section' },
  { key: 'associatedSections', label: 'Pridružene sekcije', sortKey: 'associatedSections' },
  { key: 'updated', label: 'Aktivna potvrda', sortKey: 'updated' },
  { key: 'faculty', label: 'Fakultet', sortKey: 'faculty' },
  { key: 'membershipLevel', label: 'Boja iskaznice', sortKey: 'membershipLevel' },
  { key: 'birthYear', label: 'Godina rođenja', sortKey: 'birthYear' },
  { key: 'dateOfBirth', label: 'Datum rođenja', sortKey: 'dateOfBirth' },
  { key: 'address', label: 'Adresa', sortKey: 'address' },
  { key: 'gender', label: 'Spol', sortKey: 'gender' },
  { key: 'dietType', label: 'Tip prehrane', sortKey: 'dietType' },
  { key: 'shirtSize', label: 'Veličina majice', sortKey: 'shirtSize' },
  { key: 'teams', label: 'Timovi', sortKey: 'teams' },
  { key: 'drinks', label: 'Pića', sortKey: 'drinks' },
  { key: 'allergies', label: 'Alergije', sortKey: 'allergies' },
  { key: 'memberSince', label: 'Datum učlanjenja', sortKey: 'memberSince' },
  { key: 'fullMemberSince', label: 'Datum punopravnog članstva', sortKey: 'fullMemberSince' },
  { key: 'certificateValidUntil', label: 'Potvrda vrijedi do', sortKey: 'certificateValidUntil' },
  { key: 'certificateApprovedAt', label: 'Potvrda odobrena', sortKey: 'certificateApprovedAt' },
  { key: 'transportVolunteer', label: 'Kombi sekcija', sortKey: 'transportVolunteer' },
  { key: 'acceptedDocuments', label: 'Prihvaćanje akata', sortKey: 'acceptedDocuments' },
  { key: 'referralSource', label: 'Kako je saznao/la za KSET', sortKey: 'referralSource' },
  { key: 'ksetEmailVerified', label: 'KSET e-mail potvrđen', sortKey: 'ksetEmailVerified' },
  { key: 'privateEmailVerified', label: 'Privatni e-mail potvrđen', sortKey: 'privateEmailVerified' },
  { key: 'discordId', label: 'Discord ID', sortKey: 'discordId' },
  { key: 'appRole', label: 'Uloga', sortKey: 'appRole' },
  { key: 'createdAt', label: 'Kreiran', sortKey: 'createdAt' },
  { key: 'updatedAt', label: 'Zadnja izmjena', sortKey: 'updatedAt' },
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

// Promjena oblika filtera (membershipFilter je sada polje boja, a
// "Prikaz pridruženih" je zasebna zastavica) pa dižemo verziju ključa da
// stari spremljeni filteri ne naprave zbrku.
const FILTERS_STORAGE_KEY = 'members-filters-v2';
const ASSOCIATED_OPTION = '__associated__';
const DEFAULT_FILTERS = {
  search: '',
  sectionFilter: null,
  showAssociated: false,
  showOnlyMySection: false,
  sortBy: 'name',
  sortDirection: 'asc',
  facultyFilter: '',
  // Po defaultu prikazujemo plave i narančaste; crvene i stare ne.
  membershipFilter: ['PRIDRUZENO', 'PUNOPRAVNO'],
};

const MEMBERSHIP_LEVEL_VALUES = MEMBERSHIP_LEVEL_OPTIONS.map(({ value }) => value);

function readSavedFilters() {
  try {
    const saved = JSON.parse(localStorage.getItem(FILTERS_STORAGE_KEY) || 'null');
    if (saved && typeof saved === 'object') {
      const merged = { ...DEFAULT_FILTERS, ...saved };
      // membershipFilter mora biti polje valjanih razina članstva.
      merged.membershipFilter = Array.isArray(merged.membershipFilter)
        ? merged.membershipFilter.filter((level) => MEMBERSHIP_LEVEL_VALUES.includes(level))
        : [...DEFAULT_FILTERS.membershipFilter];
      return merged;
    }
  } catch (error) {
    console.warn('Nije moguće učitati spremljene filtere popisa članova.', error);
  }
  return { ...DEFAULT_FILTERS, membershipFilter: [...DEFAULT_FILTERS.membershipFilter] };
}

// Šifra iskaznice je "SS-GG": slova, crtica, pa godina učlanjenja. Vadimo broj
// iza (zadnje) crtice za sortiranje; ako crtice nema, uzimamo prvi niz znamenki.
// Vraća null kad broja nema (npr. prazna šifra) da takvi idu na kraj.
function cardNumberYear(cardNumber) {
  if (!cardNumber) return null;
  const afterDash = String(cardNumber).split('-').pop();
  const match = /\d+/.exec(afterDash) || /\d+/.exec(String(cardNumber));
  return match ? Number(match[0]) : null;
}

function formatBool(value) {
  return value ? 'Da' : 'Ne';
}

function formatList(values) {
  return values && values.length ? values.join(', ') : '-';
}

// Boja trakice uz lijevi rub retka člana. Redoslijed prioriteta:
// crvena (počasni) > ljubičasta (pridružen baš ovoj sekciji) >
// narančasta (punopravni) > plava (pridruženi). Ako ništa ne odgovara,
// vraća null pa se trakica ne prikazuje.
function memberStripeColor(member, activeSectionId) {
  if (member.membershipLevel === 'POCASNO') return '#ef4444'; // red-500
  const isAssociatedHere = typeof activeSectionId === 'number'
    && member.homeSection?.id !== activeSectionId
    && (member.associatedSectionIds || []).includes(activeSectionId);
  if (isAssociatedHere) return '#a855f7'; // purple-500
  if (member.membershipLevel === 'PUNOPRAVNO') return '#f97316'; // orange-500
  if (member.membershipLevel === 'PRIDRUZENO') return '#3b82f6'; // blue-500
  return null;
}

function toDateInput(d) {
  return d ? d.split('T')[0] : '';
}

function facultyDisplay(m) {
  return m.faculty?.name || m.facultyOther || '-';
}

function hasActiveCertificate(hasCertificateFile, certificateValidUntil) {
  return hasCertificateFile && isDateOnOrAfterToday(certificateValidUntil);
}

function AcademicYearUpdateStatus({ hasCertificateFile, certificateValidUntil }) {
  const isActive = hasActiveCertificate(hasCertificateFile, certificateValidUntil);
  return (
    <span
      className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-sm border text-sm leading-none ${
        isActive
          ? 'border-brand-orange bg-brand-orange/10 font-bold text-brand-orange'
          : 'border-surface-border text-content-muted'
      }`}
      aria-label={isActive ? 'Potvrda je aktivna' : 'Potvrda nije aktivna'}
      title={isActive ? 'Potvrda je aktivna' : 'Potvrda nije aktivna'}
    >
      {isActive ? '✓' : '✕'}
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

export default function MembersList({ isAdmin, canViewMembers, canManageMembership }) {
  const lookups = useLookupData();
  const [searchParams, setSearchParams] = useSearchParams();
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [membersError, setMembersError] = useState('');
  // "Vidi samo članove svoje sekcije" postoji samo za voditelje sekcija;
  // ne vraćaj taj toggle iz pohrane drugim ulogama (npr. ako je isti
  // preglednik ranije koristio voditelj) da ne bi dobili prazan popis.
  const canUseMySectionFilter = !isAdmin && canManageMembership;
  const [savedFilters] = useState(readSavedFilters);
  const [search, setSearch] = useState(savedFilters.search);
  const [sectionFilter, setSectionFilter] = useState(savedFilters.sectionFilter); // null = svi
  const [showAssociated, setShowAssociated] = useState(savedFilters.showAssociated);
  const [showOnlyMySection, setShowOnlyMySection] = useState(
    canUseMySectionFilter ? savedFilters.showOnlyMySection : false
  );
  const [sortBy, setSortBy] = useState(savedFilters.sortBy);
  const [sortDirection, setSortDirection] = useState(savedFilters.sortDirection);
  const [facultyFilter, setFacultyFilter] = useState(savedFilters.facultyFilter);
  const [membershipFilter, setMembershipFilter] = useState(savedFilters.membershipFilter);
  const [visibleColumns, setVisibleColumns] = useState(readSavedColumns);
  const selectedMemberParam = searchParams.get('member');
  const selectedId = selectedMemberParam && /^[1-9]\d*$/.test(selectedMemberParam)
    ? Number(selectedMemberParam)
    : null;
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
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

  const persistColumns = (next) => {
    try {
      localStorage.setItem('members-table-columns-v1', JSON.stringify(next));
    } catch (error) {
      console.warn('Nije moguće spremiti odabrane stupce tablice članova.', error);
    }
    return next;
  };

  const toggleColumn = (column) => {
    setVisibleColumns((current) => persistColumns(
      current.includes(column)
        ? current.filter((key) => key !== column)
        : [...current, column]
    ));
  };

  const showAllColumns = () => {
    setVisibleColumns(persistColumns(OPTIONAL_MEMBER_COLUMNS.map(({ key }) => key)));
  };

  const hideAllColumns = () => {
    setVisibleColumns(persistColumns([]));
  };

  const resetColumns = () => {
    setVisibleColumns(persistColumns([...DEFAULT_VISIBLE_COLUMNS]));
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

  // Pamti filtere popisa članova pa se stanje vrati kad se korisnik vrati
  // na stranicu nakon odlaska npr. na Zahtjeve.
  useEffect(() => {
    try {
      localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify({
        search,
        sectionFilter,
        showAssociated,
        showOnlyMySection,
        sortBy,
        sortDirection,
        facultyFilter,
        membershipFilter,
      }));
    } catch (error) {
      console.warn('Nije moguće spremiti filtere popisa članova.', error);
    }
  }, [
    search,
    sectionFilter,
    showAssociated,
    showOnlyMySection,
    sortBy,
    sortDirection,
    facultyFilter,
    membershipFilter,
  ]);

  useEffect(() => {
    if (selectedId === null) {
      setDetail(null);
      setDetailError('');
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    setDetailError('');
    fetch(`/api/members/${selectedId}`, { headers: authHeaders() })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Nije moguće učitati podatke o članu.');
        return data;
      })
      .then((data) => { if (!cancelled) setDetail(data); })
      .catch((error) => {
        if (!cancelled) {
          setDetail(null);
          setDetailError(error.message || 'Mrežna greška pri učitavanju člana.');
        }
      })
      .finally(() => { if (!cancelled) setDetailLoading(false); });
    return () => { cancelled = true; };
  }, [selectedId]);

  const load = async () => {
    setLoading(true);
    setMembersError('');
    try {
      const res = await fetch('/api/members', { headers: authHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Nije moguće učitati članove.');
      setMembers(data);
    } catch (error) {
      console.error('Učitavanje članova nije uspjelo.', error);
      setMembersError(error.message || 'Mrežna greška pri učitavanju članova.');
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
          || (showAssociated && m.associatedSectionIds?.includes(sectionFilter)));
    const matchesMySection = !showOnlyMySection || m.isManagedSectionMember;
    // Boja iskaznice je strogi filtr: prikazuju se samo odabrane boje.
    // Ako ništa nije odabrano, ne prikazuje se nijedan član.
    const matchesMembership = membershipFilter.includes(m.membershipLevel);
    return matchesSearch
      && matchesSection
      && matchesMySection
      && matchesMembership
      && (!facultyFilter || (m.facultyName || '').toLocaleLowerCase('hr').includes(facultyFilter.trim().toLocaleLowerCase('hr')));
  });

  const sortedMembers = [...filtered].sort((a, b) => {
    const getValue = (member) => {
      switch (sortBy) {
        case 'name': return `${member.firstName} ${member.lastName}`;
        case 'section': return member.homeSection?.name || '';
        case 'associatedSections': return (member.associatedSectionNames || []).join(', ');
        case 'updated': return hasActiveCertificate(member.hasCertificateFile, member.certificateValidUntil) ? 'Da' : 'Ne';
        case 'faculty': return member.facultyName || '';
        case 'membershipLevel': return MEMBERSHIP_LABELS[member.membershipLevel] || '';
        case 'birthYear': return member.birthYear || '';
        case 'gender': return GENDER_LABELS[member.gender] || '';
        case 'dietType': return DIET_LABELS[member.dietType] || '';
        case 'address': return formatAddress(member) || '';
        case 'teams': return (member.teamNames || []).join(', ');
        case 'drinks': return (member.drinkNames || []).join(', ');
        case 'allergies': return (member.allergyNames || []).join(', ');
        case 'appRole': return ROLE_LABELS[member.appRole] || '';
        case 'transportVolunteer': return member.transportVolunteer ? 'Da' : 'Ne';
        case 'acceptedDocuments': return member.acceptedDocuments ? 'Da' : 'Ne';
        case 'ksetEmailVerified': return member.ksetEmailVerified ? 'Da' : 'Ne';
        case 'privateEmailVerified': return member.privateEmailVerified ? 'Da' : 'Ne';
        default: return member[sortBy] || '';
      }
    };

    // Šifra iskaznice je oblika "SS-GG" gdje je GG godina učlanjenja; sortiramo
    // po tom broju iza crtice, a ne abecedno po slovima ispred njega.
    if (sortBy === 'cardNumber') {
      const yearA = cardNumberYear(a.cardNumber);
      const yearB = cardNumberYear(b.cardNumber);
      let comparison;
      if (yearA === yearB) {
        // Isti (ili nepostojeći) broj - zadrži stabilan abecedni red po šifri.
        comparison = String(a.cardNumber || '').localeCompare(String(b.cardNumber || ''), 'hr', {
          sensitivity: 'base',
          numeric: true,
        });
      } else {
        // Članovi bez šifre (null) idu na kraj neovisno o smjeru sortiranja.
        if (yearA === null) return 1;
        if (yearB === null) return -1;
        comparison = yearA - yearB;
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    }

    const comparison = String(getValue(a)).localeCompare(String(getValue(b)), 'hr', {
      sensitivity: 'base',
      numeric: true,
    });
    return sortDirection === 'asc' ? comparison : -comparison;
  });
  const availableFaculties = [...new Set(members.map((member) => member.facultyName).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'hr', { sensitivity: 'base' }));
  //const columnsToShow = isAdmin ? DEFAULT_VISIBLE_COLUMNS : visibleColumns;
  const columnsToShow = visibleColumns;
  const tableColumns = MEMBER_COLUMNS.filter(
    ({ key }) => key === 'name' || columnsToShow.includes(key)
  );
  const activeSectionId = typeof sectionFilter === 'number' ? sectionFilter : null;

  // "Prikaz pridruženih" ima smisla samo za konkretnu sekciju (ne "Svi" ni
  // "Savjet") - tada je pridruženost definirana. Inače se opcija ne nudi.
  const canShowAssociatedOption = activeSectionId !== null && canViewMembers;
  const membershipFilterOptions = [
    ...MEMBERSHIP_LEVEL_OPTIONS.map(({ value, label }) => ({ id: value, name: label })),
    ...(canShowAssociatedOption ? [{ id: ASSOCIATED_OPTION, name: 'Prikaz pridruženih' }] : []),
  ];
  const membershipFilterValue = [
    ...membershipFilter,
    ...(showAssociated && canShowAssociatedOption ? [ASSOCIATED_OPTION] : []),
  ];
  const handleMembershipFilterChange = (_, next) => {
    setMembershipFilter(next.filter((id) => id !== ASSOCIATED_OPTION));
    if (canShowAssociatedOption) setShowAssociated(next.includes(ASSOCIATED_OPTION));
  };

  const renderColumnValue = (member, column) => {
    switch (column.key) {
      case 'name': return `${member.firstName} ${member.lastName}`;
      case 'firstName': return member.firstName || '-';
      case 'lastName': return member.lastName || '-';
      case 'oib': return member.oib || '-';
      case 'cardNumber': return member.cardNumber || '-';
      case 'ksetEmail':
      case 'privateEmail':
      case 'phone':
      case 'discordId':
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
      case 'associatedSections': return formatList(member.associatedSectionNames);
      case 'updated': return (
        <AcademicYearUpdateStatus
          hasCertificateFile={member.hasCertificateFile}
          certificateValidUntil={member.certificateValidUntil}
        />
      );
      case 'faculty': return member.facultyName || '-';
      case 'membershipLevel': return <MembershipLabel value={member.membershipLevel} />;
      case 'birthYear': return member.birthYear || '-';
      case 'dateOfBirth': return formatDate(member.dateOfBirth);
      case 'address': return formatAddress(member);
      case 'gender': return GENDER_LABELS[member.gender] || '-';
      case 'dietType': return DIET_LABELS[member.dietType] || '-';
      case 'shirtSize': return member.shirtSize || '-';
      case 'teams': return formatList(member.teamNames);
      case 'drinks': return formatList(member.drinkNames);
      case 'allergies': return formatList(member.allergyNames);
      case 'memberSince': return formatDate(member.memberSince);
      case 'fullMemberSince': return formatDate(member.fullMemberSince);
      case 'certificateValidUntil': return formatDate(member.certificateValidUntil);
      case 'certificateApprovedAt': return formatDate(member.certificateApprovedAt);
      case 'transportVolunteer': return formatBool(member.transportVolunteer);
      case 'acceptedDocuments': return formatBool(member.acceptedDocuments);
      case 'referralSource': return member.referralSource || '-';
      case 'ksetEmailVerified': return formatBool(member.ksetEmailVerified);
      case 'privateEmailVerified': return formatBool(member.privateEmailVerified);
      case 'appRole': return ROLE_LABELS[member.appRole] || '-';
      case 'createdAt': return formatDate(member.createdAt);
      case 'updatedAt': return formatDate(member.updatedAt);
      default: return '-';
    }
  };

  if (loading) {
    return <PageContainer title="Članovi"><p className="text-content-secondary">Učitavanje...</p></PageContainer>;
  }

  if (selectedId !== null) {
    if (detailLoading || (!detail && !detailError)) {
      return (
        <PageContainer title="Članovi">
          <button onClick={closeMember} className="btn-ghost mb-4">← Natrag na popis</button>
          <p className="text-content-secondary">Učitavanje...</p>
        </PageContainer>
      );
    }
    if (detailError || !detail) {
      return (
        <PageContainer title="Članovi">
          <button onClick={closeMember} className="btn-ghost mb-4">← Natrag na popis</button>
          <Alert kind="error">{detailError || 'Nije moguće učitati podatke o članu.'}</Alert>
        </PageContainer>
      );
    }
    return (
      <MemberDetail
        member={detail}
        isAdmin={isAdmin}
        canManageMembership={canManageMembership}
        canViewCertificates={isAdmin || canManageMembership}
        lookups={lookups}
        onBack={closeMember}
        onRoleChanged={() => { closeMember(); load(); }}
        onUpdated={(updated) => { setDetail(updated); load(); }}
        onDeleted={() => { closeMember(); load(); }}
        setMessage={setMessage}
      />
    );
  }

  if (membersError) {
    return (
      <PageContainer title="Članovi">
        <Alert kind="error">
          {membersError}{' '}
          <button type="button" className="underline" onClick={load}>Pokušaj ponovno</button>
        </Alert>
      </PageContainer>
    );
  }

  return (
    <PageContainer maxWidth="max-w-full" compact>
      {message && <Alert kind="success">{message}</Alert>}
      {exportError && <Alert kind="error">{exportError}</Alert>}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Članovi</h1>
        {(isAdmin || canManageMembership) && (
          <button type="button" className="btn-primary" onClick={handleExport} disabled={exporting}>
            {exporting ? 'Izvozim...' : isAdmin ? 'Izvezi sve u Excel' : 'Izvezi svoju sekciju u Excel'}
          </button>
        )}
      </div>
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
          Svi članovi
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
            checked={showOnlyMySection}
            onChange={(event) => setShowOnlyMySection(event.target.checked)}
          />
          Vidi samo članove svoje sekcije
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
        <div className="min-w-48 [&_.label]:text-xs [&_.label]:text-content-secondary [&>div]:!mb-0">
          <MultiCheckDropdown
            name="membershipFilter"
            label="Boja iskaznice"
            options={membershipFilterOptions}
            value={membershipFilterValue}
            onChange={handleMembershipFilterChange}
            placeholder="Sve boje"
          />
        </div>

        <div className="flex items-center gap-3 self-center">
          <span className="text-xs text-content-secondary">
            Prikazano članova: <strong className="font-semibold text-content-primary">{sortedMembers.length}</strong>
          </span>
          <button
            type="button"
            className="btn-ghost text-xs"
            onClick={() => {
              setFacultyFilter('');
              setMembershipFilter([...DEFAULT_FILTERS.membershipFilter]);
              setShowAssociated(false);
            }}
          >
            Očisti filtre
          </button>
        </div>
      </div>

      {canManageMembership && (
        <details className="mb-4 rounded-lg border border-surface-border p-3">
          <summary className="cursor-pointer text-sm font-medium">Odaberi stupce</summary>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="btn-ghost text-xs" onClick={showAllColumns}>
              Prikaži sve
            </button>
            <button type="button" className="btn-ghost text-xs" onClick={hideAllColumns}>
              Sakrij sve
            </button>
            <button type="button" className="btn-ghost text-xs" onClick={resetColumns}>
              Vrati zadano
            </button>
          </div>
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
      <Card className="!p-0 overflow-x-auto hidden md:block">
        <table className={`table-base text-xs ${tableColumns.length > 7 ? 'w-max min-w-full table-auto' : 'w-full table-fixed'}`}>
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
            {sortedMembers.map((m) => {
              const stripe = memberStripeColor(m, activeSectionId);
              return (
                <tr key={m.id} className="hover:bg-surface-overlay cursor-pointer" onClick={() => openMemberUnlessTextSelected(m.id)}>
                  {tableColumns.map((column, index) => (
                    <td
                      key={column.key}
                      className="!px-1.5 break-words [overflow-wrap:anywhere]"
                      style={index === 0 && stripe ? { borderLeft: `4px solid ${stripe}` } : undefined}
                    >
                      {renderColumnValue(m, column)}
                    </td>
                  ))}
                  <td className="!px-1.5 break-words text-brand-orange">Detalji →</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      {/* Mobile */}
      <div className="md:hidden space-y-3">
        {sortedMembers.length === 0 && (
          <Card><p className="text-content-muted">Nema članova.</p></Card>
        )}
        {sortedMembers.map((m) => {
          const stripe = memberStripeColor(m, activeSectionId);
          return (
          <Card
            key={m.id}
            className="!mb-0 cursor-pointer hover:bg-surface-overlay"
            style={stripe ? { borderLeft: `4px solid ${stripe}` } : undefined}
          >
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
          );
        })}
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

function MembershipManager({ member, lookups, onSaved }) {
  const [membershipLevel, setMembershipLevel] = useState(member.membershipLevel);
  const [cardNumber, setCardNumber] = useState(member.cardNumber || '');
  const [sectionIds, setSectionIds] = useState(
    (member.sections || [])
      .map(({ section }) => section.id)
      .filter((id) => id !== member.homeSectionId)
  );
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
        body: JSON.stringify({
          membershipLevel,
          cardNumber,
          sectionIds: sectionIds.map(Number),
        }),
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
        <MultiCheckDropdown
          name="sectionIds"
          label="Pridružene sekcije"
          options={lookups.sections.filter((section) => String(section.id) !== String(member.homeSectionId))}
          value={sectionIds}
          onChange={(_, next) => setSectionIds(next)}
        />
        {error && <Alert kind="error">{error}</Alert>}
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? 'Spremam...' : 'Spremi'}
        </button>
      </form>
    </Card>
  );
}

function MemberDetail({ member, isAdmin, canManageMembership, canViewCertificates, lookups, onBack, onRoleChanged, onUpdated, onDeleted, setMessage }) {
  const [role, setRole] = useState(member.appRole || 'CLAN');
  const [managedSectionId, setManagedSectionId] = useState(member.managedSectionId ? String(member.managedSectionId) : '');
  const [error, setError] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteConfirmationText, setDeleteConfirmationText] = useState('');
  const [certificateDeleteConfirmOpen, setCertificateDeleteConfirmOpen] = useState(false);
  const [removingCertificate, setRemovingCertificate] = useState(false);
  const [editing, setEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const isLimited = member.limited;
  const canRemoveCertificate = isAdmin || (canManageMembership && member.canManageMembership);
  const memberFullName = `${member.firstName} ${member.lastName}`;
  const canConfirmDelete = deleteConfirmationText.trim() === memberFullName;

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
    if (!canConfirmDelete) return;
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

  const submitRemoveCertificate = async () => {
    setCertificateDeleteConfirmOpen(false);
    setError('');
    setRemovingCertificate(true);
    try {
      const res = await fetch(`/api/members/${member.id}/certificate`, {
        method: 'DELETE',
        headers: jsonHeaders(),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Greška pri uklanjanju potvrde.');
        return;
      }
      onUpdated({ ...member, certificatePath: null, certificateValidUntil: null, certificateApprovedAt: null });
      setMessage('Potvrda o studiranju je uklonjena.');
    } catch (err) {
      setError('Mrežna greška.');
    } finally {
      setRemovingCertificate(false);
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
              {member.certificatePath && canViewCertificates ? (
                <span className="block">
                  <button type="button" className="text-brand-orange hover:underline text-sm" onClick={handleOpenCert}>
                    Otvori potvrdu
                  </button>
                  <span className="block text-xs text-content-muted mt-0.5">{member.certificatePath}</span>
                  <span className="block text-xs text-content-muted mt-0.5">
                    Potvrda valjana do {formatDate(member.certificateValidUntil)}
                  </span>
                  {canRemoveCertificate && (
                    <button
                      type="button"
                      className="mt-2 text-sm text-state-error hover:underline disabled:opacity-50"
                      onClick={() => setCertificateDeleteConfirmOpen(true)}
                      disabled={removingCertificate}
                    >
                      Ukloni potvrdu
                    </button>
                  )}
                </span>
              ) : member.certificatePath ? (
                'Potvrda je evidentirana.'
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
          lookups={lookups}
          onSaved={(changes) => {
            onUpdated({ ...member, ...changes });
            setMessage('Podatci o članstvu su spremljeni.');
          }}
        />
      )}

      {(isAdmin || (canManageMembership && member.canManageMembership)) && !isLimited && !editing && (
        <Card title="Administracija">
          <div className="flex flex-wrap gap-3">
            {isAdmin && (
              <button className="btn-secondary" onClick={() => setEditing(true)}>
                Uredi podatke
              </button>
            )}
            <button
              className="btn-secondary border-state-error text-state-error hover:bg-state-error/10"
              onClick={() => {
                setDeleteConfirmationText('');
                setDeleteConfirmOpen(true);
              }}
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

      {deleteConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="card w-full max-w-sm p-6" role="dialog" aria-modal="true" aria-labelledby="delete-member-title">
            <h3 id="delete-member-title" className="mb-2 text-lg font-semibold">Trajno brisanje člana</h3>
            <p className="mb-4 text-sm text-content-secondary">
              Za potvrdu upišite puno ime člana: <strong className="text-content-primary">{memberFullName}</strong>.
            </p>
            <input
              className="input mb-6"
              type="text"
              autoComplete="off"
              aria-label="Puno ime člana za potvrdu brisanja"
              value={deleteConfirmationText}
              onChange={(event) => setDeleteConfirmationText(event.target.value)}
            />
            <div className="flex justify-end gap-3">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setDeleteConfirmOpen(false);
                  setDeleteConfirmationText('');
                }}
              >
                Odustani
              </button>
              <button
                type="button"
                className="btn-secondary border-state-error text-state-error hover:bg-state-error/10 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={submitDelete}
                disabled={!canConfirmDelete}
              >
                Trajno izbriši
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={certificateDeleteConfirmOpen}
        title="Uklanjanje potvrde"
        message={`Ukloniti potvrdu o studiranju za ${member.firstName} ${member.lastName}? Potvrda koja čeka odobrenje također će biti odbijena i uklonjena.`}
        onConfirm={submitRemoveCertificate}
        onCancel={() => setCertificateDeleteConfirmOpen(false)}
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
