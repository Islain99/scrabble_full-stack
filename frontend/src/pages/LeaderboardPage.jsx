// src/pages/LeaderboardPage.jsx
import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { getLeaderboard } from '../api/authService';

const PERIODS  = [{ v: 'all', l: 'Tout temps' }, { v: 'month', l: 'Ce mois' }, { v: 'week', l: 'Cette semaine' }];
const SORTS    = [
  { v: 'best_score',    l: 'Meilleur score' },
  { v: 'average_score', l: 'Score moyen' },
  { v: 'games_won',     l: 'Victoires' },
  { v: 'games_played',  l: 'Parties jouées' },
];

export default function LeaderboardPage() {
  const { token, user } = useAuth();
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('all');
  const [sortBy, setSortBy] = useState('best_score');

  useEffect(() => {
    setLoading(true);
    getLeaderboard(token, { period, sortBy })
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [period, sortBy, token]);

  return (
    <div style={styles.page}>
      <div style={styles.container}>

        {/* Header */}
        <div style={styles.header}>
          <h1 style={styles.title}>Classement</h1>
          {data && (
            <p style={styles.subtitle}>{data.total_players} joueurs inscrits</p>
          )}
        </div>

        {/* Filtres */}
        <div style={styles.filters}>
          <FilterGroup label="Période" options={PERIODS} value={period} onChange={setPeriod} />
          <FilterGroup label="Trier par" options={SORTS} value={sortBy} onChange={setSortBy} />
        </div>

        {/* Rang de l'utilisateur connecté */}
        {data?.current_user_rank && (
          <div style={styles.myRankBanner}>
            <span style={styles.myRankLabel}>Votre rang</span>
            <span style={styles.myRankValue}>#{data.current_user_rank}</span>
          </div>
        )}

        {/* Tableau */}
        {loading ? (
          <div style={styles.loadingBox}>
            <div style={styles.spinner} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        ) : (
          <div style={styles.table}>
            {/* Colonnes header */}
            <div style={styles.tableHead}>
              <span style={{ width: '3rem', textAlign: 'center' }}>#</span>
              <span style={{ flex: 1 }}>Joueur</span>
              <span style={styles.col}>Parties</span>
              <span style={styles.col}>Victoires</span>
              <span style={styles.col}>V%</span>
              <span style={styles.col}>Meilleur</span>
              <span style={styles.col}>Moyen</span>
            </div>

            {data?.entries?.length === 0 && (
              <p style={{ ...styles.muted, padding: '2rem', textAlign: 'center' }}>
                Aucun joueur pour cette période.
              </p>
            )}

            {data?.entries?.map((entry) => {
              const isMe = user && entry.user_id === user.id;
              return (
                <div key={entry.user_id} style={{
                  ...styles.tableRow,
                  ...(isMe ? styles.tableRowMe : {}),
                  ...(entry.rank <= 3 ? styles.tableRowTop : {}),
                }}>
                  {/* Rang */}
                  <div style={{ width: '3rem', textAlign: 'center' }}>
                    {entry.rank <= 3 ? (
                      <span style={styles.medal(entry.rank)}>
                        {['🥇', '🥈', '🥉'][entry.rank - 1]}
                      </span>
                    ) : (
                      <span style={styles.rankNum}>{entry.rank}</span>
                    )}
                  </div>

                  {/* Joueur */}
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                    <div style={styles.miniAvatar}>
                      {entry.avatar_url ? (
                        <img src={entry.avatar_url} alt="" style={styles.miniAvatarImg} />
                      ) : (
                        <span style={styles.miniAvatarInitial}>
                          {entry.display_name[0].toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={styles.playerName(isMe)}>
                        {entry.display_name}{isMe && <span style={styles.meBadge}>Vous</span>}
                      </div>
                      {entry.best_word && (
                        <div style={styles.bestWord}>🏆 {entry.best_word} ({entry.best_word_score}pts)</div>
                      )}
                    </div>
                  </div>

                  {/* Stats */}
                  <Stat value={entry.games_played} isMe={isMe} />
                  <Stat value={entry.games_won} isMe={isMe} />
                  <Stat value={`${entry.win_rate}%`} isMe={isMe} />
                  <Stat value={entry.best_score} highlight isMe={isMe} />
                  <Stat value={Math.round(entry.average_score)} isMe={isMe} />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

const Stat = ({ value, highlight = false, isMe }) => (
  <div style={styles.col}>
    <span style={{
      fontFamily: "'DM Mono', monospace",
      fontSize: highlight ? '0.9rem' : '0.78rem',
      fontWeight: highlight ? 500 : 400,
      color: isMe ? '#C8A830' : (highlight ? '#1E1A12' : '#8A7E65'),
    }}>
      {value}
    </span>
  </div>
);

const FilterGroup = ({ label, options, value, onChange }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
    <span style={styles.filterLabel}>{label}</span>
    <div style={styles.filterBtns}>
      {options.map(o => (
        <button key={o.v} onClick={() => onChange(o.v)} style={{
          ...styles.filterBtn,
          ...(value === o.v ? styles.filterBtnActive : {}),
        }}>
          {o.l}
        </button>
      ))}
    </div>
  </div>
);

const styles = {
  page: { minHeight: '100vh', background: '#F5EDD6', padding: '2rem 1rem' },
  container: { maxWidth: '900px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' },
  header: { borderBottom: '3px solid #1E1A12', paddingBottom: '12px' },
  title: {
    fontFamily: "'Playfair Display', serif", fontSize: '2.2rem', fontWeight: 900,
    color: '#1E1A12', margin: 0, letterSpacing: '-0.04em',
  },
  subtitle: {
    fontFamily: "'DM Mono', monospace", fontSize: '0.62rem',
    color: '#8A7E65', letterSpacing: '0.1em', margin: '4px 0 0',
  },
  filters: { display: 'flex', gap: '24px', flexWrap: 'wrap' },
  filterLabel: {
    fontFamily: "'DM Mono', monospace", fontSize: '0.58rem',
    color: '#8A7E65', letterSpacing: '0.12em', textTransform: 'uppercase',
  },
  filterBtns: { display: 'flex', gap: '4px', flexWrap: 'wrap' },
  filterBtn: {
    fontFamily: "'DM Mono', monospace", fontSize: '0.62rem', fontWeight: 500,
    letterSpacing: '0.08em', textTransform: 'uppercase',
    background: 'transparent', border: '1.5px solid #C8C0A8', borderRadius: '2px',
    padding: '5px 10px', color: '#8A7E65', cursor: 'pointer',
  },
  filterBtnActive: {
    background: '#1E1A12', borderColor: '#1E1A12', color: '#C8A830',
    boxShadow: '2px 2px 0 #8A6820',
  },
  myRankBanner: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    background: '#1E1A12', border: '2px solid #C8A830', borderRadius: '2px',
    padding: '12px 20px', boxShadow: '4px 4px 0 #8A6820',
  },
  myRankLabel: {
    fontFamily: "'DM Mono', monospace", fontSize: '0.65rem',
    color: '#8A7E65', letterSpacing: '0.12em', textTransform: 'uppercase',
  },
  myRankValue: {
    fontFamily: "'Playfair Display', serif", fontSize: '1.8rem',
    fontWeight: 700, color: '#C8A830',
  },
  loadingBox: { display: 'flex', justifyContent: 'center', padding: '3rem' },
  spinner: {
    width: '36px', height: '36px',
    border: '3px solid #C8A830', borderTopColor: '#1E1A12',
    borderRadius: '50%', animation: 'spin 0.8s linear infinite',
  },
  table: {
    background: '#F5EDD6', border: '2px solid #1E1A12',
    borderRadius: '2px', overflow: 'hidden', boxShadow: '5px 5px 0 #C8803A',
  },
  tableHead: {
    display: 'flex', alignItems: 'center', gap: '8px',
    background: '#1E1A12', padding: '10px 14px',
    fontFamily: "'DM Mono', monospace", fontSize: '0.58rem',
    color: '#C8A830', letterSpacing: '0.12em', textTransform: 'uppercase',
  },
  tableRow: {
    display: 'flex', alignItems: 'center', gap: '8px',
    padding: '12px 14px', borderBottom: '1px solid rgba(200,168,48,0.2)',
    background: '#F5EDD6', transition: 'background 0.1s',
  },
  tableRowMe: { background: '#1E1A12' },
  tableRowTop: { background: '#F5EDD6' },
  col: { width: '80px', textAlign: 'right', flexShrink: 0 },
  medal: (rank) => ({ fontSize: '1.2rem' }),
  rankNum: {
    fontFamily: "'DM Mono', monospace", fontSize: '0.75rem',
    color: '#8A7E65', fontWeight: 500,
  },
  miniAvatar: {
    width: '32px', height: '32px', borderRadius: '50%',
    border: '2px solid #C8A830', background: '#EDE0C0',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0, overflow: 'hidden',
  },
  miniAvatarImg: { width: '100%', height: '100%', objectFit: 'cover' },
  miniAvatarInitial: {
    fontFamily: "'Playfair Display', serif", fontSize: '0.9rem', fontWeight: 700, color: '#1E1A12',
  },
  playerName: (isMe) => ({
    fontFamily: "'Playfair Display', serif", fontSize: '0.95rem', fontWeight: 700,
    color: isMe ? '#C8A830' : '#1E1A12',
    display: 'flex', alignItems: 'center', gap: '8px',
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  }),
  meBadge: {
    fontFamily: "'DM Mono', monospace", fontSize: '0.5rem', fontWeight: 500,
    letterSpacing: '0.1em', color: '#C8803A',
    background: 'rgba(200,128,58,0.15)', border: '1px solid #C8803A',
    borderRadius: '2px', padding: '1px 5px',
  },
  bestWord: {
    fontFamily: "'DM Mono', monospace", fontSize: '0.56rem', color: '#8A9B56',
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  muted: { fontFamily: "'DM Mono', monospace", fontSize: '0.68rem', color: '#8A7E65' },
};