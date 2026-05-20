import React from 'react';
import Tile from './Tile';

const TileRack = ({
  tiles,
  playerId,
  onTileClick,
  selectedTiles = []
}) => {
  const isSwapModeActive = onTileClick !== undefined;

  const handleDragStart = (e, tile, index) => {
    if (isSwapModeActive) { e.preventDefault(); return; }
    const tileData = { letter: tile.letter, score: tile.score, id: index };
    e.dataTransfer.setData('application/json', JSON.stringify(tileData));
    e.dataTransfer.setData('text/plain', tile.letter);
    e.dataTransfer.setData('source', 'rack');
    e.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div style={{
      background: 'linear-gradient(180deg, #8B5E2A 0%, #6B4010 60%, #5A3008 100%)',
      borderRadius: '4px',
      padding: '10px 16px 14px',
      boxShadow: '4px 4px 0 #2A1800, inset 0 2px 6px rgba(255,220,120,0.15)',
      border: `3px solid ${isSwapModeActive ? '#C8803A' : '#8A6820'}`,
      display: 'flex',
      flexWrap: 'wrap',
      justifyContent: 'center',
      alignItems: 'center',
      gap: '2px',
      position: 'relative',
      transition: 'border-color 0.2s',
    }}>
      {/* Rack label */}
      <div style={{
        position: 'absolute',
        top: '-11px',
        left: '50%',
        transform: 'translateX(-50%)',
        background: '#C8A830',
        color: '#2A1800',
        fontFamily: "'DM Mono', monospace",
        fontSize: '0.6rem',
        fontWeight: 500,
        letterSpacing: '0.15em',
        textTransform: 'uppercase',
        padding: '1px 10px',
        borderRadius: '2px',
        whiteSpace: 'nowrap',
        boxShadow: '2px 2px 0 #8A6820',
      }}>
        {isSwapModeActive ? 'Sélectionner pour échanger' : `Rack — Joueur ${playerId + 1}`}
      </div>

      {/* Wood grain lines */}
      {[20, 40, 60, 80].map(pct => (
        <div key={pct} style={{
          position: 'absolute',
          top: 0, bottom: 0,
          left: `${pct}%`,
          width: '1px',
          background: 'rgba(255,220,120,0.06)',
          pointerEvents: 'none',
        }} />
      ))}

      {tiles.length === 0 ? (
        <span style={{
          color: 'rgba(255,220,120,0.35)',
          fontFamily: "'Libre Baskerville', serif",
          fontSize: '0.8rem',
          fontStyle: 'italic',
          padding: '4px',
        }}>
          Rack vide
        </span>
      ) : (
        tiles.map((tile, index) => {
          const isSelected = selectedTiles.includes(tile.letter);
          const isDraggable = !isSwapModeActive;
          return (
            <Tile
              key={`${tile.letter}-${index}`}
              letter={tile.letter}
              score={tile.score}
              id={index}
              isDraggable={isDraggable}
              onDragStart={(e) => handleDragStart(e, tile, index)}
              isSelectable={isSwapModeActive}
              isSelected={isSelected}
              onClick={isSwapModeActive ? () => onTileClick(tile.letter) : null}
            />
          );
        })
      )}
    </div>
  );
};

export default TileRack;