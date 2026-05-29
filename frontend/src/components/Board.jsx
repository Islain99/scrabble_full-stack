import React, { useState, useCallback } from 'react';

const BONUS_STYLES = {
  TM:      { bg: '#8B2020', label: '3M',  text: '#F5D0C0' },
  DM:      { bg: '#C8803A', label: '2M',  text: '#FFF0D8' },
  TL:      { bg: '#1A4A8A', label: '3L',  text: '#C8DCFF' },
  DL:      { bg: '#3A7EB8', label: '2L',  text: '#DCEEFF' },
  START:   { bg: '#8B4A20', label: '★',   text: '#FFE8C0' },
  DEFAULT: { bg: null,      label: '',    text: '' },
};

const getBonus = (r, c) => {
  if (r === 7 && c === 7) return 'START';
  if (([0, 7, 14].includes(r) && [0, 7, 14].includes(c)) && !(r === 7 && c === 7)) return 'TM';
  if ((r === c || r + c === 14) && [1,2,3,4,10,11,12,13].includes(r) && r !== 7 && c !== 7) return 'DM';
  if (([1, 13].includes(r) && [5, 9].includes(c)) || ([5, 9].includes(r) && [1, 5, 9, 13].includes(c))) return 'TL';
  if (
    ([0, 14].includes(r) && [3, 11].includes(c)) ||
    ([2, 12].includes(r) && [6, 8].includes(c)) ||
    ([3, 11].includes(r) && [0, 7, 14].includes(c)) ||
    ([6, 8].includes(r) && [2, 6, 8, 12].includes(c)) ||
    (r === 7 && [3, 11].includes(c))
  ) return 'DL';
  return 'DEFAULT';
};

const Board = ({ gameState, placements, onDropTile, onMoveTile, onReturnTile }) => {
  const [hoverCell, setHoverCell] = useState(null);
  const [dragSource, setDragSource] = useState(null);

  const grid = gameState?.board?.grid ?? null;
  const tempMap = {};
  if (grid && placements) {
    placements.forEach(p => { tempMap[`${p.r}-${p.c}`] = p; });
  }

  const handleDragOver = useCallback((e, r, c) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setHoverCell(`${r}-${c}`);
  }, []);

  const handleDragLeave = useCallback((e) => {
    if (!e.currentTarget.contains(e.relatedTarget)) setHoverCell(null);
  }, []);

  const handleDrop = useCallback((e, r, c) => {
    e.preventDefault();
    setHoverCell(null);
    setDragSource(null);
    if (!grid) return;
    if (grid[r][c] !== null) return;
    if (tempMap[`${r}-${c}`]) return;
    let info;
    try { info = JSON.parse(e.dataTransfer.getData('application/json')); } catch { return; }
    if (info.source === 'board') {
      onMoveTile(info.fromR, info.fromC, r, c);
    } else {
      if (info.rackIndex === undefined) return;
      onDropTile(info.rackIndex, r, c);
    }
  }, [grid, tempMap, onDropTile, onMoveTile]);

  const handleBoardDragEnd = useCallback(() => {
    setHoverCell(null);
    setDragSource(null);
  }, []);

  const handleBoardTileDragStart = useCallback((e, r, c) => {
    const placement = tempMap[`${r}-${c}`];
    if (!placement) return;
    e.dataTransfer.setData('application/json', JSON.stringify({ source: 'board', fromR: r, fromC: c, letter: placement.letter }));
    e.dataTransfer.effectAllowed = 'move';
    setDragSource({ type: 'board', fromR: r, fromC: c });
  }, [tempMap]);

  if (!gameState || !grid) return (
    <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '1.4rem', color: '#5E6B3A', padding: '3rem', textAlign: 'center' }}>
      Chargement du plateau...
    </div>
  );

  const tempGrid = grid.map(row => [...row]);
  placements.forEach(p => { tempGrid[p.r][p.c] = p.originalTile; });

  return (
    /* Le plateau prend TOUTE la largeur disponible de son conteneur.
       Les cases sont carrées via aspect-ratio sur le conteneur. */
    <div
      style={{
        width: '100%',
        aspectRatio: '1 / 1',
        background: 'linear-gradient(135deg, #1A3A18 0%, #2D5A27 40%, #1E4A1C 100%)',
        borderRadius: '6px',
        padding: '14px',
        boxShadow: '6px 6px 0 #0A1A09',
        border: '3px solid #8A6820',
        position: 'relative',
        userSelect: 'none',
        boxSizing: 'border-box',
      }}
      onDragEnd={handleBoardDragEnd}
    >
      {[{ top: '5px', left: '5px' }, { top: '5px', right: '5px' }, { bottom: '5px', left: '5px' }, { bottom: '5px', right: '5px' }].map((pos, i) => (
        <div key={i} style={{ position: 'absolute', width: '16px', height: '16px', background: '#C8A830', borderRadius: '50%', boxShadow: '2px 2px 0 #8A6820', zIndex: 2, ...pos }} />
      ))}

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(15, 1fr)',
        gridTemplateRows: 'repeat(15, 1fr)',
        gap: '1px',
        backgroundColor: '#1A3A18',
        width: '100%',
        height: '100%',
      }}>
        {tempGrid.map((row, r) =>
          row.map((tile, c) => {
            const bonusKey  = getBonus(r, c);
            const bonus     = BONUS_STYLES[bonusKey];
            const cellKey   = `${r}-${c}`;
            const isTemp    = !!tempMap[cellKey];
            const isPerm    = grid[r][c] !== null;
            const isHovered = hoverCell === cellKey;
            const isDraggingFrom = dragSource?.type === 'board' && dragSource.fromR === r && dragSource.fromC === c;

            let cellBg;
            if (tile)                      cellBg = 'transparent';
            else if (isHovered && !isPerm) cellBg = 'rgba(200,168,48,0.4)';
            else if (bonus.bg)             cellBg = bonus.bg;
            else                           cellBg = 'rgba(45,90,39,0.6)';

            return (
              <div
                key={cellKey}
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  backgroundColor: cellBg,
                  borderRadius: '1px',
                  transition: 'background 0.08s',
                  position: 'relative',
                  outline: isHovered && !isPerm && !isTemp ? '2px solid rgba(200,168,48,0.8)' : 'none',
                  outlineOffset: '-1px',
                  opacity: isDraggingFrom ? 0.35 : 1,
                  overflow: 'hidden',
                }}
                onDragOver={(e) => handleDragOver(e, r, c)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, r, c)}
              >
                {tile ? (
                  <TileBoardCell
                    tile={tile} isTemp={isTemp} r={r} c={c}
                    onReturnTile={onReturnTile}
                    onDragStart={handleBoardTileDragStart}
                  />
                ) : (
                  bonus.label && (
                    <span style={{
                      fontSize: 'clamp(0.4rem, 1.1vw, 0.65rem)',
                      fontWeight: 700,
                      color: bonus.text,
                      fontFamily: "'DM Mono', monospace",
                      textAlign: 'center',
                      lineHeight: 1,
                      letterSpacing: '-0.02em',
                      pointerEvents: 'none',
                      userSelect: 'none',
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

const TileBoardCell = ({ tile, isTemp, r, c, onReturnTile, onDragStart }) => {
  const [isOver, setIsOver] = useState(false);

  if (isTemp) {
    return (
      <div
        draggable
        onDragStart={(e) => onDragStart(e, r, c)}
        onClick={() => onReturnTile(r, c)}
        onMouseEnter={() => setIsOver(true)}
        onMouseLeave={() => setIsOver(false)}
        title="Cliquez pour récupérer — glissez pour déplacer"
        style={{
          width: '100%', height: '100%',
          display: 'flex', flexDirection: 'column',
          justifyContent: 'center', alignItems: 'center',
          position: 'relative',
          background: isOver ? '#B8D888' : '#D4E8A8',
          border: '2px solid #7AAA30',
          boxShadow: '2px 2px 0 #4A7A10',
          cursor: 'grab',
          borderRadius: '2px',
          transition: 'background 0.1s, transform 0.1s',
          transform: isOver ? 'scale(1.05)' : 'none',
        }}
      >
        <span style={{ fontSize: 'clamp(0.7rem, 1.8vw, 1.1rem)', fontWeight: 700, color: '#2A4A10', fontFamily: "'Playfair Display', Georgia, serif", lineHeight: 1, pointerEvents: 'none' }}>
          {tile.letter === '*' ? '★' : tile.letter}
        </span>
        {tile.score > 0 && (
          <span style={{ position: 'absolute', bottom: '2px', right: '3px', fontSize: 'clamp(0.35rem, 0.8vw, 0.5rem)', color: '#4A7A10', fontFamily: "'DM Mono', monospace", lineHeight: 1, pointerEvents: 'none' }}>
            {tile.score}
          </span>
        )}
        {isOver && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(42,74,16,0.15)', borderRadius: '2px', pointerEvents: 'none' }}>
            <span style={{ fontSize: 'clamp(0.5rem, 1.2vw, 0.8rem)', color: '#2A4A10' }}>↩</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{
      width: '100%', height: '100%',
      display: 'flex', flexDirection: 'column',
      justifyContent: 'center', alignItems: 'center',
      position: 'relative',
      background: tile.letter === '*' ? '#E8E0CC' : '#F0D890',
      border: `2px solid ${tile.letter === '*' ? '#B0A080' : '#C8A830'}`,
      boxShadow: '2px 2px 0 #8A6820',
      borderRadius: '2px',
    }}>
      <span style={{ fontSize: 'clamp(0.7rem, 1.8vw, 1.1rem)', fontWeight: 700, color: '#2A1800', fontFamily: "'Playfair Display', Georgia, serif", lineHeight: 1 }}>
        {tile.letter === '*' ? '★' : tile.letter}
      </span>
      {tile.score > 0 && (
        <span style={{ position: 'absolute', bottom: '2px', right: '3px', fontSize: 'clamp(0.35rem, 0.8vw, 0.5rem)', color: '#6B4010', fontFamily: "'DM Mono', monospace", lineHeight: 1 }}>
          {tile.score}
        </span>
      )}
    </div>
  );
};

export default Board;