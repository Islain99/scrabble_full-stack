// src/pages/LeaderboardPage.jsx
import React, { useState, useEffect } from 'react';
import { useAuth }        from '../context/AuthContext';
import { useLanguage }    from '../context/LanguageContext';
import { getLeaderboard } from '../api/authService';
import { useIsMobile }    from '../hooks/useViewport';
import { Card, PageHeader, MonoLabel, Spinner, Badge } from '../components/ui';

// ── Sous-composants ───────────────────────────────────────────────

const FilterGroup = ({ label, options, value, onChange }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
    <MonoLabel size="xs" style={{ fontSize: '0.58rem' }}>{label}</MonoLabel>
    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
      {options.map(o => (
        <button
          key={o.v}
          onClick={() => onChange(o.v)}
          className="s-chip"
          data-active={value === o.v}
        >
          {o.l}
        </button>
      ))}
    </div>
  </div>
);

const Stat = ({ value, highlight = false, isMe }) => (
  <div style={{ width: '80px', textAlign: 'right', flexShrink: 0 }}>
    <span style={{
      fontFamily: "'DM Mono', monospace",
      fontSize:   highlight ? '0.9rem' : '0.78rem',
      fontWeight: highlight ? 500 : 400,
      color:      isMe
        ? 'var(--gold)'
        : highlight
          ? 'var(--text-primary)'
          : 'var(--text-muted)',
    }}>
      {value}
    </span>
  </div>
);

// ── Ligne téléphone (portrait) ────────────────────────────────────
// Sur un écran étroit, 5 colonnes de chiffres ne laissaient plus de place au
// nom. Chaque joueur tient sur deux lignes : rang, nom et la valeur triée en
// grand, puis les cinq statistiques avec leur libellé.

const MobileRow = ({ entry, isMe, sortBy, columns, t }) => {
  const stats = columns.map(c => ({ k: c.k, l: c.l, v: c.v(entry) }));
  const main = stats.find(s => s.k === sortBy) ?? stats.find(s => s.k === 'best_score') ?? stats[0];
  const ink   = isMe ? 'var(--gold)' : 'var(--text-primary)';
  const quiet = isMe ? 'var(--text-invert-muted)' : 'var(--text-muted)';

  return (
    <div className="lb-mrow" data-me={isMe || undefined}>
      <div className="lb-mrow-top">
        <div className="lb-mrow-rank">
          {entry.rank <= 3
            ? <span style={{ fontSize: '1.25rem' }}>{['🥇','🥈','🥉'][entry.rank - 1]}</span>
            : <span style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.85rem', color: quiet }}>{entry.rank}</span>}
        </div>
        <div className="lb-mrow-avatar">
          {entry.avatar_url
            ? <img src={entry.avatar_url} alt="" />
            : <span style={{ color: ink }}>{entry.display_name[0].toUpperCase()}</span>}
        </div>
        <div className="lb-mrow-name">
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
            <span className="lb-mrow-name-text" style={{ color: ink }}>{entry.display_name}</span>
            {isMe && <Badge variant="gold">{t('lb_you')}</Badge>}
          </div>
          {entry.best_word && (
            <span className="lb-mrow-word" style={{ color: quiet }}>
              🏆 {entry.best_word} ({entry.best_word_score} pts)
            </span>
          )}
        </div>
        <div className="lb-mrow-main">
          <span className="lb-mrow-main-value">{main.v}</span>
          <span className="lb-mrow-main-label" style={{ color: quiet }}>{main.l}</span>
        </div>
      </div>
      <div className="lb-mrow-stats">
        {stats.map(st => (
          <div key={st.k} className="lb-mrow-stat" data-main={st.k === main.k || undefined}>
            <span className="lb-mrow-stat-label" style={{ color: quiet }}>{st.l}</span>
            <span className="lb-mrow-stat-value" style={{ color: st.k === main.k ? 'var(--gold)' : ink }}>{st.v}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ── Page ──────────────────────────────────────────────────────────

export default function LeaderboardPage() {
  const { user }            = useAuth();
  const { t }               = useLanguage();
  const isMobile            = useIsMobile();
  // Résultat de la dernière requête, étiqueté par ses filtres : on charge
  // tant que le résultat affiché ne correspond pas aux filtres courants.
  const [result, setResult] = useState(null);   // { key, data }
  const [mode,   setMode]   = useState('solo');  // solo (contre l'IA) | multi (contre des joueurs)
  const [period, setPeriod] = useState('all');
  // Tri mémorisé par mode : la cote Elo n'existe qu'en multijoueur
  const [sorts, setSorts]   = useState({ solo: 'best_score', multi: 'rating' });
  const sortBy    = sorts[mode];
  const setSortBy = (v) => setSorts(prev => ({ ...prev, [mode]: v }));

  // Options traduites — déclarées dans le composant pour réactivité
  const PERIODS = [
    { v: 'all',   l: t('lb_period_all')   },
    { v: 'month', l: t('lb_period_month') },
    { v: 'week',  l: t('lb_period_week')  },
  ];
  const MODES = [
    { v: 'solo',  l: t('lb_mode_solo')  },
    { v: 'multi', l: t('lb_mode_multi') },
  ];
  const SORTS = mode === 'multi' ? [
    { v: 'rating',        l: t('lb_sort_rating')  },
    { v: 'games_won',     l: t('lb_sort_wins')    },
    { v: 'games_played',  l: t('lb_sort_played')  },
    { v: 'best_score',    l: t('lb_sort_best')    },
  ] : [
    { v: 'best_score',    l: t('lb_sort_best')    },
    { v: 'average_score', l: t('lb_sort_avg')     },
    { v: 'games_won',     l: t('lb_sort_wins')    },
    { v: 'games_played',  l: t('lb_sort_played')  },
  ];
  // Colonnes du tableau : k = clé de tri correspondante, v = valeur affichée
  const COLUMNS = mode === 'multi' ? [
    { k: 'rating',        l: t('lb_col_rating'),  v: e => e.rating ?? 1200 },
    { k: 'games_played',  l: t('lb_col_played'),  v: e => e.games_played },
    { k: 'games_won',     l: t('lb_col_wins'),    v: e => e.games_won },
    { k: 'win_rate',      l: t('lb_col_winrate'), v: e => `${e.win_rate}%` },
    { k: 'best_score',    l: t('lb_col_best'),    v: e => e.best_score },
  ] : [
    { k: 'games_played',  l: t('lb_col_played'),  v: e => e.games_played },
    { k: 'games_won',     l: t('lb_col_wins'),    v: e => e.games_won },
    { k: 'win_rate',      l: t('lb_col_winrate'), v: e => `${e.win_rate}%` },
    { k: 'best_score',    l: t('lb_col_best'),    v: e => e.best_score },
    { k: 'average_score', l: t('lb_col_avg'),     v: e => Math.round(e.average_score) },
  ];
  const highlightKey = mode === 'multi' ? 'rating' : 'best_score';

  const queryKey = `${mode}|${period}|${sortBy}`;
  const loading  = result?.key !== queryKey;
  const data     = result?.data ?? null;

  useEffect(() => {
    let cancelled = false;   // ignore une réponse arrivée après un changement de filtre
    const key = `${mode}|${period}|${sortBy}`;
    getLeaderboard({ mode, period, sortBy })
      .then(d => { if (!cancelled) setResult({ key, data: d }); })
      .catch(err => {
        console.error(err);
        if (!cancelled) setResult({ key, data: null });
      });
    return () => { cancelled = true; };
  }, [mode, period, sortBy]);

  return (
    <div className="s-page">
      <div style={{ maxWidth: '900px', margin: '0 auto' }}>

        <PageHeader
          title={t('lb_title')}
          subtitle={data
            ? `${data.total_players} ${t('lb_subtitle_players')}`
            : ' '}
        />

        {/* Solo / multijoueur (lot 7 : classements séparés) */}
        <div className="lb-modes" role="tablist" aria-label={t('lb_mode_label')}>
          {MODES.map(m => (
            <button key={m.v} type="button" role="tab" aria-selected={mode === m.v}
              className="lb-mode" data-active={mode === m.v || undefined} onClick={() => setMode(m.v)}>
              {m.l}
            </button>
          ))}
        </div>
        {mode === 'multi' && <p className="lb-mode-hint">{t('lb_multi_hint')}</p>}

        {/* Filtres */}
        <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', marginBottom: '20px' }}>
          <FilterGroup label={t('lb_filter_period')} options={PERIODS} value={period} onChange={setPeriod} />
          <FilterGroup label={t('lb_filter_sort')}   options={SORTS}   value={sortBy} onChange={setSortBy} />
        </div>

        {/* Rang de l'utilisateur connecté */}
        {data?.current_user_rank && (
          <Card style={{
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'space-between',
            background:     'var(--bg-invert)',
            padding:        '12px 20px',
            marginBottom:   '20px',
          }}>
            <MonoLabel color="var(--text-invert-muted)">{t('lb_your_rank')}</MonoLabel>
            <span style={{
              fontFamily: "'Playfair Display', serif",
              fontSize:   '1.8rem',
              fontWeight: 700,
              color:      'var(--gold)',
            }}>
              #{data.current_user_rank}
            </span>
          </Card>
        )}

        {/* Tableau */}
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
            <Spinner size={36} />
          </div>
        ) : isMobile ? (
          <Card style={{ overflow: 'hidden', padding: 0 }}>
            {data?.entries?.length === 0 && (
              <div style={{ padding: '2rem', textAlign: 'center' }}>
                <MonoLabel>{t('lb_empty')}</MonoLabel>
              </div>
            )}
            {data?.entries?.map((entry) => (
              <MobileRow
                key={entry.user_id}
                entry={entry}
                isMe={!!user && entry.user_id === user.id}
                sortBy={sortBy}
                columns={COLUMNS}
                t={t}
              />
            ))}
          </Card>
        ) : (
          <Card style={{ overflow: 'hidden' }}>

            {/* En-tête colonnes */}
            <div style={{
              display:     'flex',
              alignItems:  'center',
              gap:         '8px',
              background:  'var(--bg-invert)',
              padding:     '10px 14px',
            }}>
              <MonoLabel color="var(--gold)" style={{ width: '3rem', textAlign: 'center', fontSize: '0.58rem' }}>#</MonoLabel>
              <MonoLabel color="var(--gold)" style={{ flex: 1, fontSize: '0.58rem' }}>{t('lb_col_player')}</MonoLabel>
              {COLUMNS.map(c => (
                <MonoLabel key={c.k} color="var(--gold)" style={{ width: '80px', textAlign: 'right', fontSize: '0.58rem' }}>
                  {c.l}
                </MonoLabel>
              ))}
            </div>

            {/* Vide */}
            {data?.entries?.length === 0 && (
              <div style={{ padding: '2rem', textAlign: 'center' }}>
                <MonoLabel>{t('lb_empty')}</MonoLabel>
              </div>
            )}

            {/* Lignes */}
            {data?.entries?.map((entry) => {
              const isMe = user && entry.user_id === user.id;
              return (
                <div
                  key={entry.user_id}
                  style={{
                    display:     'flex',
                    alignItems:  'center',
                    gap:         '8px',
                    padding:     '12px 14px',
                    borderBottom:'1px solid rgba(200,168,48,0.15)',
                    background:  isMe ? 'var(--bg-invert)' : 'transparent',
                    transition:  'background 0.1s',
                  }}
                  onMouseEnter={e => { if (!isMe) e.currentTarget.style.background = 'var(--bg-page-alt)'; }}
                  onMouseLeave={e => { if (!isMe) e.currentTarget.style.background = 'transparent'; }}
                >
                  {/* Rang */}
                  <div style={{ width: '3rem', textAlign: 'center' }}>
                    {entry.rank <= 3
                      ? <span style={{ fontSize: '1.2rem' }}>{['🥇','🥈','🥉'][entry.rank - 1]}</span>
                      : <MonoLabel color="var(--text-muted)" style={{ fontSize: '0.75rem' }}>{entry.rank}</MonoLabel>
                    }
                  </div>

                  {/* Joueur */}
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                    {/* Mini avatar */}
                    <div style={{
                      width:          '32px',
                      height:         '32px',
                      borderRadius:   '50%',
                      border:         '2px solid var(--gold)',
                      background:     'var(--bg-page-alt)',
                      display:        'flex',
                      alignItems:     'center',
                      justifyContent: 'center',
                      flexShrink:     0,
                      overflow:       'hidden',
                    }}>
                      {entry.avatar_url
                        ? <img src={entry.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : <span style={{
                            fontFamily: "'Playfair Display', serif",
                            fontSize:   '0.9rem',
                            fontWeight: 700,
                            color:      isMe ? 'var(--gold)' : 'var(--text-primary)',
                          }}>
                            {entry.display_name[0].toUpperCase()}
                          </span>
                      }
                    </div>

                    {/* Nom + meilleur mot */}
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{
                          fontFamily:    "'Playfair Display', serif",
                          fontSize:      '0.95rem',
                          fontWeight:    700,
                          color:         isMe ? 'var(--gold)' : 'var(--text-primary)',
                          overflow:      'hidden',
                          textOverflow:  'ellipsis',
                          whiteSpace:    'nowrap',
                        }}>
                          {entry.display_name}
                        </span>
                        {isMe && <Badge variant="gold">{t('lb_you')}</Badge>}
                      </div>
                      {entry.best_word && (
                        <MonoLabel style={{ fontSize: '0.58rem' }}>
                          🏆 {entry.best_word} ({entry.best_word_score} pts)
                        </MonoLabel>
                      )}
                    </div>
                  </div>

                  {/* Stats */}
                  {COLUMNS.map(c => (
                    <Stat key={c.k} value={c.v(entry)} highlight={c.k === highlightKey} isMe={isMe} />
                  ))}
                </div>
              );
            })}
          </Card>
        )}
      </div>
    </div>
  );
}
