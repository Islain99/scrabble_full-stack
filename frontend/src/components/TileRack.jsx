// src/components/TileRack.jsx
// Props acceptées (alignées sur ce qu'App.jsx envoie) :
//   tiles               [{letter, score}]
//   playerId            number
//   isSwapMode          bool
//   tilesSelectedForSwap  string[]          (mode échange)
//   onSwapTilePress     (letter) => void    (mode échange)
//   selectedTile        Tile | null         (ignoré sur web — drag-and-drop)
//   onTilePress         () => void          (ignoré sur web)

import React, { useState } from 'react';

const TileRack = ({
  tiles = [],
  playerId = 0,
  isSwapMode = false,
  tilesSelectedForSwap = [],
  onSwapTilePress = () => {},
  // props passées depuis App.jsx mais non utilisées sur web (drag-and-drop natif)
  selectedTile,
  onTilePress,
}) => {
  const [draggingIndex, setDraggingIndex] = useState(null);

  const handleDragStart = (e, tile, index) => {
    if (isSwapMode) { e.preventDefault(); return; }
    e.dataTransfer.setData('application/json', JSON.stringify({
      source: 'rack',
      rackIndex: index,
      letter: tile.letter,
      score: tile.score,
    }));
    e.dataTransfer.setData('text/plain', tile.letter);
    e.dataTransfer.effectAllowed = 'move';
    setDraggingIndex(index);
  };

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
        position: 'absolute', top: '-10px', left: '50%',
        transform: 'translateX(-50%)',
        background: '#C8A830', color: '#2A1800',
        fontFamily: "'DM Mono', monospace", fontSize: '0.58rem',
        fontWeight: 500, letterSpacing: '0.15em', textTransform: 'uppercase',
        padding: '1px 10px', borderRadius: '2px', whiteSpace: 'nowrap',
        boxShadow: '2px 2px 0 #8A6820', pointerEvents: 'none',
      }}>
        {isSwapMode ? 'Cliquez pour sélectionner' : `Rack — Joueur ${playerId + 1}`}
      </div>

      {tiles.length === 0 ? (
        <span style={{ color: 'rgba(255,220,120,0.3)', fontFamily: "'Libre Baskerville', serif", fontSize: '0.8rem', fontStyle: 'italic' }}>
          Rack vide
        </span>
      ) : (
        tiles.map((tile, index) => {
          const isSelected = tilesSelectedForSwap.includes(tile.letter);
          const isDragging = draggingIndex === index;
          const isJoker = tile.letter === '*';

          return (
            <RackTile
              key={`${tile.letter}-${index}`}
              tile={tile}
              index={index}
              isSwapMode={isSwapMode}
              isSelected={isSelected}
              isDragging={isDragging}
              isJoker={isJoker}
              onDragStart={handleDragStart}
              onDragEnd={() => setDraggingIndex(null)}
              onSwapClick={() => onSwapTilePress(tile.letter)}
            />
          );
        })
      )}
    </div>
  );
};

const RackTile = ({ tile, index, isSwapMode, isSelected, isDragging, isJoker, onDragStart, onDragEnd, onSwapClick }) => {
  const [isHover, setIsHover] = useState(false);

  const bg     = isSelected ? '#F5C87A' : isJoker ? '#E8E0CC' : '#F0D890';
  const border = isSelected ? '#C8803A' : isJoker ? '#B0A080' : '#C8A830';
  const shadow = isSelected
    ? '0 0 0 2px #C8803A, 3px 3px 0 #8A5010'
    : isJoker ? '3px 3px 0 #807060' : '3px 3px 0 #8A6820';

  const transform = isHover && !isDragging
    ? (isSelected ? 'translateY(-4px)' : 'translateY(-2px)')
    : (isSelected ? 'translateY(-2px)' : 'none');

  return (
    <div
      draggable={!isSwapMode}
      onDragStart={(e) => onDragStart(e, tile, index)}
      onDragEnd={onDragEnd}
      onClick={isSwapMode ? onSwapClick : undefined}
      onMouseEnter={() => setIsHover(true)}
      onMouseLeave={() => setIsHover(false)}
      title={isSwapMode ? `Sélectionner ${tile.letter}` : `Glisser ${tile.letter} sur le plateau`}
      style={{
        width: '2.4rem', height: '2.4rem',
        display: 'flex', flexDirection: 'column',
        justifyContent: 'center', alignItems: 'center',
        position: 'relative', borderRadius: '2px',
        background: bg, border: `2px solid ${border}`,
        boxShadow: shadow,
        cursor: isSwapMode ? 'pointer' : (isDragging ? 'grabbing' : 'grab'),
        opacity: isDragging ? 0.35 : 1,
        transform,
        transition: 'transform 0.1s, box-shadow 0.1s',
        userSelect: 'none',
      }}
    >
      <span style={{
        fontFamily: "'Playfair Display', Georgia, serif",
        fontSize: isJoker ? '0.7rem' : '1rem',
        fontWeight: 700,
        color: '#2A1800',
        lineHeight: 1,
        letterSpacing: '-0.02em',
      }}>
        {isJoker ? '★' : tile.letter}
      </span>
      {!isJoker && (
        <span style={{
          position: 'absolute', bottom: '1px', right: '2px',
          fontFamily: "'DM Mono', monospace",
          fontSize: '0.45rem', fontWeight: 500,
          color: '#5A4500', lineHeight: 1,
        }}>
          {tile.score}
        </span>
      )}
    </div>
  );
};

export default TileRack;