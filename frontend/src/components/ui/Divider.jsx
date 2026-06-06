import React from 'react';

export function Divider({ heavy = false, style = {} }) {
  return (
    <hr
      style={{
        border:    'none',
        borderTop: heavy
          ? '3px solid var(--border-primary)'
          : '1px solid var(--border-muted)',
        margin: 0,
        ...style,
      }}
    />
  );
}

export default Divider;