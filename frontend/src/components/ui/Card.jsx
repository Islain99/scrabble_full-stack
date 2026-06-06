import React from 'react';

function CardHeader({ children, style = {}, ...props }) {
  return (
    <div
      style={{
        background: 'var(--bg-invert)',
        color:      'var(--text-invert)',
        padding:    '10px 18px',
        display:    'flex',
        alignItems: 'center',
        gap:        '10px',
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  );
}

function CardBody({ children, style = {}, ...props }) {
  return (
    <div style={{ padding: '16px 20px', ...style }} {...props}>
      {children}
    </div>
  );
}

export function Card({ children, size = 'sm', gold = false, style = {}, ...props }) {
  const borderWidth  = size === 'lg' ? '3px' : '2px';
  const shadowOffset = size === 'lg' ? '8px' : '4px';
  const borderColor  = gold ? 'var(--gold)'      : 'var(--border-primary)';
  const shadowColor  = gold ? 'var(--gold)'      : 'var(--shadow-card)';

  return (
    <div
      style={{
        background:   'var(--bg-card)',
        border:       `${borderWidth} solid ${borderColor}`,
        borderRadius: size === 'lg' ? '3px' : '2px',
        boxShadow:    `${shadowOffset} ${shadowOffset} 0 ${shadowColor}`,
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  );
}

Card.Header = CardHeader;
Card.Body   = CardBody;

export default Card;