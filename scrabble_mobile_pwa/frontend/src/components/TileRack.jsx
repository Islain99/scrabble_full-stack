import React, { useState } from 'react';

/**
 * TileRack — rack de tuiles du joueur
 *
 * Modes :
 *   - Mode ÉCHANGE  (onTileClick défini)  : on touche pour (dé)sélectionner les lettres à échanger.
 *   - Mode POSE     (par défaut)          : on touche une lettre pour la sélectionner, puis on touche
 *                                           une case du plateau. Le glisser-déposer reste possible (desktop).
 *
 * Props:
 *   tiles            — tuiles disponibles [{letter, score}]
 *   playerId         — id du joueur courant
 *   onTileClick      — si défini → mode échange (toggle d'une lettre)
 *   selectedTiles    — lettres sélectionnées pour l'échange
 *   selectedRackIndex— index de la lettre sélectionnée pour la pose (mode pose)
 *   onRackTileTap    — (index) sélection d'une lettre pour la pose
 *   onDragStartNotify— notifie le début d'un drag
 */
const TileRack = ({
  tiles,
  playerId,
  onTileClick,
  selectedTiles = [],
  selectedRackIndex = null,
  onRackTileTap,
  onDragStartNotify,
}) => {
  const isSwapMode = onTileClick !== undefined;
  const [draggingIndex, setDraggingIndex] = useState(null);

  const handleDragStart = (e, tile, index) => {
    if (isSwapMode) { e.preventDefault(); return; }
    const payload = {
      source: 'rack',
      rackIndex: index,
      letter: tile.letter,
      score: tile.score,
    };
    e.dataTransfer.setData('application/json', JSON.stringify(payload));
    e.dataTransfer.setData('text/plain', tile.letter);
    e.dataTransfer.effectAllowed = 'move';
    setDraggingIndex(index);
    if (onDragStartNotify) onDragStartNotify(index);
  };

  const handleDragEnd = () => setDraggingIndex(null);

  return (
    <div style={{
      background: 'linear-gradient(180deg, #8B5E2A 0%, #6B4010 60%, #5A3008 100%)',
      borderRadius: '4px',
      padding: '12px 12px 14px',
      boxShadow: '4px 4px 0 #2A1800',
      border: `3px solid ${isSwapMode ? '#C8803A' : '#8A6820'}`,
      display: 'flex',
      flexWrap: 'wrap',
      justifyContent: 'center',
      alignItems: 'center',
      gap: '5px',
      position: 'relative',
      minHeight: '60px',
      transition: 'border-color 0.2s',
    }}>
      <div style={{
        position: 'absolute',
        top: '-10px',
        left: '50%',
        transform: 'translateX(-50%)',
        background: '#C8A830',
        color: '#2A1800',
        fontFamily: "'DM Mono', monospace",
        fontSize: '0.58rem',
        fontWeight: 500,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        padding: '1px 10px',
        borderRadius: '2px',
        whiteSpace: 'nowrap',
        boxShadow: '2px 2px 0 #8A6820',
        pointerEvents: 'none',
      }}>
        {isSwapMode ? 'Échange — touchez les lettres' : `Rack — Joueur ${playerId + 1}`}
      </div>

      {[20, 40, 60, 80].map(pct => (
        <div key={pct} style={{ position: 'absolute', top: 0, bottom: 0, left: `${pct}%`, width: '1px', background: 'rgba(255,220,120,0.05)', pointerEvents: 'none' }} />
      ))}

      {tiles.length === 0 ? (
        <span style={{ color: 'rgba(255,220,120,0.3)', fontFamily: "'Libre Baskerville', serif", fontSize: '0.8rem', fontStyle: 'italic' }}>
          Rack vide
        </span>
      ) : (
        tiles.map((tile, index) => {
          const isSwapSelected = selectedTiles.includes(tile.letter);
          const isPlaceSelected = !isSwapMode && selectedRackIndex === index;
          const isDragging = draggingIndex === index;
          return (
            <RackTile
              key={`${tile.letter}-${index}`}
              tile={tile}
              index={index}
              isSwapMode={isSwapMode}
              isSelected={isSwapMode ? isSwapSelected : isPlaceSelected}
              isDragging={isDragging}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onTap={() => {
                if (isSwapMode) onTileClick(tile.letter);
                else if (onRackTileTap) onRackTileTap(index);
              }}
            />
          );
        })
      )}
    </div>
  );
};

const RackTile = ({ tile, index, isSwapMode, isSelected, isDragging, onDragStart, onDragEnd, onTap }) => {
  const [isHover, setIsHover] = useState(false);
  const isJoker = tile.letter === '*';

  const bg     = isSelected ? '#F5C87A' : (isJoker ? '#E8E0CC' : '#F0D890');
  const border = isSelected ? '#C8803A' : (isJoker ? '#B0A080' : '#C8A830');
  const shadow = isSelected
    ? '0 0 0 2px #C8803A, 3px 3px 0 #8A5010'
    : (isJoker ? '3px 3px 0 #807060' : '3px 3px 0 #8A6820');

  return (
    <div
      className={isSelected ? 'tile-selected-anim' : undefined}
      draggable={!isSwapMode}
      onDragStart={(e) => onDragStart(e, tile, index)}
      onDragEnd={onDragEnd}
      onClick={onTap}
      onMouseEnter={() => setIsHover(true)}
      onMouseLeave={() => setIsHover(false)}
      title={isSwapMode ? `Sélectionner ${tile.letter}` : `Choisir ${tile.letter} puis toucher une case`}
      style={{
        width: 'clamp(2.4rem, 11vw, 3rem)',
        height: 'clamp(2.4rem, 11vw, 3rem)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        position: 'relative',
        borderRadius: '3px',
        background: bg,
        border: `2px solid ${border}`,
        boxShadow: shadow,
        cursor: 'pointer',
        opacity: isDragging ? 0.35 : 1,
        transform: !isSelected && isHover && !isDragging ? 'translateY(-2px)' : 'none',
        transition: 'opacity 0.15s, background 0.1s, box-shadow 0.1s',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        touchAction: 'manipulation',
        flexShrink: 0,
      }}
    >
      <span style={{
        fontSize: 'clamp(1.1rem, 5vw, 1.4rem)',
        fontWeight: 700,
        lineHeight: 1,
        color: isSelected ? '#4A2800' : (isJoker ? '#6B5E45' : '#2A1800'),
        fontFamily: "'Playfair Display', Georgia, serif",
        pointerEvents: 'none',
      }}>
        {isJoker ? '★' : tile.letter}
      </span>
      {tile.score > 0 && (
        <span style={{
          position: 'absolute',
          bottom: '2px',
          right: '3px',
          fontSize: '0.5rem',
          fontWeight: 500,
          color: isSelected ? '#8A5010' : (isJoker ? '#8A7060' : '#6B4010'),
          fontFamily: "'DM Mono', monospace",
          lineHeight: 1,
          pointerEvents: 'none',
        }}>
          {tile.score}
        </span>
      )}
      {isSelected && (
        <div style={{
          position: 'absolute',
          top: '-6px', right: '-6px',
          width: '14px', height: '14px',
          background: '#C8803A',
          borderRadius: '50%',
          border: '1px solid #8A5010',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          pointerEvents: 'none',
        }}>
          <span style={{ fontSize: '0.5rem', color: '#FFF0D8', fontFamily: "'DM Mono', monospace", lineHeight: 1 }}>
            {isSwapMode ? '✓' : '↓'}
          </span>
        </div>
      )}
    </div>
  );
};

export default TileRack;
