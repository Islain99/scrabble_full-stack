import React from 'react';
import PropTypes from 'prop-types';

const ScorePanel = ({ players, currentPlayerId, localUserId = null }) => {
  if (!players || players.length === 0) {
    return (
      <div style={{
        padding: '1rem',
        border: '2px solid #C8803A',
        borderRadius: '2px',
        color: '#8A7E65',
        textAlign: 'center',
        fontFamily: "'Libre Baskerville', serif",
        fontStyle: 'italic',
      }}>
        Aucun joueur n'a démarré.
      </div>
    );
  }

  return (
    <div style={{
      background: '#F5EDD6',
      border: '2px solid #1E1A12',
      borderRadius: '2px',
      overflow: 'hidden',
      boxShadow: '4px 4px 0 #C8803A',
    }}>
      {/* Header */}
      <div style={{
        background: '#1E1A12',
        color: '#F0D890',
        padding: '8px 16px',
        display: 'flex',
        alignItems: 'baseline',
        gap: '10px',
      }}>
        <span style={{
          fontFamily: "'Playfair Display', Georgia, serif",
          fontSize: '1rem',
          fontWeight: 700,
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
        }}>
          Scores
        </span>
        <span style={{
          fontFamily: "'DM Mono', monospace",
          fontSize: '0.6rem',
          color: '#C8A830',
          letterSpacing: '0.1em',
        }}>
          EN COURS
        </span>
      </div>

      {/* Players */}
      <div style={{ padding: '8px' }}>
        {players.map((player, idx) => {
          const isCurrentPlayer = player.id === currentPlayerId;
          const isLocalPlayer = localUserId && player.userId === localUserId;

          return (
            <div
              key={player.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '8px 10px',
                marginBottom: idx < players.length - 1 ? '4px' : 0,
                background: isCurrentPlayer ? '#1E1A12' : '#EDE0C0',
                borderRadius: '2px',
                border: isCurrentPlayer ? '2px solid #C8A830' : '2px solid transparent',
                transition: 'all 0.2s',
                boxShadow: isCurrentPlayer ? '3px 3px 0 #C8803A' : 'none',
              }}
            >
              {/* Turn indicator */}
              <div style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: isCurrentPlayer ? '#C8A830' : '#B0A080',
                marginRight: '10px',
                flexShrink: 0,
                boxShadow: isCurrentPlayer ? '0 0 6px #C8A830' : 'none',
              }} />

              {/* Name */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{
                  fontFamily: "'Playfair Display', Georgia, serif",
                  fontSize: '0.9rem',
                  fontWeight: isCurrentPlayer ? 700 : 400,
                  color: isCurrentPlayer ? '#F0D890' : '#3D3626',
                  display: 'block',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {player.name}
                </span>
                {isLocalPlayer && (
                  <span style={{
                    fontFamily: "'DM Mono', monospace",
                    fontSize: '0.55rem',
                    color: '#C8803A',
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                  }}>
                    vous
                  </span>
                )}
              </div>

              {/* Score */}
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <span style={{
                  fontFamily: "'DM Mono', monospace",
                  fontSize: '1.3rem',
                  fontWeight: 500,
                  color: isCurrentPlayer ? '#C8A830' : '#8A7E65',
                  letterSpacing: '-0.02em',
                }}>
                  {player.score}
                </span>
                <span style={{
                  fontFamily: "'DM Mono', monospace",
                  fontSize: '0.55rem',
                  color: isCurrentPlayer ? '#8A6820' : '#B0A080',
                  display: 'block',
                  textAlign: 'right',
                  letterSpacing: '0.05em',
                }}>
                  pts
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer note */}
      <div style={{
        borderTop: '1px solid #C8A830',
        padding: '6px 12px',
        fontFamily: "'DM Mono', monospace",
        fontSize: '0.6rem',
        color: '#8A7E65',
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        textAlign: 'center',
      }}>
        ● joueur actif
      </div>
    </div>
  );
};

ScorePanel.propTypes = {
  players: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.oneOfType([PropTypes.number, PropTypes.string]).isRequired,
      name: PropTypes.string.isRequired,
      score: PropTypes.number.isRequired,
      rack: PropTypes.array.isRequired,
      userId: PropTypes.string,
    })
  ).isRequired,
  currentPlayerId: PropTypes.oneOfType([PropTypes.number, PropTypes.string]).isRequired,
  localUserId: PropTypes.string,
};

export default ScorePanel;