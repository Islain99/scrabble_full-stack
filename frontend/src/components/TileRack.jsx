// src/components/TileRack.jsx
import React, { useState } from 'react';
import { useTutorialRef } from '../context/TutorialContext';

const TileRack = ({ tiles, playerId, onTileClick, selectedTiles = [] }) => {
  const isSwapMode = onTileClick !== undefined;
  const [draggingIndex, setDraggingIndex] = useState(null);
  const rackRef = useTutorialRef('tile-rack');

  const handleDragStart = (e, tile, index) => {
    if (isSwapMode) { e.preventDefault(); return; }
    e.dataTransfer.setData('application/json', JSON.stringify({ source: 'rack', rackIndex: index, letter: tile.letter, score: tile.score }));
    e.dataTransfer.setData('text/plain', tile.letter);
    e.dataTransfer.effectAllowed = 'move';
    setDraggingIndex(index);
  };

  const handleDragEnd = () => setDraggingIndex(null);

  return (
    <div ref={rackRef} style={{
      background: 'var(--rack-bg)',
      borderRadius: '6px',
      padding: '18px 20px 20px',
      boxShadow: '4px 4px 0 var(--rack-shadow)',
      border: `3px solid ${isSwapMode ? 'var(--tobacco)' : 'var(--rack-border)'}`,
      display: 'flex',
      flexWrap: 'wrap',
      justifyContent: 'center',
      alignItems: 'center',
      gap: '8px',
      position: 'relative',
      minHeight: '80px',
      transition: 'border-color 0.2s',
    }}>
      <div style={{
        position: 'absolute',
        top: '-12px',
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'var(--rack-label-bg)',
        color: 'var(--rack-label-text)',
        fontFamily: "'DM Mono', monospace",
        fontSize: '0.72rem',
        fontWeight: 500,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        padding: '3px 14px',
        borderRadius: '2px',
        whiteSpace: 'nowrap',
        boxShadow: '2px 2px 0 var(--rack-shadow)',
        pointerEvents: 'none',
      }}>
        {isSwapMode ? 'Cliquer pour sélectionner' : `Rack — Joueur ${playerId + 1}`}
      </div>

      {tiles.length === 0 ? (
        <span style={{ color: 'var(--text-muted)', fontFamily: "'Libre Baskerville', serif", fontSize: '1rem', fontStyle: 'italic', opacity: 0.5 }}>
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
              onDragStart={handleDragStart} onDragEnd={handleDragEnd}
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

  const getBg     = () => isSelected ? 'var(--tile-sel-bg)'    : isJoker ? 'var(--tile-joker-bg)'    : 'var(--tile-bg)';
  const getBorder = () => isSelected ? 'var(--tile-sel-border)' : isJoker ? 'var(--tile-joker-border)' : 'var(--tile-border)';
  const getColor  = () => isSelected ? 'var(--tile-sel-shadow)' : isJoker ? 'var(--tile-shadow)'        : 'var(--tile-shadow)';

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
        background: getBg(),
        border: `2px solid ${getBorder()}`,
        boxShadow: isSelected
          ? `0 0 0 2px var(--tile-sel-border), 4px 4px 0 var(--tile-sel-shadow)`
          : `4px 4px 0 ${getColor()}`,
        cursor: isSwapMode ? 'pointer' : (isDragging ? 'grabbing' : 'grab'),
        opacity: isDragging ? 0.35 : 1,
        transform: isHover && !isDragging
          ? (isSelected ? 'translateY(-5px)' : 'translateY(-3px)')
          : (isSelected ? 'translateY(-2px)' : 'none'),
        transition: 'transform 0.1s, opacity 0.15s',
        userSelect: 'none',
        flexShrink: 0,
      }}
    >
      <span style={{ fontSize: '1.5rem', fontWeight: 700, lineHeight: 1, color: isJoker ? 'var(--tile-score)' : 'var(--tile-text)', fontFamily: "'Playfair Display', Georgia, serif", pointerEvents: 'none' }}>
        {isJoker ? '★' : tile.letter}
      </span>
      {tile.score > 0 && (
        <span style={{ position: 'absolute', bottom: '3px', right: '4px', fontSize: '0.6rem', fontWeight: 500, color: 'var(--tile-score)', fontFamily: "'DM Mono', monospace", lineHeight: 1, pointerEvents: 'none' }}>
          {tile.score}
        </span>
      )}
      {isSelected && (
        <div style={{ position: 'absolute', top: '-7px', right: '-7px', width: '16px', height: '16px', background: 'var(--tobacco)', borderRadius: '50%', border: '1.5px solid var(--tile-sel-shadow)', display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
          <span style={{ fontSize: '0.55rem', color: 'var(--text-invert)', fontFamily: "'DM Mono', monospace", lineHeight: 1 }}>✓</span>
        </div>
      )}
    </div>
  );
};

export default TileRack;