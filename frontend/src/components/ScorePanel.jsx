// src/components/ScorePanel.jsx
import React from 'react';
import PropTypes from 'prop-types';

const ScorePanel = ({ players, currentPlayerId, localUserId = null }) => {
  if (!players || players.length === 0) {
    return (
      <div style={{ padding: '1.2rem', border: '2px solid var(--tobacco)', borderRadius: '2px', color: 'var(--text-muted)', textAlign: 'center', fontFamily: "'Libre Baskerville', serif", fontStyle: 'italic', fontSize: '1rem' }}>
        Aucun joueur n'a démarré.
      </div>
    );
  }

  return (
    <div style={{ background: 'var(--bg-card)', border: '2px solid var(--border-primary)', borderRadius: '2px', overflow: 'hidden', boxShadow: '4px 4px 0 var(--shadow-card)', transition: 'background 0.25s, border-color 0.25s' }}>
      {/* Header */}
      <div style={{ background: 'var(--bg-invert)', color: 'var(--text-invert)', padding: '10px 18px', display: 'flex', alignItems: 'baseline', gap: '12px' }}>
        <span style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '1.1rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
          Scores
        </span>
        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.7rem', color: 'var(--gold)', letterSpacing: '0.1em' }}>
          EN COURS
        </span>
      </div>

      {/* Players */}
      <div style={{ padding: '10px' }}>
        {players.map((player, idx) => {
          const isActive = player.id === currentPlayerId;
          const isLocal  = localUserId && player.userId === localUserId;

          return (
            <div key={player.id} style={{
              display: 'flex',
              alignItems: 'center',
              padding: '12px 14px',
              marginBottom: idx < players.length - 1 ? '6px' : 0,
              background: isActive ? 'var(--bg-invert)' : 'var(--bg-card-alt)',
              borderRadius: '2px',
              border: `2px solid ${isActive ? 'var(--gold)' : 'transparent'}`,
              transition: 'all 0.2s',
              boxShadow: isActive ? '3px 3px 0 var(--tobacco)' : 'none',
            }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: isActive ? 'var(--gold)' : 'var(--text-muted)', marginRight: '12px', flexShrink: 0, boxShadow: isActive ? '0 0 8px var(--gold)' : 'none' }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '1rem', fontWeight: isActive ? 700 : 400, color: isActive ? 'var(--text-invert)' : 'var(--text-secondary)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {player.name}
                </span>
                {isLocal && (
                  <span style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.65rem', color: 'var(--tobacco)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>vous</span>
                )}
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: '1.6rem', fontWeight: 500, color: isActive ? 'var(--gold)' : 'var(--text-muted)', letterSpacing: '-0.02em' }}>
                  {player.score}
                </span>
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.65rem', color: isActive ? 'var(--border-gold-dk)' : 'var(--text-muted)', display: 'block', textAlign: 'right', letterSpacing: '0.05em' }}>
                  pts
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ borderTop: '1px solid var(--border-gold)', padding: '8px 14px', fontFamily: "'DM Mono', monospace", fontSize: '0.68rem', color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', textAlign: 'center' }}>
        ● joueur actif
      </div>
    </div>
  );
};

ScorePanel.propTypes = {
  players: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.number, PropTypes.string]).isRequired,
    name: PropTypes.string.isRequired,
    score: PropTypes.number.isRequired,
    rack: PropTypes.array.isRequired,
  })).isRequired,
  currentPlayerId: PropTypes.oneOfType([PropTypes.number, PropTypes.string]).isRequired,
  localUserId: PropTypes.string,
};

export default ScorePanel;