import React, { useState } from 'react';

/**
 * TileRack — rack de tuiles du joueur
 *
 * Props:
 *   tiles           — tuiles disponibles [{letter, score}]
 *   playerId        — id du joueur courant
 *   onTileClick     — si défini → mode échange (clic pour sélectionner)
 *   selectedTiles   — lettres sélectionnées pour l'échange
 *   onDragStart(e, tile, rackIndex) — notifie App du début d'un drag
 */
const TileRack = ({ tiles, playerId, onTileClick, selectedTiles = [], onDragStartNotify }) => {
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
      padding: '10px 16px 14px',
      boxShadow: '4px 4px 0 #2A1800',
      border: `3px solid ${isSwapMode ? '#C8803A' : '#8A6820'}`,
      display: 'flex',
      flexWrap: 'wrap',
      justifyContent: 'center',
      alignItems: 'center',
      gap: '4px',
      position: 'relative',
      minHeight: '56px',
      transition: 'border-color 0.2s',
    }}>
      {/* Étiquette */}
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
        letterSpacing: '0.15em',
        textTransform: 'uppercase',
        padding: '1px 10px',
        borderRadius: '2px',
        whiteSpace: 'nowrap',
        boxShadow: '2px 2px 0 #8A6820',
        pointerEvents: 'none',
      }}>
        {isSwapMode ? 'Cliquez pour sélectionner' : `Rack — Joueur ${playerId + 1}`}
      </div>

      {/* Veines bois */}
      {[20, 40, 60, 80].map(pct => (
        <div key={pct} style={{ position: 'absolute', top: 0, bottom: 0, left: `${pct}%`, width: '1px', background: 'rgba(255,220,120,0.05)', pointerEvents: 'none' }} />
      ))}

      {tiles.length === 0 ? (
        <span style={{ color: 'rgba(255,220,120,0.3)', fontFamily: "'Libre Baskerville', serif", fontSize: '0.8rem', fontStyle: 'italic' }}>
          Rack vide
        </span>
      ) : (
        tiles.map((tile, index) => {
          const isSelected = selectedTiles.includes(tile.letter);
          const isDragging = draggingIndex === index;
          return (
            <RackTile
              key={`${tile.letter}-${index}`}
              tile={tile}
              index={index}
              isSwapMode={isSwapMode}
              isSelected={isSelected}
              isDragging={isDragging}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onTileClick={onTileClick}
            />
          );
        })
      )}
    </div>
  );
};

const RackTile = ({ tile, index, isSwapMode, isSelected, isDragging, onDragStart, onDragEnd, onTileClick }) => {
  const [isHover, setIsHover] = useState(false);
  const isJoker = tile.letter === '*';

  const getBg = () => {
    if (isSelected) return '#F5C87A';
    if (isJoker)    return '#E8E0CC';
    return '#F0D890';
  };

  const getBorder = () => {
    if (isSelected) return '#C8803A';
    if (isJoker)    return '#B0A080';
    return '#C8A830';
  };

  const getShadow = () => {
    if (isSelected) return '0 0 0 2px #C8803A, 3px 3px 0 #8A5010';
    if (isJoker)    return '3px 3px 0 #807060';
    return '3px 3px 0 #8A6820';
  };

  return (
    <div
      draggable={!isSwapMode}
      onDragStart={(e) => onDragStart(e, tile, index)}
      onDragEnd={onDragEnd}
      onClick={isSwapMode ? () => onTileClick(tile.letter) : undefined}
      onMouseEnter={() => setIsHover(true)}
      onMouseLeave={() => setIsHover(false)}
      title={isSwapMode ? `Sélectionner ${tile.letter}` : `Glisser ${tile.letter} sur le plateau`}
      style={{
        width: '2.4rem',
        height: '2.4rem',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        position: 'relative',
        borderRadius: '2px',
        background: getBg(),
        border: `2px solid ${getBorder()}`,
        boxShadow: getShadow(),
        cursor: isSwapMode ? 'pointer' : (isDragging ? 'grabbing' : 'grab'),
        opacity: isDragging ? 0.35 : 1,
        transform: isHover && !isDragging ? (isSelected ? 'translateY(-4px)' : 'translateY(-2px)') : (isSelected ? 'translateY(-2px)' : 'none'),
        transition: 'transform 0.1s, opacity 0.15s, background 0.1s',
        userSelect: 'none',
        flexShrink: 0,
      }}
    >
      <span style={{
        fontSize: '1.1rem',
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
          bottom: '1px',
          right: '2px',
          fontSize: '0.48rem',
          fontWeight: 500,
          color: isSelected ? '#8A5010' : (isJoker ? '#8A7060' : '#6B4010'),
          fontFamily: "'DM Mono', monospace",
          lineHeight: 1,
          pointerEvents: 'none',
        }}>
          {tile.score}
        </span>
      )}
      {/* Badge de sélection */}
      {isSelected && (
        <div style={{
          position: 'absolute',
          top: '-6px', right: '-6px',
          width: '12px', height: '12px',
          background: '#C8803A',
          borderRadius: '50%',
          border: '1px solid #8A5010',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          pointerEvents: 'none',
        }}>
          <span style={{ fontSize: '0.45rem', color: '#FFF0D8', fontFamily: "'DM Mono', monospace", lineHeight: 1 }}>✓</span>
        </div>
      )}
    </div>
  );
};

export default TileRack;