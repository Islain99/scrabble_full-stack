// src/components/Toast.jsx
import React, { useEffect, useState } from 'react';

const TOAST_STYLES = {
  error:   { border: 'var(--brick)',  bg: 'var(--bg-card)', icon: '⚠️', duration: 6000 },
  success: { border: 'var(--olive)',  bg: 'var(--bg-card)', icon: '✓',  duration: 3500 },
  info:    { border: 'var(--gold)',   bg: 'var(--bg-card)', icon: '🤖', duration: 4000 },
  warn:    { border: 'var(--tobacco)',bg: 'var(--bg-card)', icon: '⏱',  duration: 4000 },
};

export function Toast({ toasts, onDismiss }) {
  return (
    <div style={{
      position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)',
      zIndex: 300, display: 'flex', flexDirection: 'column', gap: '8px',
      alignItems: 'center', pointerEvents: 'none',
    }}>
      {toasts.map(toast => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onDismiss }) {
  const [visible, setVisible] = useState(false);
  const style = TOAST_STYLES[toast.type] || TOAST_STYLES.info;

  useEffect(() => {
    // Fade in
    requestAnimationFrame(() => setVisible(true));
    // Auto-dismiss
    const t = setTimeout(() => {
      setVisible(false);
      setTimeout(() => onDismiss(toast.id), 300);
    }, style.duration);
    return () => clearTimeout(t);
  }, [toast.id]);

  return (
    <div
      onClick={() => { setVisible(false); setTimeout(() => onDismiss(toast.id), 300); }}
      style={{
        pointerEvents: 'auto',
        cursor: 'pointer',
        background: style.bg,
        border: `2px solid ${style.border}`,
        borderRadius: '3px',
        padding: '10px 16px',
        boxShadow: `4px 4px 0 ${style.border}`,
        fontFamily: "'DM Mono', monospace",
        fontSize: '0.82rem',
        color: 'var(--text-primary)',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        maxWidth: '420px',
        width: 'max-content',
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(12px)',
        transition: 'opacity 0.25s ease, transform 0.25s ease',
      }}
    >
      <span style={{ fontSize: '1rem', flexShrink: 0 }}>{style.icon}</span>
      <span style={{ flex: 1 }}>{toast.message}</span>
      <span style={{ opacity: 0.4, fontSize: '0.65rem', flexShrink: 0 }}>✕</span>
    </div>
  );
}