import React from 'react';

const Tile = ({
  letter,
  score,
  isDraggable = true,
  isSelectable = false,
  isSelected = false,
  isTempPlaced = false,
  onDragStart,
  onClick,
  id
}) => {
  const isJoker = letter === '*';
  const displayLetter = isJoker ? '★' : letter;

  const handleDragStart = (e) => {
    if (!onDragStart) return;
    e.dataTransfer.setData('text/plain', letter);
    e.dataTransfer.setData('application/json', JSON.stringify({ letter, id }));
    onDragStart(e);
  };

  const baseStyle = {
    width: '2.4rem',
    height: '2.4rem',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    margin: '2px',
    position: 'relative',
    userSelect: 'none',
    borderRadius: '2px',
    transition: 'transform 0.1s, box-shadow 0.1s',
    fontFamily: "'Playfair Display', Georgia, serif",
  };

  const tileColors = isJoker
    ? { bg: '#E8E0CC', border: '#B0A080', shadow: '#807060', text: '#6B5E45' }
    : isTempPlaced
    ? { bg: '#D4E8A8', border: '#7AAA30', shadow: '#4A7A10', text: '#2A4A10' }
    : isSelected
    ? { bg: '#F5C87A', border: '#C8803A', shadow: '#8A5010', text: '#4A2800' }
    : { bg: '#F0D890', border: '#C8A830', shadow: '#8A6820', text: '#2A1800' };

  const dynamicStyle = {
    ...baseStyle,
    backgroundColor: tileColors.bg,
    border: `2px solid ${tileColors.border}`,
    boxShadow: isSelected
      ? `0 0 0 3px #C8803A, 3px 3px 0 ${tileColors.shadow}`
      : isTempPlaced
      ? `0 0 0 2px #7AAA30, 3px 3px 0 ${tileColors.shadow}`
      : `3px 3px 0 ${tileColors.shadow}`,
    cursor: isSelectable || isTempPlaced
      ? 'pointer'
      : isDraggable
      ? 'grab'
      : 'default',
    transform: isSelected ? 'translateY(-2px)' : 'none',
  };

  return (
    <div
      id={id}
      style={dynamicStyle}
      draggable={isDraggable && !isSelectable && !isTempPlaced}
      onDragStart={isDraggable && !isSelectable && !isTempPlaced ? handleDragStart : null}
      onClick={isSelectable || isTempPlaced ? () => onClick(letter) : null}
    >
      <span style={{
        fontSize: '1.1rem',
        fontWeight: 700,
        lineHeight: 1,
        color: tileColors.text,
        fontFamily: "'Playfair Display', Georgia, serif",
      }}>
        {displayLetter}
      </span>
      {score > 0 && (
        <span style={{
          position: 'absolute',
          bottom: '1px',
          right: '2px',
          fontSize: '0.52rem',
          fontWeight: 500,
          color: tileColors.text,
          opacity: 0.75,
          fontFamily: "'DM Mono', monospace",
          lineHeight: 1,
        }}>
          {score}
        </span>
      )}
    </div>
  );
};

export default Tile;