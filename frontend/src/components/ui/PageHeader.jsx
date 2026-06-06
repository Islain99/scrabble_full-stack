import React from 'react';

export function PageHeader({ title, subtitle, children, style = {} }) {
  return (
    <div
      style={{
        borderBottom:  '3px solid var(--border-primary)',
        paddingBottom: '14px',
        marginBottom:  '2rem',
        ...style,
      }}
    >
      <h1
        style={{
          fontFamily:    "'Playfair Display', serif",
          fontSize:      '2.2rem',
          fontWeight:    900,
          letterSpacing: '-0.04em',
          color:         'var(--text-primary)',
          margin:        0,
        }}
      >
        {title}
      </h1>
      {subtitle && (
        <p
          style={{
            fontFamily:    "'DM Mono', monospace",
            fontSize:      '0.7rem',
            letterSpacing: '0.1em',
            color:         'var(--text-muted)',
            margin:        '4px 0 0',
          }}
        >
          {subtitle}
        </p>
      )}
      {children}
    </div>
  );
}

export default PageHeader;