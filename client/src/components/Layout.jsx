import { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';

function navClass({ isActive }) {
  return [
    'block px-3 py-2 border-b-2 border-transparent text-sm font-medium transition-colors',
    isActive
      ? 'border-brand-orange text-brand-orange'
      : 'text-content-secondary hover:text-brand-orange',
  ].join(' ');
}

export default function Layout({ isLeaderOrAdmin, canViewMembers, isAdmin, onLogout, linkMessage, onDismissLinkMessage }) {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleLogout = () => {
    onLogout();
    navigate('/login');
  };

  const closeMenu = () => setMenuOpen(false);

  const navLinks = (
    <>
      <NavLink to="/" className={navClass} end onClick={closeMenu}>
        Moj profil
      </NavLink>
      {isLeaderOrAdmin && (
        <NavLink to="/zahtjevi" className={navClass} onClick={closeMenu}>
          Zahtjevi
        </NavLink>
      )}
      {canViewMembers && (
        <NavLink to="/clanovi" className={navClass} onClick={closeMenu}>
          Članovi
        </NavLink>
      )}
      {isLeaderOrAdmin && (
        <NavLink to="/pocasni-clanovi" className={navClass} onClick={closeMenu}>
          Počasni članovi
        </NavLink>
      )}
      {isAdmin && (
        <NavLink to="/nadzorna-ploca" className={navClass} onClick={closeMenu}>
          Nadzorna ploča
        </NavLink>
      )}
      {isAdmin && (
        <NavLink to="/uvoz" className={navClass} onClick={closeMenu}>
          Uvoz podataka
        </NavLink>
      )}
    </>
  );

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-10 border-t-2 border-brand-orange bg-surface-raised border-b border-surface-border">
        <div className="px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <img src="/logo-full.png" alt="KSET" className="h-7 w-auto" />
            {/* Desktop */}
            <nav className="hidden md:flex items-center gap-1">
              {navLinks}
            </nav>
          </div>
          <button onClick={handleLogout} className="hidden md:inline-flex btn-ghost">
            Odjava
          </button>

          {/* Mobile */}
          <button
            className="md:hidden text-content-primary p-2"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Izbornik"
          >
            <div className="space-y-1.5">
              <span className="block w-6 h-0.5 bg-content-primary" />
              <span className="block w-6 h-0.5 bg-content-primary" />
              <span className="block w-6 h-0.5 bg-content-primary" />
            </div>
          </button>
        </div>
        {menuOpen && (
          <div className="md:hidden border-t border-surface-border px-4 py-3 space-y-1">
            {navLinks}
            <button onClick={handleLogout} className="btn-ghost w-full justify-start mt-2">
              Odjava
            </button>
          </div>
        )}
      </header>

      {linkMessage && (
        <div className="px-4 sm:px-6 py-2 bg-surface-overlay border-b border-surface-border flex items-center justify-between text-sm">
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
