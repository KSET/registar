diff --git a/client/src/App.jsx b/client/src/App.jsx
index 25c6353..73d0b4f 100644
--- a/client/src/App.jsx
+++ b/client/src/App.jsx
@@ -80,6 +80,7 @@ function App() {
       return (
         <MemberView
           member={user.member}
+          isAdmin={appRole === 'ADMINISTRATOR'}
           onUpdated={(updated) =>
             setUser((prev) => ({ ...prev, member: updated }))
           }
diff --git a/client/src/components/Layout.jsx b/client/src/components/Layout.jsx
index 6e423b0..beb3023 100644
--- a/client/src/components/Layout.jsx
+++ b/client/src/components/Layout.jsx
@@ -1,6 +1,13 @@
 import { Outlet, NavLink, useNavigate } from 'react-router-dom';
 
-const linkStyle = ({ isActive }) => ({ fontWeight: isActive ? 'bold' : 'normal' });
+function navClass({ isActive }) {
+  return [
+    'px-3 py-2 rounded-md text-sm font-medium transition-colors',
+    isActive
+      ? 'bg-surface-overlay text-brand-orange'
+      : 'text-content-secondary hover:text-content-primary hover:bg-surface-overlay',
+  ].join(' ');
+}
 
 export default function Layout({ user, isLeaderOrAdmin, onLogout }) {
   const navigate = useNavigate();
@@ -11,20 +18,33 @@ export default function Layout({ user, isLeaderOrAdmin, onLogout }) {
   };
 
   return (
-    <div>
-      <div style={{ padding: '0.5rem 2rem', borderBottom: '1px solid #ccc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
-        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
-          <span>{user.email}</span>
-          {isLeaderOrAdmin && (
-            <>
-              <NavLink to="/" style={linkStyle} end>Moj profil</NavLink>
-              <NavLink to="/zahtjevi" style={linkStyle}>Zahtjevi</NavLink>
-            </>
-          )}
+    <div className="min-h-screen flex flex-col">
+      <header className="sticky top-0 z-10 bg-surface-raised border-b border-surface-border">
+        <div className="px-6 h-14 flex items-center justify-between">
+          {/* Left: logo + nav */}
+          <div className="flex items-center gap-6">
+            <img src="/logo-arrow.png" alt="KSET" className="h-8" />
+            <nav className="flex items-center gap-1">
+              <NavLink to="/" className={navClass} end>
+                Moj profil
+              </NavLink>
+              {isLeaderOrAdmin && (
+                <NavLink to="/zahtjevi" className={navClass}>
+                  Zahtjevi
+                </NavLink>
+              )}
+            </nav>
+          </div>
+
+          {/* Right: logout only */}
+          <button onClick={handleLogout} className="btn-ghost">
+            Odjava
+          </button>
         </div>
-        <button onClick={handleLogout} style={{ padding: '0.3rem 1rem' }}>Odjava</button>
-      </div>
-      <Outlet />
+      </header>
+      <main className="flex-1">
+        <Outlet />
+      </main>
     </div>
   );
 }
diff --git a/client/src/constants.js b/client/src/constants.js
index 5be95c4..a839a05 100644
--- a/client/src/constants.js
+++ b/client/src/constants.js
@@ -10,7 +10,7 @@ export const FIELD_LABELS = {
   faculty: 'Fakultet',
   phone: 'Broj telefona',
   privateEmail: 'Privatni e-mail',
-  associationEmail: 'E-mail pri udruzi',
+  ksetEmail: 'E-mail pri udruzi',
   memberSince: 'Datum učlanjenja',
   cardNumber: 'Broj iskaznice',
   membershipLevel: 'Razina članstva',
@@ -43,3 +43,13 @@ export const DIET_TYPE_OPTIONS = [
   { value: 'VEGANSTVO', label: 'Veganstvo' },
   { value: 'SVEJED', label: 'Svejed' },
 ];
+
+export const SHIRT_SIZE_OPTIONS = [
+  { value: 'XS', label: 'XS' },
+  { value: 'S', label: 'S' },
+  { value: 'M', label: 'M' },
+  { value: 'L', label: 'L' },
+  { value: 'XL', label: 'XL' },
+  { value: 'XXL', label: 'XXL' },
+  { value: 'XXXL', label: 'XXXL' },
+];
diff --git a/client/src/index.css b/client/src/index.css
index b5c61c9..26fbb9a 100644
--- a/client/src/index.css
+++ b/client/src/index.css
@@ -1,3 +1,75 @@
+@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
+
 @tailwind base;
 @tailwind components;
 @tailwind utilities;
+
+@layer base {
+  html {
+    font-family: 'Inter', system-ui, sans-serif;
+  }
+  body {
+    @apply bg-surface-base text-content-primary;
+    margin: 0;
+    min-height: 100vh;
+  }
+}
+
+@layer components {
+  .btn {
+    @apply inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-brand-orange focus:ring-offset-2 focus:ring-offset-surface-base disabled:opacity-50 disabled:cursor-not-allowed;
+  }
+  .btn-primary {
+    @apply btn bg-brand-orange text-brand-dark hover:bg-brand-orange-hover;
+  }
+  .btn-secondary {
+    @apply btn bg-surface-overlay text-content-primary border border-surface-border hover:bg-surface-border;
+  }
+  .btn-ghost {
+    @apply btn bg-transparent text-content-secondary hover:text-content-primary hover:bg-surface-overlay;
+  }
+
+  .card {
+    @apply bg-surface-raised border border-surface-border rounded-lg;
+  }
+
+  .input {
+    @apply w-full rounded-md bg-surface-overlay border border-surface-border px-3 py-2 text-sm text-content-primary placeholder:text-content-muted focus:outline-none focus:border-brand-orange focus:ring-1 focus:ring-brand-orange;
+  }
+  .input-error {
+    @apply border-state-error focus:border-state-error focus:ring-state-error;
+  }
+
+  .label {
+    @apply block text-sm font-medium text-content-secondary mb-1;
+  }
+
+  .field-error {
+    @apply mt-1 text-xs text-state-error;
+  }
+
+  .table-base {
+    @apply w-full border-collapse text-sm;
+  }
+  .table-base th {
+    @apply text-left font-semibold text-content-secondary px-3 py-2 border-b border-surface-border;
+  }
+  .table-base td {
+    @apply px-3 py-2 border-b border-surface-border text-content-primary;
+  }
+  .btn-decision {
+    @apply px-3 py-1.5 rounded-md text-sm font-medium border-2 bg-surface-base transition-colors;
+  }
+  .btn-decision-approve {
+    @apply btn-decision border-state-success text-state-success hover:bg-state-success/10;
+  }
+  .btn-decision-approve-active {
+    @apply btn-decision border-state-success bg-state-success text-brand-dark;
+  }
+  .btn-decision-reject {
+    @apply btn-decision border-state-error text-state-error hover:bg-state-error/10;
+  }
+  .btn-decision-reject-active {
+    @apply btn-decision border-state-error bg-state-error text-white;
+  }
+}
diff --git a/client/src/pages/ApprovalDashboard.jsx b/client/src/pages/ApprovalDashboard.jsx
index 5ca8655..468a531 100644
--- a/client/src/pages/ApprovalDashboard.jsx
+++ b/client/src/pages/ApprovalDashboard.jsx
@@ -1,58 +1,30 @@
 import { useState, useEffect } from 'react';
 import { authHeaders, jsonHeaders } from '../api/auth';
-import { FIELD_LABELS, MEMBERSHIP_LEVEL_OPTIONS } from '../constants';
-import { thStyle, tdStyle } from '../styles';
+import { useLookupData } from '../useLookupData';
+import { FIELD_LABELS, MEMBERSHIP_LEVEL_OPTIONS, DIET_TYPE_OPTIONS, GENDER_OPTIONS } from '../constants';
+import { PageContainer, Card, Alert, ConfirmDialog } from '../components/ui';
 
-const MEMBERSHIP_LABELS = Object.fromEntries(
-  MEMBERSHIP_LEVEL_OPTIONS.map((o) => [o.value, o.label])
-);
-
-function displayValue(fieldName, value) {
-  if (fieldName === 'membershipLevel') return MEMBERSHIP_LABELS[value] || value;
-  if (Array.isArray(value)) return value.join(', ');
-  return String(value ?? '');
-}
-
-// Normalizes both sources into a common request shape:
-// { key, type, personName, email, section, date, fields: [{ name, value }] }
-function buildRequests(applications, fieldChanges) {
-  const appReqs = applications.map((p) => {
-    const pendingFields = Object.entries(p.fieldStatus)
-      .filter(([, s]) => s === 'PENDING')
-      .map(([name]) => ({ name, value: p.fieldData[name] }));
-
-    return {
-      key: `app-${p.id}`,
-      type: 'application',
-      id: p.id,
-      personName: `${p.fieldData.firstName || ''} ${p.fieldData.lastName || ''}`.trim() || '(nepoznato)',
-      email: p.googleEmail,
-      section: p.homeSection?.name || '-',
-      date: p.createdAt,
-      fields: pendingFields,
-    };
-  });
-
-  const fcReqs = fieldChanges.map((c) => ({
-    key: `fc-${c.id}`,
-    type: 'fieldChange',
-    id: c.id,
-    personName: `${c.member.firstName} ${c.member.lastName}`,
-    email: c.member.associationEmail,
-    section: c.member.homeSection?.name || '-',
-    date: c.createdAt,
-    fields: [{ name: c.fieldName, value: c.newValue }],
-  }));
-
-  return [...appReqs, ...fcReqs].sort((a, b) => new Date(a.date) - new Date(b.date));
-}
+const MEMBERSHIP_LABELS = Object.fromEntries(MEMBERSHIP_LEVEL_OPTIONS.map((o) => [o.value, o.label]));
+const DIET_LABELS = Object.fromEntries(DIET_TYPE_OPTIONS.map((o) => [o.value, o.label]));
+const GENDER_LABELS = Object.fromEntries(GENDER_OPTIONS.map((o) => [o.value, o.label]));
 
 export default function ApprovalDashboard() {
+  const lookups = useLookupData();
   const [requests, setRequests] = useState([]);
   const [loading, setLoading] = useState(true);
   const [expandedKey, setExpandedKey] = useState(null);
   const [decisions, setDecisions] = useState({});
   const [message, setMessage] = useState('');
+  const [confirmReq, setConfirmReq] = useState(null);
+
+  // Maps for turning stored IDs into human names (stavka 17).
+  const nameMaps = {
+    sectionIds: Object.fromEntries(lookups.sections.map((s) => [s.id, s.name])),
+    teamIds: Object.fromEntries(lookups.teams.map((t) => [t.id, t.name])),
+    drinkIds: Object.fromEntries(lookups.drinks.map((d) => [d.id, d.name])),
+    allergyIds: Object.fromEntries(lookups.allergies.map((a) => [a.id, a.name])),
+  };
+  const homeSectionMap = Object.fromEntries(lookups.sections.map((s) => [s.id, s.name]));
 
   useEffect(() => {
     loadAll();
@@ -75,31 +47,75 @@ export default function ApprovalDashboard() {
     }
   };
 
+  const buildRequests = (applications, fieldChanges) => {
+    const appReqs = applications.map((p) => {
+      const pendingFields = Object.entries(p.fieldStatus)
+        .filter(([, s]) => s === 'PENDING')
+        .map(([name]) => ({ name, value: p.fieldData[name] }));
+      return {
+        key: `app-${p.id}`,
+        type: 'application',
+        id: p.id,
+        personName: `${p.fieldData.firstName || ''} ${p.fieldData.lastName || ''}`.trim() || '(nepoznato)',
+        email: p.googleEmail,
+        section: p.homeSection?.name || '-',
+        date: p.createdAt,
+        fields: pendingFields,
+      };
+    });
+
+    const fcReqs = fieldChanges.map((c) => ({
+      key: `fc-${c.id}`,
+      type: 'fieldChange',
+      id: c.id,
+      personName: `${c.member.firstName} ${c.member.lastName}`,
+      email: c.member.ksetEmail,
+      section: c.member.homeSection?.name || '-',
+      date: c.createdAt,
+      fields: [{ name: c.fieldName, value: c.newValue }],
+    }));
+
+    return [...appReqs, ...fcReqs].sort((a, b) => new Date(a.date) - new Date(b.date));
+  };
+
+  // Human-readable value for a field (names not IDs, enum labels, etc).
+  const displayValue = (fieldName, value) => {
+    if (fieldName === 'membershipLevel') return MEMBERSHIP_LABELS[value] || value;
+    if (fieldName === 'dietType') return DIET_LABELS[value] || value;
+    if (fieldName === 'gender') return GENDER_LABELS[value] || value;
+    if (fieldName === 'homeSectionId') return homeSectionMap[value] || value;
+    if (fieldName === 'acceptedDocuments') return value ? 'Da' : 'Ne';
+    if (nameMaps[fieldName]) {
+      const arr = Array.isArray(value) ? value : [];
+      return arr.map((id) => nameMaps[fieldName][id] || id).join(', ') || '-';
+    }
+    if (Array.isArray(value)) return value.join(', ') || '-';
+    return String(value ?? '') || '-';
+  };
+
   const expand = (req) => {
     if (expandedKey === req.key) {
-      // Collapse if already open
       setExpandedKey(null);
       setDecisions({});
       return;
     }
     setExpandedKey(req.key);
     setMessage('');
-    // Default all decisions to APPROVED
+    // Default: nothing decided (stavka 16)
     const initial = {};
-    for (const f of req.fields) {
-      initial[f.name] = 'APPROVED';
-    }
+    for (const f of req.fields) initial[f.name] = null;
     setDecisions(initial);
   };
 
-  const toggleDecision = (fieldName) => {
-    setDecisions((prev) => ({
-      ...prev,
-      [fieldName]: prev[fieldName] === 'APPROVED' ? 'REJECTED' : 'APPROVED',
-    }));
+  const setDecision = (fieldName, value) => {
+    setDecisions((prev) => ({ ...prev, [fieldName]: value }));
   };
 
-  const submit = async (req) => {
+  const req = requests.find((r) => r.key === expandedKey);
+  const allDecided = req ? req.fields.every((f) => decisions[f.name] !== null && decisions[f.name] !== undefined) : false;
+
+  const doSubmit = async () => {
+    setConfirmReq(null);
     setMessage('');
     try {
       let res;
@@ -110,7 +126,6 @@ export default function ApprovalDashboard() {
           body: JSON.stringify({ decisions }),
         });
       } else {
-        // fieldChange - single decision
         const decision = decisions[req.fields[0].name];
         res = await fetch(`/api/field-changes/${req.id}/review`, {
           method: 'PATCH',
@@ -118,13 +133,11 @@ export default function ApprovalDashboard() {
           body: JSON.stringify({ decision }),
         });
       }
-
       const data = await res.json();
       if (!res.ok) {
         setMessage(data.error || 'Greška pri slanju.');
         return;
       }
-
       setMessage(data.message);
       setExpandedKey(null);
       setDecisions({});
@@ -134,81 +147,97 @@ export default function ApprovalDashboard() {
     }
   };
 
-  if (loading) return <p style={{ padding: '2rem' }}>Učitavanje zahtjeva...</p>;
+  if (loading) return <PageContainer title="Zahtjevi"><p>Učitavanje...</p></PageContainer>;
 
   return (
-    <div style={{ padding: '2rem' }}>
-      <h2>Zahtjevi za odobrenje</h2>
-
-      {message && <p>{message}</p>}
-
-      {requests.length === 0 && <p>Nema zahtjeva na čekanju.</p>}
-
-      {requests.length > 0 && (
-        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
-          <thead>
-            <tr>
-              <th style={thStyle}>Osoba</th>
-              <th style={thStyle}>E-mail</th>
-              <th style={thStyle}>Sekcija</th>
-              <th style={thStyle}>Tip zahtjeva</th>
-              <th style={thStyle}>Datum</th>
-              <th style={thStyle}>Broj polja</th>
-            </tr>
-          </thead>
-          <tbody>
-            {requests.map((req) => (
-              <>
-                <tr
-                  key={req.key}
-                  onClick={() => expand(req)}
-                  style={{ cursor: 'pointer' }}
-                >
-                  <td style={tdStyle}>{req.personName}</td>
-                  <td style={tdStyle}>{req.email}</td>
-                  <td style={tdStyle}>{req.section}</td>
-                  <td style={tdStyle}>
-                    {req.type === 'application' ? 'Nova prijava' : 'Promjena podataka'}
-                  </td>
-                  <td style={tdStyle}>{new Date(req.date).toLocaleDateString('hr')}</td>
-                  <td style={tdStyle}>{req.fields.length}</td>
-                </tr>
-
-                {expandedKey === req.key && (
-                  <tr key={`${req.key}-detail`}>
-                    <td style={tdStyle} colSpan={6}>
-                      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
-                        <thead>
-                          <tr>
-                            <th style={thStyle}>Polje</th>
-                            <th style={thStyle}>Vrijednost</th>
-                            <th style={thStyle}>Odluka</th>
-                          </tr>
-                        </thead>
-                        <tbody>
-                          {req.fields.map((f) => (
-                            <tr key={f.name}>
-                              <td style={tdStyle}>{FIELD_LABELS[f.name] || f.name}</td>
-                              <td style={tdStyle}>{displayValue(f.name, f.value)}</td>
-                              <td style={tdStyle}>
-                                <button onClick={() => toggleDecision(f.name)}>
-                                  {decisions[f.name] === 'APPROVED' ? 'Prihvaćam' : 'Odbijam'}
-                                </button>
-                              </td>
-                            </tr>
-                          ))}
-                        </tbody>
-                      </table>
-                      <br />
-                      <button onClick={() => submit(req)}>Pošalji odluke</button>
-                    </td>
-                  </tr>
-                )}
-              </>
-            ))}
-          </tbody>
-        </table>
-      )}
-    </div>
+    <PageContainer title="Zahtjevi za odobrenje" maxWidth="max-w-5xl">
+      {message && <Alert kind="success">{message}</Alert>}
+
+      {requests.length === 0 && <Card><p className="text-content-secondary">Nema zahtjeva na čekanju.</p></Card>}
+
+      <div className="space-y-3">
+        {requests.map((r) => (
+          <Card key={r.key} className="!mb-0 !p-0 overflow-hidden">
+            {/* Row header */}
+            <button
+              onClick={() => expand(r)}
+              className="w-full flex items-center justify-between px-5 py-4 hover:bg-surface-overlay transition-colors text-left"
+            >
+              <div>
+                <div className="font-medium">{r.personName}</div>
+                <div className="text-sm text-content-secondary">{r.email} · {r.section}</div>
+              </div>
+              <div className="flex items-center gap-4">
+                <span className={`text-xs px-2 py-1 rounded ${r.type === 'application' ? 'bg-brand-orange/15 text-brand-orange' : 'bg-surface-overlay text-content-secondary'}`}>
+                  {r.type === 'application' ? 'Nova prijava' : 'Promjena podataka'}
+                </span>
+                <span className="text-sm text-content-muted">{r.fields.length} polja</span>
+                <span className="text-content-muted">{expandedKey === r.key ? '▲' : '▼'}</span>
+              </div>
+            </button>
+
+            {/* Expanded detail */}
+            {expandedKey === r.key && (
+              <div className="border-t border-surface-border px-5 py-4">
+                <table className="table-base mb-4">
+                  <thead>
+                    <tr>
+                      <th>Polje</th>
+                      <th>Vrijednost</th>
+                      <th className="text-right">Odluka</th>
+                    </tr>
+                  </thead>
+                  <tbody>
+                    {r.fields.map((f) => (
+                      <tr key={f.name}>
+                        <td className="text-content-secondary">{FIELD_LABELS[f.name] || f.name}</td>
+                        <td>{displayValue(f.name, f.value)}</td>
+                        <td>
+                          <div className="flex gap-2 justify-end">
+                            <button
+                              onClick={() => setDecision(f.name, 'APPROVED')}
+                              className={decisions[f.name] === 'APPROVED' ? 'btn-decision-approve-active' : 'btn-decision-approve'}
+                            >
+                              Prihvati
+                            </button>
+                            <button
+                              onClick={() => setDecision(f.name, 'REJECTED')}
+                              className={decisions[f.name] === 'REJECTED' ? 'btn-decision-reject-active' : 'btn-decision-reject'}
+                            >
+                              Odbij
+                            </button>
+                          </div>
+                        </td>
+                      </tr>
+                    ))}
+                  </tbody>
+                </table>
+
+                <div className="flex items-center justify-between">
+                  <span className="text-xs text-content-muted">
+                    {allDecided ? 'Sva polja su odlučena.' : 'Odlučite za svako polje prije slanja.'}
+                  </span>
+                  <button
+                    disabled={!allDecided}
+                    onClick={() => setConfirmReq(r)}
+                    className="btn-primary"
+                  >
+                    Pošalji odluke
+                  </button>
+                </div>
+              </div>
+            )}
+          </Card>
+        ))}
+      </div>
+
+      <ConfirmDialog
+        open={!!confirmReq}
+        title="Potvrda odluka"
+        message="Jeste li sigurni da želite poslati ove odluke? Ova akcija se ne može poništiti."
+        onConfirm={doSubmit}
+        onCancel={() => setConfirmReq(null)}
+      />
+    </PageContainer>
   );
 }
diff --git a/client/src/pages/LoginPage.jsx b/client/src/pages/LoginPage.jsx
index 12d0d1f..2d6f791 100644
--- a/client/src/pages/LoginPage.jsx
+++ b/client/src/pages/LoginPage.jsx
@@ -1,13 +1,15 @@
 export default function LoginPage() {
   return (
-    <div style={{ padding: '2rem', textAlign: 'center' }}>
-      <h1>Registar članova</h1>
-      <br />
-      <a href="/api/auth/google">
-        <button style={{ padding: '0.5rem 1.5rem', fontSize: '1rem' }}>
-          Prijava putem Google računa
-        </button>
-      </a>
+    <div className="min-h-screen flex items-center justify-center px-6">
+      <div className="card p-10 w-full max-w-md text-center">
+        <img src="/logo-full.png" alt="KSET" className="h-16 mx-auto mb-6" />
+        <h1 className="text-2xl font-bold mb-8">Registar članova KSET-a</h1>
+        <a href="/api/auth/google" className="block">
+          <button className="btn-primary w-full py-3 text-base">
+            Prijava putem Google računa
+          </button>
+        </a>
+      </div>
     </div>
   );
 }
diff --git a/client/src/pages/MemberView.jsx b/client/src/pages/MemberView.jsx
index 1f67e27..6d169c0 100644
--- a/client/src/pages/MemberView.jsx
+++ b/client/src/pages/MemberView.jsx
@@ -1,12 +1,11 @@
 import { useState, useEffect } from 'react';
 import { jsonHeaders } from '../api/auth';
 import { useLookupData } from '../useLookupData';
-import { tdStyle } from '../styles';
-import {
-  GENDER_OPTIONS,
-  MEMBERSHIP_LEVEL_OPTIONS,
-  DIET_TYPE_OPTIONS,
-} from '../constants';
+import { useForm } from '../useForm';
+import { memberValidators } from '../validation';
+import { PageContainer, Card, Alert } from '../components/ui';
+import { TextField, SelectField, MultiCheckDropdown } from '../components/Field';
+import { GENDER_OPTIONS, MEMBERSHIP_LEVEL_OPTIONS, DIET_TYPE_OPTIONS, SHIRT_SIZE_OPTIONS } from '../constants';
 
 function formatDate(d) {
   if (!d) return '-';
@@ -16,13 +15,35 @@ function formatDate(d) {
 const MEMBERSHIP_LABELS = Object.fromEntries(
   MEMBERSHIP_LEVEL_OPTIONS.map((o) => [o.value, o.label])
 );
+const DIET_LABELS = Object.fromEntries(DIET_TYPE_OPTIONS.map((o) => [o.value, o.label]));
 
-export default function MemberView({ member: initialMember, onUpdated }) {
+// Read-only row inside a definition-style grid.
+function InfoRow({ label, value, note }) {
+  return (
+    <div className="flex justify-between gap-4 py-2 border-b border-surface-border last:border-0">
+      <span className="text-content-secondary text-sm">{label}</span>
+      <span className="text-content-primary text-sm text-right">
+        {value || '-'}
+        {note && <span className="block text-xs text-content-muted">{note}</span>}
+      </span>
+    </div>
+  );
+}
+
+function LockedNote({ label, value }) {
+  return (
+    <div className="mb-3 text-sm">
+      <span className="text-content-muted">{label}: </span>
+      <span className="text-content-secondary">{value}</span>
+    </div>
+  );
+}
+
+export default function MemberView({ member: initialMember, isAdmin, onUpdated }) {
   const lookups = useLookupData();
   const [member, setMember] = useState(initialMember);
   const [editing, setEditing] = useState(false);
-  const [form, setForm] = useState(null);
-  const [errors, setErrors] = useState([]);
+  const [submitError, setSubmitError] = useState('');
   const [message, setMessage] = useState('');
   const [submitting, setSubmitting] = useState(false);
 
@@ -34,10 +55,31 @@ export default function MemberView({ member: initialMember, onUpdated }) {
     (c) => c.fieldName === 'membershipLevel'
   );
 
+  const form = useForm(
+    {
+      firstName: member.firstName,
+      lastName: member.lastName,
+      address: member.address,
+      gender: member.gender,
+      faculty: member.faculty,
+      phone: member.phone,
+      privateEmail: member.privateEmail,
+      membershipLevel: member.membershipLevel,
+      fullMemberSince: member.fullMemberSince ? member.fullMemberSince.split('T')[0] : '',
+      dietType: member.dietType,
+      shirtSize: member.shirtSize,
+      sectionIds: member.sections.map((s) => s.section.id),
+      teamIds: member.teams.map((t) => t.team.id),
+      drinkIds: member.drinks.map((d) => d.drink.id),
+      allergyIds: member.allergies.map((a) => a.allergy.id),
+    },
+    memberValidators
+  );
+
   const startEditing = () => {
     setMessage('');
-    setErrors([]);
-    setForm({
+    setSubmitError('');
+    form.setValues({
       firstName: member.firstName,
       lastName: member.lastName,
       address: member.address,
@@ -59,28 +101,35 @@ export default function MemberView({ member: initialMember, onUpdated }) {
 
   const cancelEditing = () => {
     setEditing(false);
-    setForm(null);
-    setErrors([]);
+    setSubmitError('');
   };
 
-  const handleChange = (e) => {
-    const { name, value } = e.target;
-    setForm((prev) => ({ ...prev, [name]: value }));
+  const handleMembershipChange = (name, value) => {
+    form.handleChange(name, value);
+    if (value !== 'PUNOPRAVNO' && form.values.fullMemberSince) {
+      form.handleChange('fullMemberSince', '');
+    }
   };
 
-  const handleMultiSelect = (e, field) => {
-    const selected = Array.from(e.target.selectedOptions, (o) => parseInt(o.value));
-    setForm((prev) => ({ ...prev, [field]: selected }));
-  };
 
   const handleSubmit = async (e) => {
     e.preventDefault();
-    setErrors([]);
+    setSubmitError('');
     setMessage('');
-    setSubmitting(true);
 
+    // Validate only the fields present in the edit form
+    const editableFields = [
+      'firstName', 'lastName', 'address', 'gender', 'faculty', 'phone',
+      'privateEmail', 'dietType', 'shirtSize', 'drinkIds',
+    ];
+    if (!form.validateAll(editableFields)) {
+      setSubmitError('Ispravite označena polja prije spremanja.');
+      return;
+    }
+
+    setSubmitting(true);
     try {
-      const payload = { ...form };
+      const payload = { ...form.values };
       if (pendingMembership) {
         delete payload.membershipLevel;
       }
@@ -93,196 +142,167 @@ export default function MemberView({ member: initialMember, onUpdated }) {
 
       const data = await res.json();
       if (!res.ok) {
-        setErrors([data.error || 'Greška pri spremanju.']);
+        setSubmitError(data.error || 'Greška pri spremanju.');
         return;
       }
 
       setMember(data);
       if (onUpdated) onUpdated(data);
       setEditing(false);
-      setForm(null);
       setMessage(data.notice || 'Podatci su spremljeni.');
     } catch (err) {
-      setErrors(['Mrežna greška.']);
+      setSubmitError('Mrežna greška.');
     } finally {
       setSubmitting(false);
     }
   };
 
+  // ---------- VIEW MODE ----------
   if (!editing) {
     return (
-      <div style={{ padding: '2rem', maxWidth: '700px', margin: '0 auto' }}>
-        <h2>Moj profil</h2>
-
-        {message && <p>{message}</p>}
-
-        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
-          <tbody>
-            <tr><td style={tdStyle}>Ime</td><td style={tdStyle}>{member.firstName}</td></tr>
-            <tr><td style={tdStyle}>Prezime</td><td style={tdStyle}>{member.lastName}</td></tr>
-            <tr><td style={tdStyle}>OIB (zaključano)</td><td style={tdStyle}>{member.oib}</td></tr>
-            <tr><td style={tdStyle}>Datum rođenja (zaključano)</td><td style={tdStyle}>{formatDate(member.dateOfBirth)}</td></tr>
-            <tr><td style={tdStyle}>Adresa</td><td style={tdStyle}>{member.address}</td></tr>
-            <tr><td style={tdStyle}>Spol</td><td style={tdStyle}>{member.gender === 'M' ? 'Muški' : 'Ženski'}</td></tr>
-            <tr><td style={tdStyle}>Fakultet</td><td style={tdStyle}>{member.faculty}</td></tr>
-            <tr><td style={tdStyle}>Telefon</td><td style={tdStyle}>{member.phone}</td></tr>
-            <tr><td style={tdStyle}>Privatni e-mail</td><td style={tdStyle}>{member.privateEmail}</td></tr>
-            <tr><td style={tdStyle}>E-mail pri udruzi</td><td style={tdStyle}>{member.associationEmail}</td></tr>
-            <tr><td style={tdStyle}>Datum učlanjenja (zaključano)</td><td style={tdStyle}>{formatDate(member.memberSince)}</td></tr>
-            <tr><td style={tdStyle}>Broj iskaznice (zaključano)</td><td style={tdStyle}>{member.cardNumber}</td></tr>
-            <tr>
-              <td style={tdStyle}>Razina članstva</td>
-              <td style={tdStyle}>
-                {MEMBERSHIP_LABELS[member.membershipLevel]}
-                {pendingMembership && (
-                  <> (promjena na {MEMBERSHIP_LABELS[pendingMembership.newValue]} čeka odobrenje)</>
-                )}
-              </td>
-            </tr>
+      <PageContainer title="Moj profil">
+        {message && <Alert kind="success">{message}</Alert>}
+
+        <div className="space-y-6">
+          <Card title="Osobni podatci">
+            <InfoRow label="Ime" value={member.firstName} />
+            <InfoRow label="Prezime" value={member.lastName} />
+            <InfoRow label="OIB" value={member.oib}/>
+            <InfoRow label="Datum rođenja" value={formatDate(member.dateOfBirth)}/>
+            <InfoRow label="Spol" value={member.gender === 'M' ? 'Muški' : 'Ženski'} />
+            <InfoRow label="Adresa" value={member.address} />
+            <InfoRow label="Fakultet" value={member.faculty} />
+            <InfoRow label="Telefon" value={member.phone} />
+            <InfoRow label="Privatni e-mail" value={member.privateEmail} />
+            <InfoRow label="KSET e-mail" value={member.ksetEmail} />
+          </Card>
+
+          <Card title="Članstvo">
+            <InfoRow label="Datum učlanjenja" value={formatDate(member.memberSince)}/>
+            <InfoRow label="Broj iskaznice" value={member.cardNumber}/>
+            <InfoRow
+              label="Razina članstva"
+              value={MEMBERSHIP_LABELS[member.membershipLevel]}
+              note={pendingMembership ? `promjena na ${MEMBERSHIP_LABELS[pendingMembership.newValue]} čeka odobrenje` : null}
+            />
             {member.fullMemberSince && (
-              <tr><td style={tdStyle}>Punopravni od</td><td style={tdStyle}>{formatDate(member.fullMemberSince)}</td></tr>
+              <InfoRow label="Punopravni od" value={formatDate(member.fullMemberSince)} />
             )}
-            <tr><td style={tdStyle}>Matična sekcija</td><td style={tdStyle}>{member.homeSection?.name}</td></tr>
-            <tr><td style={tdStyle}>Pridružene sekcije</td><td style={tdStyle}>{member.sections.map((s) => s.section.name).join(', ') || '-'}</td></tr>
-            <tr><td style={tdStyle}>Timovi</td><td style={tdStyle}>{member.teams.map((t) => t.team.name).join(', ') || '-'}</td></tr>
-            <tr><td style={tdStyle}>Tip prehrane</td><td style={tdStyle}>{member.dietType}</td></tr>
-            <tr><td style={tdStyle}>Pića</td><td style={tdStyle}>{member.drinks.map((d) => d.drink.name).join(', ') || '-'}</td></tr>
-            <tr><td style={tdStyle}>Alergije</td><td style={tdStyle}>{member.allergies.map((a) => a.allergy.name).join(', ') || '-'}</td></tr>
-            <tr><td style={tdStyle}>Veličina majice</td><td style={tdStyle}>{member.shirtSize}</td></tr>
-            <tr><td style={tdStyle}>Potvrda valjana do (upload uskoro)</td><td style={tdStyle}>{formatDate(member.certificateValidUntil)}</td></tr>
-            <tr><td style={tdStyle}>Rola</td><td style={tdStyle}>{member.appRole}</td></tr>
-          </tbody>
-        </table>
-
-        <br />
-        <button onClick={startEditing} style={{ padding: '0.5rem 2rem', fontSize: '1rem' }}>
-          Uredi profil
-        </button>
-      </div>
+            <InfoRow label="Matična sekcija" value={member.homeSection?.name} />
+            <InfoRow label="Pridružene sekcije" value={member.sections.map((s) => s.section.name).join(', ')} />
+            <InfoRow label="Timovi" value={member.teams.map((t) => t.team.name).join(', ')} />
+            <InfoRow label="Potvrda valjana do" value={formatDate(member.certificateValidUntil)} />
+            {isAdmin && <InfoRow label="Rola" value={member.appRole} />}
+          </Card>
+
+          <Card title="Ostalo">
+            <InfoRow label="Tip prehrane" value={DIET_LABELS[member.dietType]} />
+            <InfoRow label="Pića" value={member.drinks.map((d) => d.drink.name).join(', ')} />
+            <InfoRow label="Alergije" value={member.allergies.map((a) => a.allergy.name).join(', ')} />
+            <InfoRow label="Veličina majice" value={member.shirtSize} />
+          </Card>
+        </div>
+
+        <div className="mt-6">
+          <button onClick={startEditing} className="btn-primary">Uredi profil</button>
+        </div>
+      </PageContainer>
     );
   }
 
-  return (
-    <div style={{ padding: '2rem', maxWidth: '700px', margin: '0 auto' }}>
-      <h2>Uredi profil</h2>
+  // ---------- EDIT MODE ----------
+  const { values, handleChange, handleBlur, showError } = form;
 
-      {errors.length > 0 && (
-        <div style={{ color: 'red', marginBottom: '1rem' }}>
-          {errors.map((err, i) => <p key={i}>{err}</p>)}
-        </div>
-      )}
+  return (
+    <PageContainer title="Uredi profil">
+      {submitError && <Alert kind="error">{submitError}</Alert>}
 
       <form onSubmit={handleSubmit}>
-        <fieldset>
-          <legend>Osobni podatci</legend>
-
-          <label>Ime *<br />
-            <input name="firstName" value={form.firstName} onChange={handleChange} required />
-          </label><br /><br />
-
-          <label>Prezime *<br />
-            <input name="lastName" value={form.lastName} onChange={handleChange} required />
-          </label><br /><br />
-
-          <p>OIB (zaključano): {member.oib}</p>
-          <p>Datum rođenja (zaključano): {formatDate(member.dateOfBirth)}</p>
-
-          <label>Adresa *<br />
-            <input name="address" value={form.address} onChange={handleChange} required style={{ width: '100%' }} />
-          </label><br /><br />
-
-          <label>Spol *<br />
-            <select name="gender" value={form.gender} onChange={handleChange} required>
-              {GENDER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
-            </select>
-          </label><br /><br />
-
-          <label>Fakultet *<br />
-            <input name="faculty" value={form.faculty} onChange={handleChange} required />
-          </label><br /><br />
-
-          <label>Telefon *<br />
-            <input name="phone" value={form.phone} onChange={handleChange} required />
-          </label><br /><br />
-
-          <label>Privatni e-mail *<br />
-            <input name="privateEmail" type="email" value={form.privateEmail} onChange={handleChange} required />
-          </label><br /><br />
-        </fieldset>
-
-        <fieldset>
-          <legend>Članstvo</legend>
-
-          <p>Broj iskaznice (zaključano): {member.cardNumber}</p>
-          <p>Datum učlanjenja (zaključano): {formatDate(member.memberSince)}</p>
+        <Card title="Osobni podatci">
+          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
+            <TextField name="firstName" label="Ime" required
+              value={values.firstName} onChange={handleChange} onBlur={handleBlur} error={showError('firstName')} />
+            <TextField name="lastName" label="Prezime" required
+              value={values.lastName} onChange={handleChange} onBlur={handleBlur} error={showError('lastName')} />
+          </div>
+
+          <div className="mb-4">
+            <LockedNote label="OIB" value={member.oib} />
+            <LockedNote label="Datum rođenja" value={formatDate(member.dateOfBirth)} />
+          </div>
+
+          <TextField name="address" label="Adresa" required
+            value={values.address} onChange={handleChange} onBlur={handleBlur} error={showError('address')} />
+
+          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
+            <SelectField name="gender" label="Spol" required options={GENDER_OPTIONS}
+              value={values.gender} onChange={handleChange} onBlur={handleBlur} error={showError('gender')} />
+            <TextField name="faculty" label="Fakultet" required
+              value={values.faculty} onChange={handleChange} onBlur={handleBlur} error={showError('faculty')} />
+            <TextField name="phone" label="Telefon" required
+              value={values.phone} onChange={handleChange} onBlur={handleBlur} error={showError('phone')} />
+            <TextField name="privateEmail" label="Privatni e-mail" type="email" required
+              value={values.privateEmail} onChange={handleChange} onBlur={handleBlur} error={showError('privateEmail')} />
+          </div>
+        </Card>
+
+        <Card title="Članstvo">
+          <LockedNote label="Broj iskaznice" value={member.cardNumber} />
+          <LockedNote label="Datum učlanjenja" value={formatDate(member.memberSince)} />
+          <LockedNote label="Matična sekcija" value={member.homeSection?.name} />
 
           {pendingMembership ? (
-            <p>Razina članstva: promjena na {MEMBERSHIP_LABELS[pendingMembership.newValue]} čeka odobrenje voditelja. Ne možete je mijenjati dok se ne obradi.</p>
+            <Alert kind="info">
+              Promjena razine članstva na <strong>{MEMBERSHIP_LABELS[pendingMembership.newValue]}</strong> čeka
+              odobrenje voditelja. Ne možete je mijenjati dok se ne obradi.
+            </Alert>
           ) : (
-            <>
-              <label>Razina članstva (promjena ide voditelju na odobrenje)<br />
-                <select name="membershipLevel" value={form.membershipLevel} onChange={handleChange}>
-                  {MEMBERSHIP_LEVEL_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
-                </select>
-              </label><br /><br />
-            </>
+            <SelectField
+              name="membershipLevel"
+              label="Razina članstva (promjena ide voditelju na odobrenje)"
+              options={MEMBERSHIP_LEVEL_OPTIONS}
+              value={values.membershipLevel}
+              onChange={handleMembershipChange}
+              onBlur={handleBlur}
+              error={showError('membershipLevel')}
+            />
           )}
 
           {member.membershipLevel === 'PUNOPRAVNO' && (
-            <><label>Datum postanka punopravnim članom<br />
-              <input name="fullMemberSince" type="date" value={form.fullMemberSince} onChange={handleChange} />
-            </label><br /><br /></>
+            <TextField name="fullMemberSince" label="Datum postanka punopravnim članom" type="date"
+              value={values.fullMemberSince} onChange={handleChange} onBlur={handleBlur} error={showError('fullMemberSince')} />
           )}
 
-          <p>Matična sekcija (zaključano): {member.homeSection?.name}</p>
-
-          <label>Pridružene sekcije (Ctrl+click za više)<br />
-            <select multiple size={5} value={form.sectionIds.map(String)} onChange={(e) => handleMultiSelect(e, 'sectionIds')}>
-              {lookups.sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
-            </select>
-          </label><br /><br />
-
-          <label>Timovi (Ctrl+click za više)<br />
-            <select multiple size={3} value={form.teamIds.map(String)} onChange={(e) => handleMultiSelect(e, 'teamIds')}>
-              {lookups.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
-            </select>
-          </label><br /><br />
-        </fieldset>
-
-        <fieldset>
-          <legend>Ostalo</legend>
-
-          <label>Tip prehrane *<br />
-            <select name="dietType" value={form.dietType} onChange={handleChange} required>
-              {DIET_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
-            </select>
-          </label><br /><br />
-
-          <label>Pića * (Ctrl+click za više, min. 1)<br />
-            <select multiple size={5} value={form.drinkIds.map(String)} onChange={(e) => handleMultiSelect(e, 'drinkIds')} required>
-              {lookups.drinks.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
-            </select>
-          </label><br /><br />
-
-          <label>Alergije (Ctrl+click za više)<br />
-            <select multiple size={5} value={form.allergyIds.map(String)} onChange={(e) => handleMultiSelect(e, 'allergyIds')}>
-              {lookups.allergies.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
-            </select>
-          </label><br /><br />
-
-          <label>Veličina majice *<br />
-            <input name="shirtSize" value={form.shirtSize} onChange={handleChange} required />
-          </label><br /><br />
-        </fieldset>
-
-        <button type="submit" disabled={submitting} style={{ padding: '0.5rem 2rem', fontSize: '1rem' }}>
-          {submitting ? 'Spremam...' : 'Spremi promjene'}
-        </button>
-        {' '}
-        <button type="button" onClick={cancelEditing} style={{ padding: '0.5rem 2rem', fontSize: '1rem' }}>
-          Odustani
-        </button>
+          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
+            <MultiCheckDropdown name="sectionIds" label="Pridružene sekcije"
+              options={lookups.sections} value={values.sectionIds} onChange={handleChange} onBlur={handleBlur} error={showError('sectionIds')} />
+            <MultiCheckDropdown name="teamIds" label="Timovi"
+              options={lookups.teams} value={values.teamIds} onChange={handleChange} onBlur={handleBlur} error={showError('teamIds')} />
+          </div>
+        </Card>
+
+        <Card title="Ostalo">
+          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
+            <SelectField name="dietType" label="Tip prehrane" required options={DIET_TYPE_OPTIONS}
+              value={values.dietType} onChange={handleChange} onBlur={handleBlur} error={showError('dietType')} />
+            <SelectField name="shirtSize" label="Veličina majice" required options={SHIRT_SIZE_OPTIONS}
+              value={values.shirtSize} onChange={handleChange} onBlur={handleBlur} error={showError('shirtSize')} />
+            <MultiCheckDropdown name="drinkIds" label="Pića" required
+              options={lookups.drinks} value={values.drinkIds} onChange={handleChange} onBlur={handleBlur} error={showError('drinkIds')} />
+            <MultiCheckDropdown name="allergyIds" label="Alergije"
+              options={lookups.allergies} value={values.allergyIds} onChange={handleChange} onBlur={handleBlur} error={showError('allergyIds')} />
+          </div>
+        </Card>
+
+        <div className="flex gap-3">
+          <button type="submit" disabled={submitting} className="btn-primary">
+            {submitting ? 'Spremam...' : 'Spremi promjene'}
+          </button>
+          <button type="button" onClick={cancelEditing} className="btn-secondary">
+            Odustani
+          </button>
+        </div>
       </form>
-    </div>
+    </PageContainer>
   );
 }
diff --git a/client/src/pages/PendingRefillForm.jsx b/client/src/pages/PendingRefillForm.jsx
index 95d5ff3..a5731f0 100644
--- a/client/src/pages/PendingRefillForm.jsx
+++ b/client/src/pages/PendingRefillForm.jsx
@@ -1,46 +1,98 @@
-import { useState, useEffect } from 'react';
+import { useState } from 'react';
 import { jsonHeaders } from '../api/auth';
 import { useLookupData } from '../useLookupData';
+import { useForm } from '../useForm';
+import { memberValidators } from '../validation';
 import { FIELD_LABELS } from '../constants';
-import { tdStyle } from '../styles';
-import FieldRenderer from '../components/FieldRenderer';
+import { PageContainer, Card, Alert } from '../components/ui';
+import { TextField, SelectField, MultiCheckDropdown, CheckboxField } from '../components/Field';
+import { GENDER_OPTIONS, MEMBERSHIP_LEVEL_OPTIONS, DIET_TYPE_OPTIONS, SHIRT_SIZE_OPTIONS } from '../constants';
+
+function displayValue(value) {
+  if (Array.isArray(value)) return value.join(', ') || '-';
+  if (typeof value === 'boolean') return value ? 'Da' : 'Ne';
+  return String(value ?? '') || '-';
+}
+
+// Renders the correct control for a given field key, wired to useForm.
+function RefillField({ fieldKey, form, lookups }) {
+  const { values, handleChange, handleBlur, showError } = form;
+  const common = {
+    name: fieldKey,
+    value: values[fieldKey],
+    onChange: handleChange,
+    onBlur: handleBlur,
+    error: showError(fieldKey),
+  };
+  const label = FIELD_LABELS[fieldKey] || fieldKey;
+
+  switch (fieldKey) {
+    case 'gender':
+      return <SelectField {...common} label={label} required options={GENDER_OPTIONS} />;
+    case 'membershipLevel':
+      return <SelectField {...common} label={label} required options={MEMBERSHIP_LEVEL_OPTIONS} />;
+    case 'dietType':
+      return <SelectField {...common} label={label} required options={DIET_TYPE_OPTIONS} />;
+    case 'homeSectionId':
+      return <SelectField {...common} label={label} required
+        options={lookups.sections.map((s) => ({ value: s.id, label: s.name }))} />;
+    case 'sectionIds':
+      return <MultiCheckDropdown {...common} label={label} options={lookups.sections} />;
+    case 'teamIds':
+      return <MultiCheckDropdown {...common} label={label} options={lookups.teams} />;
+    case 'drinkIds':
+      return <MultiCheckDropdown {...common} label={label} required options={lookups.drinks} />;
+    case 'allergyIds':
+      return <MultiCheckDropdown {...common} label={label} options={lookups.allergies} />;
+    case 'acceptedDocuments':
+      return <CheckboxField {...common} label="Prihvaćam akte i dokumente udruge" />;
+    case 'dateOfBirth':
+    case 'memberSince':
+    case 'fullMemberSince':
+      return <TextField {...common} label={label} type="date" required={fieldKey !== 'fullMemberSince'} />;
+    case 'privateEmail':
+      return <TextField {...common} label={label} type="email" required />;
+    case 'oib':
+      return <TextField {...common} label={label} required maxLength={11} />;
+    case 'shirtSize':
+      return <SelectField {...common} label={label} required options={SHIRT_SIZE_OPTIONS} />;
+    default:
+      return <TextField {...common} label={label} required />;
+  }
+}
 
 export default function PendingRefillForm({ pending, fieldsToRefill, onUpdated }) {
   const lookups = useLookupData();
-  const [form, setForm] = useState({});
-  const [errors, setErrors] = useState([]);
+  const [submitError, setSubmitError] = useState('');
   const [submitting, setSubmitting] = useState(false);
 
-  useEffect(() => {
-    // Initialize form with empty values for fields that need refilling
-    const initial = {};
-    for (const key of fieldsToRefill) {
-      const val = pending.fieldData[key];
-      if (Array.isArray(val)) initial[key] = [];
-      else if (typeof val === 'boolean') initial[key] = false;
-      else initial[key] = '';
-    }
-    setForm(initial);
-  }, []);
+  // Build initial values for the fields that need refilling
+  const initialValues = {};
+  for (const key of fieldsToRefill) {
+    const val = pending.fieldData[key];
+    if (Array.isArray(val)) initialValues[key] = [];
+    else if (typeof val === 'boolean') initialValues[key] = false;
+    else initialValues[key] = '';
+  }
 
-  const handleChange = (e) => {
-    const { name, value, type, checked } = e.target;
-    setForm((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
-  };
+  const form = useForm(initialValues, memberValidators);
 
-  const handleMultiSelect = (e, field) => {
-    const selected = Array.from(e.target.selectedOptions, (o) => parseInt(o.value));
-    setForm((prev) => ({ ...prev, [field]: selected }));
-  };
+  const approvedFields = Object.entries(pending.fieldData).filter(
+    ([key]) => pending.fieldStatus[key] === 'APPROVED'
+  );
 
   const handleSubmit = async (e) => {
     e.preventDefault();
-    setErrors([]);
-    setSubmitting(true);
+    setSubmitError('');
+
+    if (!form.validateAll(fieldsToRefill)) {
+      setSubmitError('Ispravite označena polja prije slanja.');
+      return;
+    }
 
+    setSubmitting(true);
     try {
-      // Convert homeSectionId to int if present
-      const fields = { ...form };
+      const fields = { ...form.values };
       if (fields.homeSectionId) {
         fields.homeSectionId = parseInt(fields.homeSectionId);
       }
@@ -53,63 +105,51 @@ export default function PendingRefillForm({ pending, fieldsToRefill, onUpdated }
 
       const data = await res.json();
       if (!res.ok) {
-        setErrors([data.error || 'Greška.']);
+        setSubmitError(data.error || 'Greška.');
         return;
       }
       onUpdated(data);
     } catch (err) {
-      setErrors(['Mrežna greška.']);
+      setSubmitError('Mrežna greška.');
     } finally {
       setSubmitting(false);
     }
   };
 
   return (
-    <div style={{ padding: '2rem', maxWidth: '700px', margin: '0 auto' }}>
-      <h2>Popunite odbijena polja</h2>
-      <p>Voditelj sekcije je odbio neka polja. Molimo ispunite ih ponovo.</p>
-
-      {errors.length > 0 && (
-        <div style={{ color: 'red', marginBottom: '1rem' }}>
-          {errors.map((err, i) => <p key={i}>{err}</p>)}
-        </div>
+    <PageContainer title="Popunite odbijena polja">
+      <Alert kind="info">
+        Voditelj sekcije je odbio neka polja. Molimo ispunite ih ponovo. Odobrena polja
+        ostaju nepromijenjena.
+      </Alert>
+
+      {submitError && <Alert kind="error">{submitError}</Alert>}
+
+      {approvedFields.length > 0 && (
+        <Card title="Odobrena polja (ne mogu se mijenjati)">
+          <table className="table-base">
+            <tbody>
+              {approvedFields.map(([key, value]) => (
+                <tr key={key}>
+                  <td className="text-content-secondary">{FIELD_LABELS[key] || key}</td>
+                  <td>{displayValue(value)}</td>
+                </tr>
+              ))}
+            </tbody>
+          </table>
+        </Card>
       )}
 
-      <br />
-      <h3>Odobrena polja (ne mogu se mijenjati):</h3>
-      <table style={{ borderCollapse: 'collapse', width: '100%', marginBottom: '1rem' }}>
-        <tbody>
-          {Object.entries(pending.fieldData)
-            .filter(([key]) => pending.fieldStatus[key] === 'APPROVED')
-            .map(([key, value]) => (
-              <tr key={key}>
-                <td style={tdStyle}>{FIELD_LABELS[key] || key}</td>
-                <td style={tdStyle}>
-                  {Array.isArray(value) ? value.join(', ') : String(value ?? '')}
-                </td>
-              </tr>
-            ))}
-        </tbody>
-      </table>
-
-      <h3>Polja za popuniti:</h3>
-      <form onSubmit={handleSubmit}>
-        {fieldsToRefill.map((key) => (
-          <div key={key} style={{ marginBottom: '1rem' }}>
-            <FieldRenderer
-              fieldKey={key}
-              form={form}
-              onChange={handleChange}
-              onMultiSelect={handleMultiSelect}
-              lookups={lookups}
-            />
-          </div>
-        ))}
-        <br />
-        <button type="submit" disabled={submitting} style={{ padding: '0.5rem 2rem', fontSize: '1rem' }}>
-          {submitting ? 'Šaljem...' : 'Pošalji ispravke'}
-        </button>
-      </form>
-    </div>
+      <Card title="Polja za popuniti">
+        <form onSubmit={handleSubmit}>
+          {fieldsToRefill.map((key) => (
+            <RefillField key={key} fieldKey={key} form={form} lookups={lookups} />
+          ))}
+          <button type="submit" disabled={submitting} className="btn-primary mt-2">
+            {submitting ? 'Šaljem...' : 'Pošalji ispravke'}
+          </button>
+        </form>
+      </Card>
+    </PageContainer>
   );
 }
diff --git a/client/src/pages/PendingView.jsx b/client/src/pages/PendingView.jsx
index 3ee71a2..378efe2 100644
--- a/client/src/pages/PendingView.jsx
+++ b/client/src/pages/PendingView.jsx
@@ -1,12 +1,27 @@
 import { FIELD_LABELS } from '../constants';
-import { thStyle, tdStyle } from '../styles';
+import { PageContainer, Card, Alert } from '../components/ui';
 import PendingRefillForm from './PendingRefillForm';
 
+function displayValue(value) {
+  if (Array.isArray(value)) return value.join(', ') || '-';
+  if (typeof value === 'boolean') return value ? 'Da' : 'Ne';
+  return String(value ?? '') || '-';
+}
+
+function StatusBadge({ status }) {
+  const map = {
+    PENDING: { label: 'Na čekanju', cls: 'bg-brand-orange/15 text-brand-orange' },
+    APPROVED: { label: 'Odobreno', cls: 'bg-state-success/15 text-state-success' },
+    REJECTED: { label: 'Odbijeno', cls: 'bg-state-error/15 text-state-error' },
+  };
+  const s = map[status] || map.PENDING;
+  return <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${s.cls}`}>{s.label}</span>;
+}
+
 export default function PendingView({ pending, onUpdated }) {
   const data = pending.fieldData;
   const status = pending.fieldStatus;
 
-  // Check if there are fields that need re-filling (PENDING with empty value)
   const fieldsToRefill = Object.entries(status)
     .filter(([key, s]) => {
       if (s !== 'PENDING') return false;
@@ -17,42 +32,37 @@ export default function PendingView({ pending, onUpdated }) {
     })
     .map(([key]) => key);
 
-  const hasFieldsToRefill = fieldsToRefill.length > 0;
-
-  if (hasFieldsToRefill) {
+  if (fieldsToRefill.length > 0) {
     return <PendingRefillForm pending={pending} fieldsToRefill={fieldsToRefill} onUpdated={onUpdated} />;
   }
 
   return (
-    <div style={{ padding: '2rem' }}>
-      <h2>Vaša prijava čeka odobrenje</h2>
-      <p>Voditelj sekcije <strong>{pending.homeSection?.name}</strong> mora odobriti vašu prijavu.</p>
-      <br />
-      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
-        <thead>
-          <tr>
-            <th style={thStyle}>Polje</th>
-            <th style={thStyle}>Vrijednost</th>
-            <th style={thStyle}>Status</th>
-          </tr>
-        </thead>
-        <tbody>
-          {Object.entries(data).map(([key, value]) => {
-            const fieldLabel = FIELD_LABELS[key] || key;
-            const displayValue = Array.isArray(value) ? value.join(', ') : String(value ?? '');
-            const fieldSt = status[key] || 'PENDING';
-            return (
+    <PageContainer title="Prijava na čekanju">
+      <Alert kind="info">
+        Voditelj sekcije <strong>{pending.homeSection?.name}</strong> mora odobriti vašu prijavu.
+        Dok se to ne dogodi, podatke ne možete uređivati.
+      </Alert>
+
+      <Card>
+        <table className="table-base">
+          <thead>
+            <tr>
+              <th>Polje</th>
+              <th>Vrijednost</th>
+              <th>Status</th>
+            </tr>
+          </thead>
+          <tbody>
+            {Object.entries(data).map(([key, value]) => (
               <tr key={key}>
-                <td style={tdStyle}>{fieldLabel}</td>
-                <td style={tdStyle}>{displayValue}</td>
-                <td style={tdStyle}>
-                  {fieldSt === 'PENDING' ? 'Na čekanju' : fieldSt === 'APPROVED' ? 'Odobreno' : 'Odbijeno'}
-                </td>
+                <td className="text-content-secondary">{FIELD_LABELS[key] || key}</td>
+                <td>{displayValue(value)}</td>
+                <td><StatusBadge status={status[key] || 'PENDING'} /></td>
               </tr>
-            );
-          })}
-        </tbody>
-      </table>
-    </div>
+            ))}
+          </tbody>
+        </table>
+      </Card>
+    </PageContainer>
   );
 }
diff --git a/client/src/pages/RegistrationForm.jsx b/client/src/pages/RegistrationForm.jsx
index 115cbfc..33444fc 100644
--- a/client/src/pages/RegistrationForm.jsx
+++ b/client/src/pages/RegistrationForm.jsx
@@ -1,54 +1,66 @@
 import { useState } from 'react';
 import { jsonHeaders } from '../api/auth';
 import { useLookupData } from '../useLookupData';
-import FieldRenderer from '../components/FieldRenderer';
+import { useForm } from '../useForm';
+import { memberValidators } from '../validation';
+import { PageContainer, Card, Alert } from '../components/ui';
+import { TextField, SelectField, MultiCheckDropdown, CheckboxField } from '../components/Field';
+import { GENDER_OPTIONS, MEMBERSHIP_LEVEL_OPTIONS, DIET_TYPE_OPTIONS, SHIRT_SIZE_OPTIONS } from '../constants';
+
 
 export default function RegistrationForm({ email, onSubmitted }) {
   const lookups = useLookupData();
-  const [errors, setErrors] = useState([]);
+  const [submitError, setSubmitError] = useState('');
   const [submitting, setSubmitting] = useState(false);
 
-  const [form, setForm] = useState({
-    firstName: '',
-    lastName: '',
-    oib: '',
-    dateOfBirth: '',
-    address: '',
-    gender: '',
-    faculty: '',
-    phone: '',
-    privateEmail: '',
-    memberSince: new Date().toISOString().split('T')[0],
-    cardNumber: '',
-    membershipLevel: 'PRIDRUZENO',
-    fullMemberSince: '',
-    homeSectionId: '',
-    sectionIds: [],
-    teamIds: [],
-    drinkIds: [],
-    allergyIds: [],
-    dietType: '',
-    shirtSize: '',
-    acceptedDocuments: false,
-  });
-
-  const handleChange = (e) => {
-    const { name, value, type, checked } = e.target;
-    setForm((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
-  };
+  const form = useForm(
+    {
+      firstName: '',
+      lastName: '',
+      oib: '',
+      dateOfBirth: '',
+      address: '',
+      gender: '',
+      faculty: '',
+      phone: '',
+      privateEmail: '',
+      memberSince: new Date().toISOString().split('T')[0],
+      cardNumber: '',
+      membershipLevel: 'PRIDRUZENO',
+      fullMemberSince: '',
+      homeSectionId: '',
+      sectionIds: [],
+      teamIds: [],
+      drinkIds: [],
+      allergyIds: [],
+      dietType: '',
+      shirtSize: '',
+      acceptedDocuments: false,
+    },
+    memberValidators
+  );
 
-  const handleMultiSelect = (e, field) => {
-    const selected = Array.from(e.target.selectedOptions, (o) => parseInt(o.value));
-    setForm((prev) => ({ ...prev, [field]: selected }));
+  const { values, handleChange, handleBlur, showError, validateAll } = form;
+
+  const handleMembershipChange = (name, value) => {
+    handleChange(name, value);
+    if (value !== 'PUNOPRAVNO' && values.fullMemberSince) {
+      handleChange('fullMemberSince', '');
+    }
   };
 
   const handleSubmit = async (e) => {
     e.preventDefault();
-    setErrors([]);
-    setSubmitting(true);
+    setSubmitError('');
+
+    if (!validateAll()) {
+      setSubmitError('Ispravite označena polja prije slanja.');
+      return;
+    }
 
+    setSubmitting(true);
     try {
-      const body = { ...form, homeSectionId: parseInt(form.homeSectionId) };
+      const body = { ...values, homeSectionId: parseInt(values.homeSectionId) };
 
       const res = await fetch('/api/pending', {
         method: 'POST',
@@ -58,158 +70,102 @@ export default function RegistrationForm({ email, onSubmitted }) {
 
       const data = await res.json();
       if (!res.ok) {
-        setErrors(data.errors || [data.error || 'Greška pri slanju.']);
+        const msg = data.errors ? data.errors.join(' ') : data.error || 'Greška pri slanju.';
+        setSubmitError(msg);
         return;
       }
       onSubmitted(data);
     } catch (err) {
-      setErrors(['Mrežna greška. Pokušajte ponovo.']);
+      setSubmitError('Mrežna greška. Pokušajte ponovo.');
     } finally {
       setSubmitting(false);
     }
   };
 
   return (
-    <div style={{ padding: '2rem', maxWidth: '700px', margin: '0 auto' }}>
-      <h2>Pristupna forma</h2>
-      <p>E-mail pri udruzi: <strong>{email}</strong> (postavlja se automatski)</p>
+    <PageContainer title="Pristupna forma">
+      <Alert kind="info">
+        E-mail pri udruzi: <strong>{email}</strong> (postavlja se automatski iz vašeg Google računa)
+      </Alert>
 
-      {errors.length > 0 && (
-        <div style={{ color: 'red', marginBottom: '1rem' }}>
-          {errors.map((err, i) => <p key={i}>{err}</p>)}
-        </div>
-      )}
+      {submitError && <Alert kind="error">{submitError}</Alert>}
 
       <form onSubmit={handleSubmit}>
-        <fieldset>
-          <legend>Osobni podatci</legend>
-
-          <label>Ime *<br />
-            <input name="firstName" value={form.firstName} onChange={handleChange} required />
-          </label><br /><br />
-
-          <label>Prezime *<br />
-            <input name="lastName" value={form.lastName} onChange={handleChange} required />
-          </label><br /><br />
-
-          <label>OIB (11 znamenaka) *<br />
-            <input name="oib" value={form.oib} onChange={handleChange} maxLength={11} pattern="\d{11}" required />
-          </label><br /><br />
-
-          <label>Datum rođenja *<br />
-            <input name="dateOfBirth" type="date" value={form.dateOfBirth} onChange={handleChange} required />
-          </label><br /><br />
-
-          <label>Adresa *<br />
-            <input name="address" value={form.address} onChange={handleChange} required style={{ width: '100%' }} />
-          </label><br /><br />
-
-          <label>Spol *<br />
-            <select name="gender" value={form.gender} onChange={handleChange} required>
-              <option value="">-- Odaberite --</option>
-              <option value="M">Muški</option>
-              <option value="Z">Ženski</option>
-            </select>
-          </label><br /><br />
-
-          <label>Fakultet *<br />
-            <input name="faculty" value={form.faculty} onChange={handleChange} required />
-          </label><br /><br />
-
-          <label>Broj telefona *<br />
-            <input name="phone" value={form.phone} onChange={handleChange} required />
-          </label><br /><br />
-
-          <label>Privatni e-mail *<br />
-            <input name="privateEmail" type="email" value={form.privateEmail} onChange={handleChange} required />
-          </label><br /><br />
-        </fieldset>
-
-        <fieldset>
-          <legend>Članstvo</legend>
-
-          <label>Datum učlanjenja *<br />
-            <input name="memberSince" type="date" value={form.memberSince} onChange={handleChange} required />
-          </label><br /><br />
-
-          <label>Broj iskaznice *<br />
-            <input name="cardNumber" value={form.cardNumber} onChange={handleChange} required />
-          </label><br /><br />
-
-          <label>Razina članstva *<br />
-            <select name="membershipLevel" value={form.membershipLevel} onChange={handleChange} required>
-              <option value="PRIDRUZENO">Pridruženo</option>
-              <option value="PUNOPRAVNO">Punopravno</option>
-              <option value="POCASNO">Počasno</option>
-              <option value="STARO">Staro</option>
-            </select>
-          </label><br /><br />
-
-          {form.membershipLevel === 'PUNOPRAVNO' && (
-            <><label>Datum postanka punopravnim članom<br />
-              <input name="fullMemberSince" type="date" value={form.fullMemberSince} onChange={handleChange} />
-            </label><br /><br /></>
-          )}
-
-          <label>Matična sekcija *<br />
-            <select name="homeSectionId" value={form.homeSectionId} onChange={handleChange} required>
-              <option value="">-- Odaberite --</option>
-              {lookups.sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
-            </select>
-          </label><br /><br />
-
-          <label>Pridružene sekcije (Ctrl+click za više)<br />
-            <select multiple size={5} value={form.sectionIds.map(String)} onChange={(e) => handleMultiSelect(e, 'sectionIds')}>
-              {lookups.sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
-            </select>
-          </label><br /><br />
-
-          <label>Timovi (Ctrl+click za više)<br />
-            <select multiple size={3} value={form.teamIds.map(String)} onChange={(e) => handleMultiSelect(e, 'teamIds')}>
-              {lookups.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
-            </select>
-          </label><br /><br />
-        </fieldset>
-
-        <fieldset>
-          <legend>Ostalo</legend>
-
-          <label>Tip prehrane *<br />
-            <select name="dietType" value={form.dietType} onChange={handleChange} required>
-              <option value="">-- Odaberite --</option>
-              <option value="MESOJED">Mesojed</option>
-              <option value="VEGETARIJANSTVO">Vegetarijanstvo</option>
-              <option value="VEGANSTVO">Veganstvo</option>
-              <option value="SVEJED">Svejed</option>
-            </select>
-          </label><br /><br />
-
-          <label>Pića * (Ctrl+click za više, min. 1)<br />
-            <select multiple size={5} value={form.drinkIds.map(String)} onChange={(e) => handleMultiSelect(e, 'drinkIds')} required>
-              {lookups.drinks.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
-            </select>
-          </label><br /><br />
-
-          <label>Alergije (Ctrl+click za više)<br />
-            <select multiple size={5} value={form.allergyIds.map(String)} onChange={(e) => handleMultiSelect(e, 'allergyIds')}>
-              {lookups.allergies.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
-            </select>
-          </label><br /><br />
-
-          <label>Veličina majice *<br />
-            <input name="shirtSize" value={form.shirtSize} onChange={handleChange} placeholder="S, M, L, XL..." required />
-          </label><br /><br />
-
-          <label>
-            <input name="acceptedDocuments" type="checkbox" checked={form.acceptedDocuments} onChange={handleChange} required />
-            {' '}Prihvaćam akte i dokumente udruge *
-          </label><br /><br />
-        </fieldset>
-
-        <button type="submit" disabled={submitting} style={{ padding: '0.5rem 2rem', fontSize: '1rem' }}>
+        <Card title="Osobni podatci">
+          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
+            <TextField name="firstName" label="Ime" required
+              value={values.firstName} onChange={handleChange} onBlur={handleBlur} error={showError('firstName')} />
+            <TextField name="lastName" label="Prezime" required
+              value={values.lastName} onChange={handleChange} onBlur={handleBlur} error={showError('lastName')} />
+            <TextField name="oib" label="OIB (11 znamenaka)" required maxLength={11}
+              value={values.oib} onChange={handleChange} onBlur={handleBlur} error={showError('oib')} />
+            <TextField name="dateOfBirth" label="Datum rođenja" type="date" required
+              value={values.dateOfBirth} onChange={handleChange} onBlur={handleBlur} error={showError('dateOfBirth')} />
+          </div>
+
+          <TextField name="address" label="Adresa" required
+            value={values.address} onChange={handleChange} onBlur={handleBlur} error={showError('address')} />
+
+          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
+            <SelectField name="gender" label="Spol" required options={GENDER_OPTIONS}
+              value={values.gender} onChange={handleChange} onBlur={handleBlur} error={showError('gender')} />
+            <TextField name="faculty" label="Fakultet" required
+              value={values.faculty} onChange={handleChange} onBlur={handleBlur} error={showError('faculty')} />
+            <TextField name="phone" label="Broj telefona" required
+              value={values.phone} onChange={handleChange} onBlur={handleBlur} error={showError('phone')} />
+            <TextField name="privateEmail" label="Privatni e-mail" type="email" required
+              value={values.privateEmail} onChange={handleChange} onBlur={handleBlur} error={showError('privateEmail')} />
+          </div>
+        </Card>
+
+        <Card title="Članstvo">
+          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
+            <TextField name="memberSince" label="Datum učlanjenja" type="date" required
+              value={values.memberSince} onChange={handleChange} onBlur={handleBlur} error={showError('memberSince')} />
+            <TextField name="cardNumber" label="Broj iskaznice" required
+              value={values.cardNumber} onChange={handleChange} onBlur={handleBlur} error={showError('cardNumber')} />
+            <SelectField name="membershipLevel" label="Razina članstva" required options={MEMBERSHIP_LEVEL_OPTIONS}
+              value={values.membershipLevel} onChange={handleMembershipChange} onBlur={handleBlur} error={showError('membershipLevel')} />
+            {values.membershipLevel === 'PUNOPRAVNO' && (
+              <TextField name="fullMemberSince" label="Datum postanka punopravnim članom" type="date"
+                value={values.fullMemberSince} onChange={handleChange} onBlur={handleBlur} error={showError('fullMemberSince')} />
+            )}
+          </div>
+
+          <SelectField name="homeSectionId" label="Matična sekcija" required
+            options={lookups.sections.map((s) => ({ value: s.id, label: s.name }))}
+            value={values.homeSectionId} onChange={handleChange} onBlur={handleBlur} error={showError('homeSectionId')} />
+
+          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
+            <MultiCheckDropdown name="sectionIds" label="Pridružene sekcije"
+              options={lookups.sections} value={values.sectionIds} onChange={handleChange} onBlur={handleBlur} error={showError('sectionIds')} />
+            <MultiCheckDropdown name="teamIds" label="Timovi"
+              options={lookups.teams} value={values.teamIds} onChange={handleChange} onBlur={handleBlur} error={showError('teamIds')} />
+          </div>
+        </Card>
+
+        <Card title="Ostalo">
+          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
+            <SelectField name="dietType" label="Tip prehrane" required options={DIET_TYPE_OPTIONS}
+              value={values.dietType} onChange={handleChange} onBlur={handleBlur} error={showError('dietType')} />
+            <SelectField name="shirtSize" label="Veličina majice" required options={SHIRT_SIZE_OPTIONS}
+              value={values.shirtSize} onChange={handleChange} onBlur={handleBlur} error={showError('shirtSize')} />
+            <MultiCheckDropdown name="drinkIds" label="Pića" required
+              options={lookups.drinks} value={values.drinkIds} onChange={handleChange} onBlur={handleBlur} error={showError('drinkIds')} />
+            <MultiCheckDropdown name="allergyIds" label="Alergije"
+              options={lookups.allergies} value={values.allergyIds} onChange={handleChange} onBlur={handleBlur} error={showError('allergyIds')} />
+          </div>
+
+          <div className="mt-2">
+            <CheckboxField name="acceptedDocuments" label="Prihvaćam akte i dokumente udruge"
+              value={values.acceptedDocuments} onChange={handleChange} onBlur={handleBlur} error={showError('acceptedDocuments')} />
+          </div>
+        </Card>
+
+        <button type="submit" disabled={submitting} className="btn-primary">
           {submitting ? 'Šaljem...' : 'Pošalji prijavu'}
         </button>
       </form>
-    </div>
+    </PageContainer>
   );
 }
diff --git a/client/src/useLookupData.js b/client/src/useLookupData.js
index 3a2670f..e2db102 100644
--- a/client/src/useLookupData.js
+++ b/client/src/useLookupData.js
@@ -1,12 +1,12 @@
 import { useState, useEffect } from 'react';
 import { authHeaders } from './api/auth';
 
-// Fetches lookup data (sections, teams, drinks, allergies) used by the forms.
 export function useLookupData() {
   const [sections, setSections] = useState([]);
   const [teams, setTeams] = useState([]);
   const [drinks, setDrinks] = useState([]);
   const [allergies, setAllergies] = useState([]);
+  const [faculties, setFaculties] = useState([]);
 
   useEffect(() => {
     const headers = authHeaders();
@@ -15,13 +15,15 @@ export function useLookupData() {
       fetch('/api/teams', { headers }).then((r) => r.json()),
       fetch('/api/drinks', { headers }).then((r) => r.json()),
       fetch('/api/allergies', { headers }).then((r) => r.json()),
-    ]).then(([s, t, d, a]) => {
+      fetch('/api/faculties', { headers }).then((r) => r.json()),
+    ]).then(([s, t, d, a, f]) => {
       setSections(s);
       setTeams(t);
       setDrinks(d);
       setAllergies(a);
+      setFaculties(f);
     });
   }, []);
 
-  return { sections, teams, drinks, allergies };
+  return { sections, teams, drinks, allergies, faculties };
 }
diff --git a/client/tailwind.config.js b/client/tailwind.config.js
index baf5440..0e02ad3 100644
--- a/client/tailwind.config.js
+++ b/client/tailwind.config.js
@@ -1,8 +1,34 @@
-/** @type {import('tailwindcss').Config} */
 export default {
   content: ['./index.html', './src/**/*.{js,jsx}'],
   theme: {
-    extend: {},
+    extend: {
+      colors: {
+        brand: {
+          orange: '#F68C1E',
+          'orange-hover': '#ff9d38',
+          dark: '#040C12',
+        },
+        surface: {
+          base: '#2b2b2b',
+          raised: '#3b3b3b',
+          overlay: '#484848',
+          border: '#565656',
+        },
+
+        content: {
+          primary: '#FFFFFF',
+          secondary: '#A8B7C4',
+          muted: '#6B7C8A',
+        },
+        state: {
+          error: '#F87171',
+          success: '#4ADE80',
+        },
+      },
+      fontFamily: {
+        sans: ['Inter', 'system-ui', 'sans-serif'],
+      },
+    },
   },
   plugins: [],
 };
diff --git a/server/prisma/schema.prisma b/server/prisma/schema.prisma
index e31deec..990e5f6 100644
--- a/server/prisma/schema.prisma
+++ b/server/prisma/schema.prisma
@@ -83,10 +83,12 @@ model Member {
   dateOfBirth        DateTime        @db.Date
   address            String
   gender             Gender
-  faculty            String
+  facultyId          Int?
+  faculty            Faculty?        @relation(fields: [facultyId], references: [id])
+  facultyOther       String?
   phone              String
   privateEmail       String
-  associationEmail   String          @unique
+  ksetEmail          String          @unique
   memberSince        DateTime        @db.Date
   cardNumber         String          @unique
   membershipLevel    MembershipLevel
@@ -202,3 +204,10 @@ model AuditLog {
 
   createdAt DateTime @default(now())
 }
+
+model Faculty {
+  id   Int    @id @default(autoincrement())
+  name String @unique
+
+  members Member[]
+}
diff --git a/server/prisma/seed.js b/server/prisma/seed.js
index 8118848..a9117e6 100644
--- a/server/prisma/seed.js
+++ b/server/prisma/seed.js
@@ -61,10 +61,23 @@ async function main() {
   }
   console.log(`Seeded ${drinks.length} drinks`);
 
-    // Admin korisnik
+
+  const faculties = [
+    'FER', 'FSB', 'PMF', 'FFZG', 'TVZ',
+  ];
+  for (const name of faculties) {
+    await prisma.faculty.upsert({
+      where: { name },
+      update: {},
+      create: { name },
+    });
+  }
+  console.log(`Seeded ${faculties.length} faculties`);
+
+
   const adminEmail = process.env.ADMIN_EMAIL || 'admin@udruga.hr';
   await prisma.member.upsert({
-    where: { associationEmail: adminEmail },
+    where: { ksetEmail: adminEmail },
     update: { appRole: 'ADMINISTRATOR' },
     create: {
       firstName: 'KSET',
@@ -73,10 +86,9 @@ async function main() {
       dateOfBirth: new Date('1990-01-01'),
       address: 'Admin adresa',
       gender: 'M',
-      faculty: 'N/A',
       phone: '0000000000',
       privateEmail: adminEmail,
-      associationEmail: adminEmail,
+      ksetEmail: adminEmail,
       memberSince: new Date(),
       cardNumber: 'ADMIN-001',
       membershipLevel: 'PUNOPRAVNO',
diff --git a/server/src/index.js b/server/src/index.js
index 9ff5b00..fde74fc 100644
--- a/server/src/index.js
+++ b/server/src/index.js
@@ -10,6 +10,7 @@ const allergyRoutes = require('./routes/allergies');
 const pendingRoutes = require('./routes/pending');
 const memberRoutes = require('./routes/members');
 const fieldChangeRoutes = require('./routes/fieldChanges');
+const facultyRoutes = require('./routes/faculties');
 
 const app = express();
 
@@ -33,6 +34,7 @@ app.use('/api/allergies', allergyRoutes);
 app.use('/api/pending', pendingRoutes);
 app.use('/api/members', memberRoutes);
 app.use('/api/field-changes', fieldChangeRoutes);
+app.use('/api/faculties', facultyRoutes);
 
 app.listen(config.port, () => {
   console.log(`Server running on port ${config.port}`);
diff --git a/server/src/routes/auth.js b/server/src/routes/auth.js
index b2dd107..9b41177 100644
--- a/server/src/routes/auth.js
+++ b/server/src/routes/auth.js
@@ -31,7 +31,7 @@ router.get(
 
       // Check if member exists
       const member = await prisma.member.findUnique({
-        where: { associationEmail: email },
+        where: { ksetEmail: email },
       });
 
       const tokenPayload = {
@@ -113,7 +113,7 @@ router.post('/refresh', authenticateToken, async (req, res) => {
     const { email } = req.user;
 
     const member = await prisma.member.findUnique({
-      where: { associationEmail: email },
+      where: { ksetEmail: email },
     });
 
     const tokenPayload = {
diff --git a/server/src/routes/pending.js b/server/src/routes/pending.js
index f199485..3493f4c 100644
--- a/server/src/routes/pending.js
+++ b/server/src/routes/pending.js
@@ -1,6 +1,7 @@
 const express = require('express');
 const { PrismaClient } = require('@prisma/client');
 const { authenticateToken } = require('../middleware/auth');
+const { isValidOib } = require('../utils/oib');
 
 const router = express.Router();
 const prisma = new PrismaClient();
@@ -30,7 +31,7 @@ router.post('/', authenticateToken, async (req, res) => {
     const { email } = req.user;
 
     const existingMember = await prisma.member.findUnique({
-      where: { associationEmail: email },
+      where: { ksetEmail: email },
     });
     if (existingMember) {
       return res.status(400).json({ error: 'Već ste registrirani kao član.' });
@@ -54,7 +55,7 @@ router.post('/', authenticateToken, async (req, res) => {
 
     if (!firstName || !firstName.trim()) errors.push('Ime je obavezno.');
     if (!lastName || !lastName.trim()) errors.push('Prezime je obavezno.');
-    if (!oib || !/^\d{11}$/.test(oib)) errors.push('OIB mora imati 11 znamenaka.');
+    if (!oib || !isValidOib(oib)) errors.push('OIB nije ispravan.');
     if (!dateOfBirth) errors.push('Datum rođenja je obavezan.');
     if (!address || !address.trim()) errors.push('Adresa je obavezna.');
     if (!gender || !['M', 'Z'].includes(gender)) errors.push('Spol je obavezan (M ili Ž).');
@@ -80,7 +81,6 @@ router.post('/', authenticateToken, async (req, res) => {
       return res.status(400).json({ errors });
     }
 
-    // associationEmail is always the Google email - not user-editable
     const fieldData = {
       firstName: firstName.trim(),
       lastName: lastName.trim(),
@@ -91,7 +91,7 @@ router.post('/', authenticateToken, async (req, res) => {
       faculty: faculty.trim(),
       phone: phone.trim(),
       privateEmail: privateEmail.trim(),
-      associationEmail: email, // Fix #3: always use Google email
+      ksetEmail: email,
       memberSince,
       cardNumber: cardNumber.trim(),
       membershipLevel,
@@ -326,7 +326,7 @@ router.patch('/:id/review', authenticateToken, async (req, res) => {
           faculty: data.faculty,
           phone: data.phone,
           privateEmail: data.privateEmail,
-          associationEmail: data.associationEmail,
+          ksetEmail: data.ksetEmail,
           memberSince: new Date(data.memberSince),
           cardNumber: data.cardNumber,
           membershipLevel: data.membershipLevel,
