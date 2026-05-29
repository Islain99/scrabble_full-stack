import React from 'react';
import PropTypes from 'prop-types';

const ScorePanel = ({ players, currentPlayerId, localUserId = null }) => {
  if (!players || players.length === 0) {
    return (
      <div style={{ padding: '1.2rem', border: '2px solid #C8803A', borderRadius: '2px', color: '#8A7E65', textAlign: 'center', fontFamily: "'Libre Baskerville', serif", fontStyle: 'italic', fontSize: '1rem' }}>
        Aucun joueur n'a démarré.
      </div>
    );
  }

  return (
    <div style={{ background: '#F5EDD6', border: '2px solid #1E1A12', borderRadius: '2px', overflow: 'hidden', boxShadow: '4px 4px 0 #C8803A' }}>
      {/* Header */}
      <div style={{ background: '#1E1A12', color: '#F0D890', padding: '10px 18px', display: 'flex', alignItems: 'baseline', gap: '12px' }}>
        <span style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '1.1rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
          Scores
        </span>
        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.7rem', color: '#C8A830', letterSpacing: '0.1em' }}>
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
              background: isActive ? '#1E1A12' : '#EDE0C0',
              borderRadius: '2px',
              border: isActive ? '2px solid #C8A830' : '2px solid transparent',
              transition: 'all 0.2s',
              boxShadow: isActive ? '3px 3px 0 #C8803A' : 'none',
            }}>
              {/* Dot indicateur */}
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: isActive ? '#C8A830' : '#B0A080', marginRight: '12px', flexShrink: 0, boxShadow: isActive ? '0 0 8px #C8A830' : 'none' }} />

              {/* Nom */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '1rem', fontWeight: isActive ? 700 : 400, color: isActive ? '#F0D890' : '#3D3626', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {player.name}
                </span>
                {isLocal && (
                  <span style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.65rem', color: '#C8803A', letterSpacing: '0.1em', textTransform: 'uppercase' }}>vous</span>
                )}
              </div>

              {/* Score */}
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: '1.6rem', fontWeight: 500, color: isActive ? '#C8A830' : '#8A7E65', letterSpacing: '-0.02em' }}>
                  {player.score}
                </span>
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.65rem', color: isActive ? '#8A6820' : '#B0A080', display: 'block', textAlign: 'right', letterSpacing: '0.05em' }}>
                  pts
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div style={{ borderTop: '1px solid #C8A830', padding: '8px 14px', fontFamily: "'DM Mono', monospace", fontSize: '0.68rem', color: '#8A7E65', letterSpacing: '0.08em', textTransform: 'uppercase', textAlign: 'center' }}>
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
    userId: PropTypes.string,
  })).isRequired,
  currentPlayerId: PropTypes.oneOfType([PropTypes.number, PropTypes.string]).isRequired,
  localUserId: PropTypes.string,
};

export default ScorePanel;