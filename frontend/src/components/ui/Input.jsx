import React from 'react';

export function Input({ label, error, id, style = {}, ...props }) {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-');

  const handleFocus = (e) => {
    e.currentTarget.style.borderColor = 'var(--gold)';
    e.currentTarget.style.boxShadow   = '0 0 0 3px rgba(200,168,48,0.15)';
  };

  const handleBlur = (e) => {
    e.currentTarget.style.borderColor = error ? 'var(--brick)' : 'var(--border-primary)';
    e.currentTarget.style.boxShadow   = 'none';
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {label && (
        <label
          htmlFor={inputId}
          style={{
            fontFamily:    "'DM Mono', monospace",
            fontSize:      '0.62rem',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color:         'var(--text-muted)',
          }}
        >
          {label}
        </label>
      )}
      <input
        id={inputId}
        onFocus={handleFocus}
        onBlur={handleBlur}
        style={{
          width:        '100%',
          background:   'var(--bg-input)',
          color:        'var(--text-primary)',
          border:       `2px solid ${error ? 'var(--brick)' : 'var(--border-primary)'}`,
          borderRadius: '2px',
          padding:      '10px 14px',
          fontFamily:   "'Libre Baskerville', serif",
          fontSize:     '0.95rem',
          outline:      'none',
          boxSizing:    'border-box',
          transition:   'border-color 0.15s, box-shadow 0.15s',
          ...style,
        }}
        {...props}
      />
      {error && (
        <span
          style={{
            fontFamily:    "'DM Mono', monospace",
            fontSize:      '0.62rem',
            letterSpacing: '0.06em',
            color:         'var(--brick)',
          }}
        >
          {error}
        </span>
      )}
    </div>
  );
}

export default Input;