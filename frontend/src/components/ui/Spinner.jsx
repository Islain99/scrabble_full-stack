import React from 'react';

export function Spinner({ size = 10, color = 'var(--gold)', style = {} }) {
  return (
    <div
      style={{
        width:          `${size}px`,
        height:         `${size}px`,
        border:         `2px solid ${color}`,
        borderTopColor: 'transparent',
        borderRadius:   '50%',
        animation:      'spin 0.8s linear infinite',
        flexShrink:     0,
        ...style,
      }}
    />
  );
}

export default Spinner;