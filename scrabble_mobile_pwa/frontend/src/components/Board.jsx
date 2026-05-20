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

/**
 * Board — pose par TOUCHER (tap-tap) + glisser-déposer (desktop)
 *
 * Props:
 *   gameState   — état complet du jeu
 *   placements  — [{letter, r, c, originalTile, rackIndex}]
 *   isPlacing   — true si une lettre du rack est sélectionnée (mode tap)
 *   onCellTap(r, c)                    — toucher une case vide
 *   onDropTile(rackIndex, r, c)        — déposer depuis le rack (drag)
 *   onMoveTile(fromR, fromC, toR, toC) — déplacer une tuile temporaire (drag)
 *   onReturnTile(r, c)                 — toucher/clic pour remettre dans le rack
 */
const Board = ({ gameState, placements, isPlacing, onCellTap, onDropTile, onMoveTile, onReturnTile }) => {
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
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setHoverCell(null);
    }
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
    const payload = { source: 'board', fromR: r, fromC: c, letter: placement.letter };
    e.dataTransfer.setData('application/json', JSON.stringify(payload));
    e.dataTransfer.effectAllowed = 'move';
    setDragSource({ type: 'board', fromR: r, fromC: c });
  }, [tempMap]);

  if (!gameState || !grid) return (
    <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '1.2rem', color: '#5E6B3A', padding: '2rem', textAlign: 'center' }}>
      Chargement du plateau...
    </div>
  );

  const tempGrid = grid.map(row => [...row]);
  placements.forEach(p => { tempGrid[p.r][p.c] = p.originalTile; });

  return (
    <div
      style={{
        background: 'linear-gradient(135deg, #1A3A18 0%, #2D5A27 40%, #1E4A1C 100%)',
        borderRadius: '4px',
        padding: '10px',
        boxShadow: '6px 6px 0 #0A1A09',
        border: '3px solid #8A6820',
        position: 'relative',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        touchAction: 'manipulation',
        width: '100%',
        maxWidth: 'min(92vw, 560px)',
        margin: '0 auto',
      }}
      onDragEnd={handleBoardDragEnd}
    >
      {[
        { top: '4px',  left: '4px'  },
        { top: '4px',  right: '4px' },
        { bottom: '4px', left: '4px' },
        { bottom: '4px', right: '4px' },
      ].map((pos, i) => (
        <div key={i} style={{ position: 'absolute', width: '12px', height: '12px', background: '#C8A830', borderRadius: '50%', boxShadow: '2px 2px 0 #8A6820', zIndex: 2, ...pos }} />
      ))}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(15, 1fr)', gap: '1px', backgroundColor: '#1A3A18' }}>
        {tempGrid.map((row, r) =>
          row.map((tile, c) => {
            const bonusKey  = getBonus(r, c);
            const bonus     = BONUS_STYLES[bonusKey];
            const cellKey   = `${r}-${c}`;
            const isTemp    = !!tempMap[cellKey];
            const isPerm    = grid[r][c] !== null;
            const isHovered = hoverCell === cellKey;
            const isDraggingFrom = dragSource?.type === 'board' && dragSource.fromR === r && dragSource.fromC === c;
            const isTargetable = isPlacing && !tile;   // case vide jouable au toucher

            let cellBg;
            if (tile)       cellBg = 'transparent';
            else if (isHovered && !isPerm) cellBg = 'rgba(200, 168, 48, 0.35)';
            else if (bonus.bg) cellBg = bonus.bg;
            else            cellBg = 'rgba(45, 90, 39, 0.6)';

            return (
              <div
                key={cellKey}
                data-cell={cellKey}
                className={isTargetable ? 'cell-targetable' : undefined}
                onClick={() => { if (!tile && onCellTap) onCellTap(r, c); }}
                style={{
                  aspectRatio: '1',
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  backgroundColor: cellBg,
                  borderRadius: '1px',
                  transition: 'background 0.08s',
                  position: 'relative',
                  outline: isHovered && !isPerm && !isTemp ? '2px solid rgba(200,168,48,0.7)' : 'none',
                  outlineOffset: '-1px',
                  opacity: isDraggingFrom ? 0.4 : 1,
                  cursor: isTargetable ? 'pointer' : 'default',
                }}
                onDragOver={(e) => handleDragOver(e, r, c)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, r, c)}
              >
                {tile ? (
                  <TileBoardCell
                    tile={tile}
                    isTemp={isTemp}
                    r={r} c={c}
                    onReturnTile={onReturnTile}
                    onDragStart={handleBoardTileDragStart}
                  />
                ) : (
                  bonus.label && (
                    <span style={{
                      fontSize: 'clamp(0.34rem, 1.1vw, 0.55rem)',
                      fontWeight: 700,
                      color: bonus.text,
                      fontFamily: "'DM Mono', monospace",
                      textAlign: 'center',
                      lineHeight: 1,
                      letterSpacing: '-0.02em',
                      pointerEvents: 'none',
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

// Tuile posée sur le plateau (permanente ou temporaire)
const TileBoardCell = ({ tile, isTemp, r, c, onReturnTile, onDragStart }) => {
  const [isOver, setIsOver] = useState(false);

  const baseStyle = {
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    borderRadius: '2px',
    fontFamily: "'Playfair Display', Georgia, serif",
    transition: 'transform 0.1s, opacity 0.1s',
  };

  if (isTemp) {
    return (
      <div
        draggable
        onDragStart={(e) => onDragStart(e, r, c)}
        onClick={(e) => { e.stopPropagation(); onReturnTile(r, c); }}
        onMouseEnter={() => setIsOver(true)}
        onMouseLeave={() => setIsOver(false)}
        title="Touchez pour récupérer la lettre"
        style={{
          ...baseStyle,
          background: isOver ? '#B8D888' : '#D4E8A8',
          border: '2px solid #7AAA30',
          boxShadow: '2px 2px 0 #4A7A10',
          cursor: 'pointer',
          transform: isOver ? 'scale(1.06)' : 'none',
          touchAction: 'manipulation',
        }}
      >
        <span style={{ fontSize: 'clamp(0.6rem, 2.2vw, 0.95rem)', fontWeight: 700, color: '#2A4A10', lineHeight: 1 }}>
          {tile.letter === '*' ? '★' : tile.letter}
        </span>
        {tile.score > 0 && (
          <span style={{ position: 'absolute', bottom: '1px', right: '2px', fontSize: 'clamp(0.3rem, 0.9vw, 0.45rem)', color: '#4A7A10', fontFamily: "'DM Mono', monospace", lineHeight: 1 }}>
            {tile.score}
          </span>
        )}
      </div>
    );
  }

  return (
    <div style={{
      ...baseStyle,
      background: tile.letter === '*' ? '#E8E0CC' : '#F0D890',
      border: `2px solid ${tile.letter === '*' ? '#B0A080' : '#C8A830'}`,
      boxShadow: '2px 2px 0 #8A6820',
      cursor: 'default',
    }}>
      <span style={{ fontSize: 'clamp(0.6rem, 2.2vw, 0.95rem)', fontWeight: 700, color: '#2A1800', lineHeight: 1 }}>
        {tile.letter === '*' ? '★' : tile.letter}
      </span>
      {tile.score > 0 && (
        <span style={{ position: 'absolute', bottom: '1px', right: '2px', fontSize: 'clamp(0.3rem, 0.9vw, 0.45rem)', color: '#6B4010', fontFamily: "'DM Mono', monospace", lineHeight: 1 }}>
          {tile.score}
        </span>
      )}
    </div>
  );
};

export default Board;
