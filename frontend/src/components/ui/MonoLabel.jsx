import React from 'react';

export function MonoLabel({
  children,
  size  = 'xs',
  color = 'var(--text-muted)',
  style = {},
  ...props
}) {
  const sizes = { xs: '0.62rem', sm: '0.72rem', md: '0.82rem' };
  return (
    <span
      style={{
        fontFamily:    "'DM Mono', monospace",
        fontSize:      sizes[size] ?? sizes.xs,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        color,
        ...style,
      }}
      {...props}
    >
      {children}
    </span>
  );
}

export default MonoLabel;