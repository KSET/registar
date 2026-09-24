import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { getToken, setToken, clearToken, authHeaders, refreshToken } from './api/auth';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import MemberView from './pages/MemberView';
import RegistrationForm from './pages/RegistrationForm';
import PendingView from './pages/PendingView';
import ApprovalDashboard from './pages/ApprovalDashboard';
import MembersList from './pages/MembersList';
import AdminDashboard from './pages/AdminDashboard';
import ImportPage from './pages/ImportPage';
import HonoraryMembersPage from './pages/HonoraryMembersPage';

const LINK_MESSAGES = {
  success: 'E-mail je uspješno povezan.',
  already: 'Taj e-mail je već povezan s vašim računom.',
};

const LINK_ERROR_MESSAGES = {
  auth_failed: 'Prijava putem Google računa nije uspjela.',
  invalid_state: 'Povezivanje nije uspjelo, pokušajte ponovo.',
  member_not_found: 'Račun nije pronađen.',
  email_taken: 'Taj e-mail je već povezan s drugim računom.',
  server_error: 'Greška na serveru.',
};

function App() {
  const [user, setUser] = useState(null);
  const [pending, setPending] = useState(null);
  const [loading, setLoading] = useState(true);
  const [linkMessage, setLinkMessage] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    const linked = params.get('linked');
    const linkError = params.get('linkError');
    const path = window.location.pathname;

    if (path === '/auth/callback' && token) {
      setToken(token);
      window.history.replaceState({}, '', '/');
    }

    if (linked || linkError) {
      setLinkMessage(
        linked ? LINK_MESSAGES[linked] || 'E-mail povezan.' : LINK_ERROR_MESSAGES[linkError] || 'Povezivanje nije uspjelo.'
      );
      window.history.replaceState({}, '', '/');
    }

    loadUser();
  }, []);

  const loadUser = async () => {
    const storedToken = getToken();
    if (!storedToken) {
      setLoading(false);
      return;
    }

    try {
      // Always try to refresh token to get latest member data
      await refreshToken();

      const res = await fetch('/api/auth/me', { headers: authHeaders() });

      if (!res.ok) {
        clearToken();
        setLoading(false);
        return;
      }

      const data = await res.json();
      setUser(data);

      if (data.isNewUser && data.hasPendingApplication) {
        const pendingRes = await fetch('/api/pending/me', { headers: authHeaders() });
        if (pendingRes.ok) {
          setPending(await pendingRes.json());
        }
      }
    } catch (err) {
      console.error(err);
      clearToken();
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    clearToken();
    setUser(null);
    setPending(null);
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-content-secondary">Učitavanje...</div>;
  }

  const appRole = user?.member?.appRole || user?.appRole;
  const isLeaderOrAdmin = appRole === 'VODITELJ_SEKCIJE' || appRole === 'ADMINISTRATOR';
  const isAdmin = appRole === 'ADMINISTRATOR';

  const renderHome = () => {
    if (!user.isNewUser && user.member) {
      return (
        <MemberView
          member={user.member}
          isAdmin={appRole === 'ADMINISTRATOR'}
          onUpdated={(updated) =>
            setUser((prev) => ({ ...prev, member: updated }))
          }
        />
      );
    }
    if (user.isNewUser && pending) {
      return <PendingView pending={pending} onUpdated={(updated) => setPending(updated)} />;
    }
    return <RegistrationForm email={user.email} onSubmitted={(data) => setPending(data)} />;
  };

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/login"
          element={user ? <Navigate to="/" replace /> : <LoginPage />}
        />

        {user ? (
          <Route
            element={
              <Layout
                user={user}
                isLeaderOrAdmin={isLeaderOrAdmin}
                isAdmin={isAdmin}
                onLogout={handleLogout}
                linkMessage={linkMessage}
                onDismissLinkMessage={() => setLinkMessage(null)}
              />
            }
          >
            <Route path="/" element={renderHome()} />
            <Route
              path="/zahtjevi"
              element={isLeaderOrAdmin ? <ApprovalDashboard /> : <Navigate to="/" replace />}
            />
            <Route
              path="/clanovi"
              element={isLeaderOrAdmin ? <MembersList isAdmin={appRole === 'ADMINISTRATOR'} /> : <Navigate to="/" replace />}
            />
            <Route
              path="/nadzorna-ploca"
              element={isAdmin ? <AdminDashboard /> : <Navigate to="/" replace />}
            />
            <Route
              path="/uvoz"
              element={isAdmin ? <ImportPage /> : <Navigate to="/" replace />}
            />
            <Route
              path="/pocasni-clanovi"
              element={isLeaderOrAdmin ? <HonoraryMembersPage isAdmin={isAdmin} /> : <Navigate to="/" replace />}
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        ) : (
          <Route path="*" element={<Navigate to="/login" replace />} />
        )}
      </Routes>
    </BrowserRouter>
  );
}

export default App;
