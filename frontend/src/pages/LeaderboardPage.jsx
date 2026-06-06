// src/pages/LeaderboardPage.jsx
import React, { useState, useEffect } from 'react';
import { useAuth }        from '../context/AuthContext';
import { useLanguage }    from '../context/LanguageContext';
import { getLeaderboard } from '../api/authService';
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

// ── Page ──────────────────────────────────────────────────────────

export default function LeaderboardPage() {
  const { user }            = useAuth();
  const { t }               = useLanguage();
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('all');
  const [sortBy, setSortBy] = useState('best_score');

  // Options traduites — déclarées dans le composant pour réactivité
  const PERIODS = [
    { v: 'all',   l: t('lb_period_all')   },
    { v: 'month', l: t('lb_period_month') },
    { v: 'week',  l: t('lb_period_week')  },
  ];
  const SORTS = [
    { v: 'best_score',    l: t('lb_sort_best')    },
    { v: 'average_score', l: t('lb_sort_avg')     },
    { v: 'games_won',     l: t('lb_sort_wins')    },
    { v: 'games_played',  l: t('lb_sort_played')  },
  ];
  const COL_HEADERS = [
    t('lb_col_played'),
    t('lb_col_wins'),
    t('lb_col_winrate'),
    t('lb_col_best'),
    t('lb_col_avg'),
  ];

  useEffect(() => {
    setLoading(true);
    getLeaderboard({ period, sortBy })
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [period, sortBy]);

  return (
    <div className="s-page">
      <div style={{ maxWidth: '900px', margin: '0 auto' }}>

        <PageHeader
          title={t('lb_title')}
          subtitle={data
            ? `${data.total_players} ${t('lb_subtitle_players')}`
            : ' '}
        />

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
              {COL_HEADERS.map(h => (
                <MonoLabel key={h} color="var(--gold)" style={{ width: '80px', textAlign: 'right', fontSize: '0.58rem' }}>
                  {h}
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
                  <Stat value={entry.games_played}                isMe={isMe} />
                  <Stat value={entry.games_won}                   isMe={isMe} />
                  <Stat value={`${entry.win_rate}%`}              isMe={isMe} />
                  <Stat value={entry.best_score}    highlight      isMe={isMe} />
                  <Stat value={Math.round(entry.average_score)}   isMe={isMe} />
                </div>
              );
            })}
          </Card>
        )}
      </div>
    </div>
  );
}