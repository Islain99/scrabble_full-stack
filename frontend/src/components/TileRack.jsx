import React, { useState } from 'react';

const TileRack = ({ tiles, playerId, onTileClick, selectedTiles = [], onDragStartNotify }) => {
  const isSwapMode = onTileClick !== undefined;
  const [draggingIndex, setDraggingIndex] = useState(null);

  const handleDragStart = (e, tile, index) => {
    if (isSwapMode) { e.preventDefault(); return; }
    e.dataTransfer.setData('application/json', JSON.stringify({ source: 'rack', rackIndex: index, letter: tile.letter, score: tile.score }));
    e.dataTransfer.setData('text/plain', tile.letter);
    e.dataTransfer.effectAllowed = 'move';
    setDraggingIndex(index);
    if (onDragStartNotify) onDragStartNotify(index);
  };

  const handleDragEnd = () => setDraggingIndex(null);

  return (
    <div style={{
      background: 'linear-gradient(180deg, #8B5E2A 0%, #6B4010 60%, #5A3008 100%)',
      borderRadius: '6px',
      padding: '18px 20px 20px',
      boxShadow: '4px 4px 0 #2A1800',
      border: `3px solid ${isSwapMode ? '#C8803A' : '#8A6820'}`,
      display: 'flex',
      flexWrap: 'wrap',
      justifyContent: 'center',
      alignItems: 'center',
      gap: '8px',
      position: 'relative',
      minHeight: '80px',
      transition: 'border-color 0.2s',
    }}>
      {/* Étiquette */}
      <div style={{
        position: 'absolute',
        top: '-12px',
        left: '50%',
        transform: 'translateX(-50%)',
        background: '#C8A830',
        color: '#2A1800',
        fontFamily: "'DM Mono', monospace",
        fontSize: '0.72rem',
        fontWeight: 500,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        padding: '3px 14px',
        borderRadius: '2px',
        whiteSpace: 'nowrap',
        boxShadow: '2px 2px 0 #8A6820',
        pointerEvents: 'none',
      }}>
        {isSwapMode ? 'Cliquer pour sélectionner' : `Rack — Joueur ${playerId + 1}`}
      </div>

      {tiles.length === 0 ? (
        <span style={{ color: 'rgba(255,220,120,0.4)', fontFamily: "'Libre Baskerville', serif", fontSize: '1rem', fontStyle: 'italic' }}>
          Rack vide
        </span>
      ) : (
        tiles.map((tile, index) => {
          const isSelected = selectedTiles.includes(tile.letter);
          const isDragging = draggingIndex === index;
          return (
            <RackTile
              key={`${tile.letter}-${index}`}
              tile={tile} index={index}
              isSwapMode={isSwapMode} isSelected={isSelected} isDragging={isDragging}
              onDragStart={handleDragStart} onDragEnd={handleDragEnd} onTileClick={onTileClick}
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

  const bg     = isSelected ? '#F5C87A' : isJoker ? '#E8E0CC' : '#F0D890';
  const border = isSelected ? '#C8803A' : isJoker ? '#B0A080' : '#C8A830';
  const shadow = isSelected ? '0 0 0 2px #C8803A, 4px 4px 0 #8A5010' : isJoker ? '4px 4px 0 #807060' : '4px 4px 0 #8A6820';

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
        width: '52px',
        height: '52px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        position: 'relative',
        borderRadius: '3px',
        background: bg,
        border: `2px solid ${border}`,
        boxShadow: shadow,
        cursor: isSwapMode ? 'pointer' : (isDragging ? 'grabbing' : 'grab'),
        opacity: isDragging ? 0.35 : 1,
        transform: isHover && !isDragging
          ? (isSelected ? 'translateY(-5px)' : 'translateY(-3px)')
          : (isSelected ? 'translateY(-2px)' : 'none'),
        transition: 'transform 0.1s, opacity 0.15s, background 0.1s',
        userSelect: 'none',
        flexShrink: 0,
      }}
    >
      <span style={{
        fontSize: '1.5rem',
        fontWeight: 700,
        lineHeight: 1,
        color: isSelected ? '#4A2800' : isJoker ? '#6B5E45' : '#2A1800',
        fontFamily: "'Playfair Display', Georgia, serif",
        pointerEvents: 'none',
      }}>
        {isJoker ? '★' : tile.letter}
      </span>
      {tile.score > 0 && (
        <span style={{
          position: 'absolute',
          bottom: '3px',
          right: '4px',
          fontSize: '0.6rem',
          fontWeight: 500,
          color: isSelected ? '#8A5010' : isJoker ? '#8A7060' : '#6B4010',
          fontFamily: "'DM Mono', monospace",
          lineHeight: 1,
          pointerEvents: 'none',
        }}>
          {tile.score}
        </span>
      )}
      {isSelected && (
        <div style={{
          position: 'absolute', top: '-7px', right: '-7px',
          width: '16px', height: '16px',
          background: '#C8803A', borderRadius: '50%',
          border: '1.5px solid #8A5010',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          pointerEvents: 'none',
        }}>
          <span style={{ fontSize: '0.55rem', color: '#FFF0D8', fontFamily: "'DM Mono', monospace", lineHeight: 1 }}>✓</span>
        </div>
      )}
    </div>
  );
};

export default TileRack;