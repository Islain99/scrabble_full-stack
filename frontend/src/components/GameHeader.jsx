// src/components/GameHeader.jsx
import React from 'react';
import TurnTimer from './TurnTimer';
import { useSettings } from '../context/SettingsContext';

/**
 * GameHeader — barre sticky en haut de l'écran de jeu.
 * Affiche : titre, tour actuel, tuiles restantes, timer.
 */
export default function GameHeader({ gameState, timerActive, timerResetRef, onTimerExpire }) {
  const { settings } = useSettings();

  if (!gameState) return null;

  const currentPlayer = gameState.players[gameState.current_player_index];
  const remaining     = gameState.remaining_tiles?.length ?? 0;
  const isAI          = currentPlayer?.is_ai;

  return (
    <header style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 24px',
      height: settings.turnDuration > 0 ? 'auto' : '58px',
      flexDirection: settings.turnDuration > 0 ? 'column' : 'row',
      gap: settings.turnDuration > 0 ? '0' : '12px',
      borderBottom: '3px solid var(--border-primary)',
      background: 'var(--bg-card)',
      position: 'sticky',
      top: '60px', // sous la Navbar
      zIndex: 90,
      transition: 'background 0.25s',
    }}>
      {/* Ligne principale */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        padding: settings.turnDuration > 0 ? '10px 0 6px' : '0',
        flexWrap: 'wrap',
        gap: '8px',
      }}>
        {/* Logo compact */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
          <span style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: '1.5rem',
            fontWeight: 900,
            color: 'var(--text-primary)',
            letterSpacing: '-0.04em',
          }}>
            SCRABBLE
          </span>
          <span style={{
            fontFamily: "'DM Mono', monospace",
            fontSize: '0.6rem',
            color: 'var(--text-muted)',
            letterSpacing: '0.12em',
          }}>
            1972
          </span>
        </div>

        {/* Tour actuel */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          flex: 1,
          justifyContent: 'center',
        }}>
          {isAI ? (
            <>
              <div style={{
                width: '10px', height: '10px',
                border: '2px solid var(--gold)',
                borderTopColor: 'transparent',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
                flexShrink: 0,
              }} />
              <span style={{
                fontFamily: "'DM Mono', monospace",
                fontSize: '0.78rem',
                color: 'var(--gold)',
                letterSpacing: '0.08em',
              }}>
                {currentPlayer.name} réfléchit…
              </span>
            </>
          ) : (
            <span style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: '0.78rem',
              color: 'var(--text-muted)',
              letterSpacing: '0.06em',
            }}>
              Tour de{' '}
              <strong style={{ color: 'var(--tobacco)', fontWeight: 600 }}>
                {currentPlayer.name}
              </strong>
            </span>
          )}
        </div>

        {/* Tuiles restantes */}
        {settings.showRemainingTiles && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: 'var(--bg-invert)',
            borderRadius: '2px',
            padding: '4px 12px',
            border: '1.5px solid var(--border-gold)',
          }}>
            <span style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: '0.62rem',
              color: 'var(--text-invert-muted)',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
            }}>
              Sac
            </span>
            <span style={{
              fontFamily: "'Playfair Display', serif",
              fontSize: '1.1rem',
              fontWeight: 700,
              color: 'var(--gold)',
              lineHeight: 1,
            }}>
              {remaining}
            </span>
          </div>
        )}
      </div>

      {/* Timer (si activé) */}
      {settings.turnDuration > 0 && (
        <div style={{ width: '100%', paddingBottom: '8px' }}>
          <TurnTimer
            duration={settings.turnDuration}
            isActive={timerActive && !isAI}
            onExpire={onTimerExpire}
            resetRef={timerResetRef}
          />
        </div>
      )}
    </header>
  );
}