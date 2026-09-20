import { Outlet, NavLink, useNavigate } from 'react-router-dom';

function navClass({ isActive }) {
  return [
    'px-3 py-2 rounded-md text-sm font-medium transition-colors',
    isActive
      ? 'bg-surface-overlay text-brand-orange'
      : 'text-content-secondary hover:text-content-primary hover:bg-surface-overlay',
  ].join(' ');
}

export default function Layout({ user, isLeaderOrAdmin, onLogout, linkMessage, onDismissLinkMessage }) {
  const navigate = useNavigate();

  const handleLogout = () => {
    onLogout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-10 bg-surface-raised border-b border-surface-border">
        <div className="px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <img src="/logo-full.png" alt="KSET" className="h-8" />
            <nav className="flex items-center gap-1">
              <NavLink to="/" className={navClass} end>
                Moj profil
              </NavLink>
              {isLeaderOrAdmin && (
                <NavLink to="/zahtjevi" className={navClass}>
                  Zahtjevi
                </NavLink>
              )}
              {isLeaderOrAdmin && (
                <NavLink to="/clanovi" className={navClass}>
                  Članovi
                </NavLink>
              )}
            </nav>
          </div>
          <button onClick={handleLogout} className="btn-ghost">
            Odjava
          </button>
        </div>
      </header>

      {linkMessage && (
        <div className="px-6 py-2 bg-surface-overlay border-b border-surface-border flex items-center justify-between text-sm">
          <span className="text-content-secondary">{linkMessage}</span>
          <button onClick={onDismissLinkMessage} className="text-content-muted hover:text-content-primary px-2">
            ×
          </button>
        </div>
      )}

      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}
