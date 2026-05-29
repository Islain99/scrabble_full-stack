// src/components/Navbar.jsx
import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

const NAV_LINKS = [
  { label: 'Jouer',      hash: '#/'           },
  { label: 'Classement', hash: '#/leaderboard' },
  { label: 'Profil',     hash: '#/profile',  authOnly: true },
];

export default function Navbar() {
  const { user, isAuthenticated, logout, loading } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const currentHash = window.location.hash || '#/';

  const handleLogout = async () => {
    await logout();
    window.location.hash = '#/login';
  };

  if (loading) return null;

  return (
    <nav style={styles.nav}>
      {/* Logo */}
      <a href="#/" style={styles.logo}>
        <span style={styles.logoText}>SCRABBLE</span>
        <span style={styles.logoEdition}>1972</span>
      </a>

      {/* Desktop links */}
      <div style={styles.links}>
        {NAV_LINKS.filter(l => !l.authOnly || isAuthenticated).map(link => (
          <a
            key={link.hash}
            href={link.hash}
            style={{
              ...styles.link,
              ...(currentHash === link.hash ? styles.linkActive : {}),
            }}
          >
            {link.label}
          </a>
        ))}
      </div>

      {/* Auth zone */}
      <div style={styles.authZone}>
        {isAuthenticated ? (
          <div style={styles.userZone}>
            {/* Avatar */}
            <div style={styles.avatar}>
              {user?.avatar_url ? (
                <img src={user.avatar_url} alt="" style={styles.avatarImg} />
              ) : (
                <span style={styles.avatarInitial}>
                  {user?.display_name?.[0]?.toUpperCase() ?? '?'}
                </span>
              )}
            </div>
            <span style={styles.userName}>{user?.display_name}</span>
            <button onClick={handleLogout} style={styles.logoutBtn}>
              Déconnexion
            </button>
          </div>
        ) : (
          <div style={styles.guestZone}>
            <a href="#/login" style={styles.loginLink}>Connexion</a>
            <a href="#/register" style={styles.registerBtn}>Inscription</a>
          </div>
        )}
      </div>
    </nav>
  );
}

const styles = {
  nav: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 28px',
    height: '60px',
    borderBottom: '3px solid #1E1A12',
    background: '#F5EDD6',
    position: 'sticky',
    top: 0,
    zIndex: 100,
    gap: '16px',
  },
  logo: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '10px',
    textDecoration: 'none',
    flexShrink: 0,
  },
  logoText: {
    fontFamily: "'Playfair Display', Georgia, serif",
    fontSize: '1.7rem',
    fontWeight: 900,
    color: '#1E1A12',
    letterSpacing: '-0.04em',
  },
  logoEdition: {
    fontFamily: "'DM Mono', monospace",
    fontSize: '0.65rem',
    color: '#8A7E65',
    letterSpacing: '0.15em',
  },
  links: {
    display: 'flex',
    gap: '4px',
    flex: 1,
    justifyContent: 'center',
  },
  link: {
    fontFamily: "'DM Mono', monospace",
    fontSize: '0.78rem',
    fontWeight: 500,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: '#8A7E65',
    textDecoration: 'none',
    padding: '7px 14px',
    borderRadius: '2px',
    transition: 'background 0.1s, color 0.1s',
  },
  linkActive: {
    color: '#1E1A12',
    background: '#EDE0C0',
  },
  authZone: { flexShrink: 0 },
  userZone: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  avatar: {
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    border: '2px solid #C8A830',
    overflow: 'hidden',
    background: '#EDE0C0',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarImg: { width: '100%', height: '100%', objectFit: 'cover' },
  avatarInitial: {
    fontFamily: "'Playfair Display', serif",
    fontSize: '1rem',
    fontWeight: 700,
    color: '#1E1A12',
  },
  userName: {
    fontFamily: "'Playfair Display', serif",
    fontSize: '1rem',
    fontWeight: 700,
    color: '#1E1A12',
    maxWidth: '140px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  logoutBtn: {
    fontFamily: "'DM Mono', monospace",
    fontSize: '0.72rem',
    fontWeight: 500,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: '#8B2020',
    background: 'transparent',
    border: '1.5px solid #8B2020',
    borderRadius: '2px',
    padding: '6px 12px',
    cursor: 'pointer',
  },
  guestZone: { display: 'flex', alignItems: 'center', gap: '10px' },
  loginLink: {
    fontFamily: "'DM Mono', monospace",
    fontSize: '0.75rem',
    fontWeight: 500,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: '#8A7E65',
    textDecoration: 'none',
    padding: '6px 12px',
  },
  registerBtn: {
    fontFamily: "'DM Mono', monospace",
    fontSize: '0.75rem',
    fontWeight: 500,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: '#F5EDD6',
    background: '#5E6B3A',
    border: '2px solid #3D4A20',
    borderRadius: '2px',
    padding: '6px 14px',
    textDecoration: 'none',
    boxShadow: '2px 2px 0 #2A3010',
  },
};