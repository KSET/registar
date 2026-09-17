import { Outlet, NavLink, useNavigate } from 'react-router-dom';

const linkStyle = ({ isActive }) => ({ fontWeight: isActive ? 'bold' : 'normal' });

export default function Layout({ user, isLeaderOrAdmin, onLogout, linkMessage, onDismissLinkMessage }) {
  const navigate = useNavigate();

  const handleLogout = () => {
    onLogout();
    navigate('/login');
  };

  return (
    <div>
      <div style={{ padding: '0.5rem 2rem', borderBottom: '1px solid #ccc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <span>{user.email}</span>
          {isLeaderOrAdmin && (
            <>
              <NavLink to="/" style={linkStyle} end>Moj profil</NavLink>
              <NavLink to="/zahtjevi" style={linkStyle}>Zahtjevi</NavLink>
            </>
          )}
        </div>
        <button onClick={handleLogout} style={{ padding: '0.3rem 1rem' }}>Odjava</button>
      </div>
      {linkMessage && (
        <div style={{ padding: '0.5rem 2rem', background: '#f0f0f0', display: 'flex', justifyContent: 'space-between' }}>
          <span>{linkMessage}</span>
          <button onClick={onDismissLinkMessage} style={{ padding: '0 0.5rem' }}>×</button>
        </div>
      )}
      <Outlet />
    </div>
  );
}
