import React from 'react';
import Tile from './Tile';

const BONUS_STYLES = {
  TM: { bg: '#8B2020', label: '3M', text: '#F5D0C0' },
  DM: { bg: '#C8803A', label: '2M', text: '#FFF0D8' },
  TL: { bg: '#1A4A8A', label: '3L', text: '#C8DCFF' },
  DL: { bg: '#3A7EB8', label: '2L', text: '#DCEEFF' },
  START: { bg: '#8B4A20', label: '★', text: '#FFE8C0' },
  DEFAULT: { bg: null, label: '', text: '' },
};

const getBonus = (r, c) => {
  if (r === 7 && c === 7) return 'START';
  if (([0, 7, 14].includes(r) && [0, 7, 14].includes(c)) && !(r === 7 && c === 7)) return 'TM';
  if (
    (r === c || r + c === 14) &&
    [1, 2, 3, 4, 10, 11, 12, 13].includes(r) &&
    r !== 7 && c !== 7
  ) return 'DM';
  if (
    ([1, 13].includes(r) && [5, 9].includes(c)) ||
    ([5, 9].includes(r) && [1, 5, 9, 13].includes(c))
  ) return 'TL';
  if (
    ([0, 14].includes(r) && [3, 11].includes(c)) ||
    ([2, 12].includes(r) && [6, 8].includes(c)) ||
    ([3, 11].includes(r) && [0, 7, 14].includes(c)) ||
    ([6, 8].includes(r) && [2, 6, 8, 12].includes(c)) ||
    (r === 7 && [3, 11].includes(c))
  ) return 'DL';
  return 'DEFAULT';
};

const Board = ({ gameState, placements, onDropTile, onTileClick }) => {
  if (!gameState) return (
    <div style={{
      fontFamily: "'Playfair Display', Georgia, serif",
      fontSize: '1.2rem',
      color: '#5E6B3A',
      padding: '2rem',
      textAlign: 'center',
    }}>
      Chargement du plateau...
    </div>
  );

  const grid = gameState.board.grid;

  const handleDragOver = (e) => { e.preventDefault(); };

  const handleDrop = (e, r, c) => {
    e.preventDefault();
    const droppedData = e.dataTransfer.getData('application/json');
    let tileInfo;
    try { tileInfo = JSON.parse(droppedData); } catch { return; }
    const tileRackId = tileInfo?.id;
    if (grid[r][c] === null && tileRackId !== undefined) {
      onDropTile(tileRackId, r, c);
    }
  };

  const tempGrid = grid.map(row => [...row]);
  const temporaryTiles = {};
  placements.forEach(p => {
    tempGrid[p.r][p.c] = p.originalTile;
    temporaryTiles[`${p.r}-${p.c}`] = p.originalTile;
  });

//   const cellSize = 'calc((min(92vw, 680px) - 24px) / 15)';

  return (
    <div style={{
      background: 'linear-gradient(135deg, #1A3A18 0%, #2D5A27 40%, #1E4A1C 100%)',
      borderRadius: '4px',
      padding: '12px',
      boxShadow: '6px 6px 0 #0A1A09, inset 0 0 40px rgba(0,0,0,0.3)',
      border: '3px solid #8A6820',
      position: 'relative',
    }}>
      {/* Corner decorations */}
      {['0 0', '0 100%', '100% 0', '100% 100%'].map((pos, i) => (
        <div key={i} style={{
          position: 'absolute',
          width: '16px', height: '16px',
          background: '#C8A830',
          borderRadius: '50%',
          top: pos.split(' ')[1] === '0' ? '4px' : 'auto',
          bottom: pos.split(' ')[1] === '100%' ? '4px' : 'auto',
          left: pos.split(' ')[0] === '0' ? '4px' : 'auto',
          right: pos.split(' ')[0] === '100%' ? '4px' : 'auto',
          boxShadow: '2px 2px 0 #8A6820',
          zIndex: 2,
        }} />
      ))}

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(15, 1fr)',
        gap: '1px',
        backgroundColor: '#1A3A18',
      }}>
        {tempGrid.map((row, r) =>
          row.map((tile, c) => {
            const bonusKey = getBonus(r, c);
            const bonus = BONUS_STYLES[bonusKey];
            const isTempPlaced = !!temporaryTiles[`${r}-${c}`];

            const cellBg = tile
              ? 'transparent'
              : bonus.bg
              ? bonus.bg
              : 'rgba(45, 90, 39, 0.6)';

            return (
              <div
                key={`${r}-${c}`}
                style={{
                  aspectRatio: '1',
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  backgroundColor: cellBg,
                  borderRadius: '1px',
                  transition: 'background 0.1s',
                  position: 'relative',
                  overflow: 'hidden',
                }}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, r, c)}
              >
                {tile ? (
                  <Tile
                    letter={tile.letter}
                    score={tile.score}
                    isDraggable={false}
                    isTempPlaced={isTempPlaced}
                    id={`board-${r}-${c}`}
                    onClick={isTempPlaced ? () => onTileClick(r, c) : null}
                  />
                ) : (
                  bonus.label && (
                    <span style={{
                      fontSize: 'clamp(0.35rem, 1vw, 0.55rem)',
                      fontWeight: 700,
                      color: bonus.text,
                      fontFamily: "'DM Mono', monospace",
                      textAlign: 'center',
                      lineHeight: 1,
                      letterSpacing: '-0.02em',
                    }}>
                      {bonus.label}
                    </span>
                  )
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default Board;