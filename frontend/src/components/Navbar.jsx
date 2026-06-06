// src/components/Navbar.jsx
import React, { useState } from 'react';
import { useAuth }     from '../context/AuthContext';
import { useTheme }    from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';

// Icônes thème (inchangées)
const ThemeIcons = { light: '☀️', dark: '🌙', system: '⚙️' };

export default function Navbar() {
  const { user, isAuthenticated, logout, loading } = useAuth();
  const { preference, setTheme, THEMES, resolvedTheme } = useTheme();
  const { t, language, setLanguage }                    = useLanguage();
  const [showThemeMenu, setShowThemeMenu] = useState(false);
  const currentHash = window.location.hash || '#/';

  // Labels traduits (recalculés à chaque render, donc réactifs au changement de langue)
  const ThemeLabels = {
    light:  t('theme_light'),
    dark:   t('theme_dark'),
    system: t('theme_system'),
  };

  const NAV_LINKS = [
    { label: t('nav_play'),      hash: '#/'            },
    { label: t('nav_leaderboard'), hash: '#/leaderboard' },
    { label: t('nav_profile'),   hash: '#/profile', authOnly: true },
    { label: t('nav_settings'),  hash: '#/settings'  },
  ];

  const LANGUAGES = [
    { value: 'fr', emoji: '🇫🇷' },
    { value: 'en', emoji: '🇬🇧' },
  ];

  const handleLogout = async () => {
    await logout();
    window.location.hash = '#/login';
  };

  if (loading) return null;

  return (
    <nav style={{
      display:         'flex',
      alignItems:      'center',
      justifyContent:  'space-between',
      padding:         '0 28px',
      height:          '60px',
      borderBottom:    `3px solid var(--border-primary)`,
      background:      'var(--bg-card)',
      position:        'sticky',
      top:             0,
      zIndex:          100,
      gap:             '16px',
      transition:      'background 0.25s, border-color 0.25s',
    }}>

      {/* ── Logo ───────────────────────────────────────────── */}
      <a href="#/" style={{ display: 'flex', alignItems: 'baseline', gap: '10px', textDecoration: 'none', flexShrink: 0 }}>
        <span style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '1.7rem', fontWeight: 900, color: 'var(--text-primary)', letterSpacing: '-0.04em' }}>
          SCRABBLE
        </span>
        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.65rem', color: 'var(--text-muted)', letterSpacing: '0.15em' }}>
          1972
        </span>
      </a>

      {/* ── Nav links ──────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: '4px', flex: 1, justifyContent: 'center' }}>
        {NAV_LINKS.filter(l => !l.authOnly || isAuthenticated).map(link => (
          <a
            key={link.hash}
            href={link.hash}
            style={{
              fontFamily:     "'DM Mono', monospace",
              fontSize:       '0.78rem',
              fontWeight:     500,
              letterSpacing:  '0.08em',
              textTransform:  'uppercase',
              color:          currentHash === link.hash ? 'var(--text-primary)' : 'var(--text-muted)',
              textDecoration: 'none',
              padding:        '7px 14px',
              borderRadius:   '2px',
              background:     currentHash === link.hash ? 'var(--bg-page-alt)' : 'transparent',
              transition:     'background 0.1s, color 0.1s',
            }}
          >
            {link.label}
          </a>
        ))}
      </div>

      {/* ── Right zone ─────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>

        {/* ── Sélecteur de langue ────────────────────────── */}
        <div style={{ display: 'flex', gap: '4px' }}>
          {LANGUAGES.map(l => (
            <button
              key={l.value}
              onClick={() => setLanguage(l.value)}
              title={l.value === 'fr' ? 'Français' : 'English'}
              style={{
                fontSize:        '1rem',
                lineHeight:      1,
                padding:         '4px 6px',
                borderRadius:    '2px',
                border:          `1.5px solid ${language === l.value ? 'var(--border-primary)' : 'var(--border-muted)'}`,
                background:      language === l.value ? 'var(--bg-page-alt)' : 'transparent',
                cursor:          'pointer',
                opacity:         language === l.value ? 1 : 0.5,
                transition:      'opacity 0.15s, border-color 0.15s',
              }}
            >
              {l.emoji}
            </button>
          ))}
        </div>

        {/* ── Theme toggle ───────────────────────────────── */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setShowThemeMenu(v => !v)}
            title={`${t('section_appearence')} : ${ThemeLabels[preference]}`}
            style={{
              display:      'flex',
              alignItems:   'center',
              gap:          '6px',
              background:   'var(--bg-page-alt)',
              border:       `1.5px solid var(--border-muted)`,
              borderRadius: '2px',
              padding:      '5px 10px',
              cursor:       'pointer',
              fontFamily:   "'DM Mono', monospace",
              fontSize:     '0.68rem',
              color:        'var(--text-muted)',
              letterSpacing:'0.06em',
              transition:   'background 0.15s, border-color 0.15s',
            }}
          >
            <span style={{ fontSize: '0.9rem', lineHeight: 1 }}>{ThemeIcons[preference]}</span>
            <span>{ThemeLabels[preference]}</span>
          </button>

          {/* Dropdown thème */}
          {showThemeMenu && (
            <>
              <div
                style={{ position: 'fixed', inset: 0, zIndex: 98 }}
                onClick={() => setShowThemeMenu(false)}
              />
              <div style={{
                position:     'absolute',
                top:          'calc(100% + 8px)',
                right:        0,
                background:   'var(--bg-card)',
                border:       `2px solid var(--border-primary)`,
                borderRadius: '2px',
                boxShadow:    `4px 4px 0 var(--shadow-card)`,
                zIndex:       99,
                minWidth:     '160px',
                overflow:     'hidden',
              }}>
                {/* Header dropdown */}
                <div style={{
                  background:    'var(--bg-invert)',
                  color:         'var(--text-invert)',
                  padding:       '8px 14px',
                  fontFamily:    "'DM Mono', monospace",
                  fontSize:      '0.62rem',
                  letterSpacing: '0.15em',
                  textTransform: 'uppercase',
                }}>
                  {t('nav_appearance')}
                </div>

                {THEMES.map(theme => (
                  <button
                    key={theme}
                    onClick={() => { setTheme(theme); setShowThemeMenu(false); }}
                    style={{
                      display:    'flex',
                      alignItems: 'center',
                      gap:        '10px',
                      width:      '100%',
                      padding:    '10px 14px',
                      background: preference === theme ? 'var(--bg-page-alt)' : 'transparent',
                      border:     'none',
                      borderTop:  `1px solid var(--border-muted)`,
                      color:      preference === theme ? 'var(--text-primary)' : 'var(--text-muted)',
                      fontFamily: "'DM Mono', monospace",
                      fontSize:   '0.72rem',
                      letterSpacing: '0.08em',
                      cursor:     'pointer',
                      textAlign:  'left',
                      transition: 'background 0.1s',
                    }}
                  >
                    <span style={{ fontSize: '1rem', lineHeight: 1, width: '20px' }}>{ThemeIcons[theme]}</span>
                    <div>
                      <div style={{ fontWeight: preference === theme ? 600 : 400 }}>
                        {ThemeLabels[theme]}
                      </div>
                      {theme === 'system' && (
                        <div style={{ fontSize: '0.58rem', color: 'var(--text-muted)', marginTop: '1px' }}>
                          {t('nav_system')} : {resolvedTheme === 'dark' ? t('theme_dark').toLowerCase() : t('theme_light').toLowerCase()}
                        </div>
                      )}
                    </div>
                    {preference === theme && (
                      <span style={{ marginLeft: 'auto', color: 'var(--gold)', fontSize: '0.8rem' }}>✓</span>
                    )}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* ── Auth zone ──────────────────────────────────── */}
        {isAuthenticated ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {/* Avatar */}
            <div style={{
              width: '36px', height: '36px', borderRadius: '50%',
              border: `2px solid var(--gold)`, overflow: 'hidden',
              background: 'var(--bg-page-alt)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              {user?.avatar_url ? (
                <img src={user.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <span style={{ fontFamily: "'Playfair Display', serif", fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {user?.display_name?.[0]?.toUpperCase() ?? '?'}
                </span>
              )}
            </div>

            <span style={{
              fontFamily: "'Playfair Display', serif", fontSize: '1rem', fontWeight: 700,
              color: 'var(--text-primary)', maxWidth: '140px',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {user?.display_name}
            </span>

            <button
              onClick={handleLogout}
              style={{
                fontFamily:    "'DM Mono', monospace",
                fontSize:      '0.72rem',
                fontWeight:    500,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color:         'var(--brick)',
                background:    'transparent',
                border:        `1.5px solid var(--brick)`,
                borderRadius:  '2px',
                padding:       '6px 12px',
                cursor:        'pointer',
                transition:    'background 0.12s, color 0.12s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--brick)'; e.currentTarget.style.color = 'var(--bg-page)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--brick)'; }}
            >
              {t('nav_logout')}
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <a href="#/login" style={{
              fontFamily:     "'DM Mono', monospace",
              fontSize:       '0.75rem',
              fontWeight:     500,
              letterSpacing:  '0.08em',
              textTransform:  'uppercase',
              color:          'var(--text-muted)',
              textDecoration: 'none',
              padding:        '6px 12px',
            }}>
              {t('nav_login')}
            </a>
            <a href="#/register" style={{
              fontFamily:     "'DM Mono', monospace",
              fontSize:       '0.75rem',
              fontWeight:     500,
              letterSpacing:  '0.08em',
              textTransform:  'uppercase',
              color:          'var(--text-invert)',
              background:     'var(--olive)',
              border:         `2px solid var(--olive-dk)`,
              borderRadius:   '2px',
              padding:        '6px 14px',
              textDecoration: 'none',
              boxShadow:      `2px 2px 0 var(--olive-dk)`,
            }}>
              {t('nav_register')}
            </a>
          </div>
        )}
      </div>
    </nav>
  );
}