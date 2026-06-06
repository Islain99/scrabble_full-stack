// src/pages/GamePage.jsx
// Tout le rendu de l'écran de jeu — extrait de App.jsx.
// Consomme useGameLogic + useSettings. App.jsx n'orchestre plus que le routing.

import React from 'react';
import { useAuth }     from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { useGameLogic } from '../hooks/useGameLogic';

import GameHeader from '../components/GameHeader';
import Board      from '../components/Board';
import TileRack   from '../components/TileRack';
import ScorePanel from '../components/ScorePanel';
import RetroButton from '../components/ui/RetroButton';

// ── Sous-composants locaux ────────────────────────────────────────

function ScorePreview({ score, count }) {
  if (count === 0) return null;
  return (
    <div style={{
      background:   'var(--bg-card)',
      border:       '2px solid var(--gold)',
      borderRadius: '2px',
      padding:      '10px 16px',
      textAlign:    'center',
      boxShadow:    '3px 3px 0 var(--gold)',
    }}>
      <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.6rem', color: 'var(--text-muted)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '4px' }}>
        Aperçu du score
      </div>
      <div style={{ fontFamily: "'Playfair Display', serif", fontSize: '2rem', fontWeight: 900, color: 'var(--gold)', lineHeight: 1 }}>
        +{score}
      </div>
      <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.6rem', color: 'var(--text-muted)', marginTop: '2px' }}>
        {count} tuile{count > 1 ? 's' : ''} posée{count > 1 ? 's' : ''}
      </div>
    </div>
  );
}

function Legend() {
  const items = [
    { label: 'TM', color: '#8B2020', desc: 'Triple mot' },
    { label: 'DM', color: '#C8803A', desc: 'Double mot' },
    { label: 'TL', color: '#1A4A8A', desc: 'Triple lettre' },
    { label: 'DL', color: '#3A7EB8', desc: 'Double lettre' },
  ];
  return (
    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
      {items.map(({ label, color, desc }) => (
        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{ width: '22px', height: '22px', background: color, borderRadius: '2px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.55rem', color: '#fff', fontWeight: 700, letterSpacing: '0.05em' }}>{label}</span>
          </div>
          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.65rem', color: 'var(--text-muted)' }}>{desc}</span>
        </div>
      ))}
    </div>
  );
}

function AbandonModal({ onConfirm, onCancel }) {
  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(30,26,18,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}
      onClick={onCancel}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: 'var(--bg-page)', border: '3px solid #8B2020', borderRadius: '3px', padding: '2rem 2.4rem', maxWidth: '420px', width: '100%', boxShadow: '8px 8px 0 #8B2020', textAlign: 'center' }}
      >
        <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>🏳️</div>
        <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: '1.6rem', fontWeight: 900, color: 'var(--brick)', margin: '0 0 8px', letterSpacing: '-0.02em' }}>
          Abandonner ?
        </h2>
        <p style={{ fontFamily: "'Libre Baskerville', serif", fontSize: '0.95rem', color: 'var(--text-secondary)', fontStyle: 'italic', margin: '0 0 20px' }}>
          La partie sera comptée comme une défaite.
        </p>
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
          <RetroButton onClick={onCancel} variant="default">Continuer à jouer</RetroButton>
          <RetroButton onClick={onConfirm} variant="danger">Confirmer l'abandon</RetroButton>
        </div>
      </div>
    </div>
  );
}

// ── Page principale ───────────────────────────────────────────────

export default function GamePage() {
  const { user, isAuthenticated } = useAuth();
  const { settings, DIFFICULTY_META } = useSettings();
  const { toasts, addToast, dismissToast } = useToast();
  const game = useGameLogic({ isAuthenticated, user, autoSortRack: settings.autoSortRack, addToast });

  // ── Écran de démarrage ────────────────────────────────────────
  if (!game.gameState) {
    const meta = DIFFICULTY_META[settings.difficulty] || DIFFICULTY_META.medium;
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg-page)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
        <div style={{ background: 'var(--bg-card)', border: '3px solid var(--border-primary)', borderRadius: '3px', padding: '3rem 3.5rem', maxWidth: '520px', width: '100%', boxShadow: '8px 8px 0 var(--shadow-card)', textAlign: 'center' }}>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.65rem', letterSpacing: '0.2em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px' }}>
            Édition de Luxe — 1972
          </div>
          <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: '4rem', fontWeight: 900, letterSpacing: '-0.04em', margin: '0 0 4px', color: 'var(--text-primary)' }}>
            SCRABBLE
          </h1>
          <div style={{ height: '4px', background: 'var(--tobacco)', borderRadius: '2px', margin: '12px auto', width: '180px' }} />
          <p style={{ fontFamily: "'Libre Baskerville', serif", fontStyle: 'italic', color: 'var(--olive)', marginBottom: '2rem', fontSize: '1rem' }}>
            Le jeu classique des mots croisés
          </p>

          <div style={{ background: 'var(--bg-page-alt)', border: '2px solid var(--border-muted)', borderRadius: '2px', padding: '12px 16px', marginBottom: '2rem', textAlign: 'left' }}>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.6rem', color: 'var(--text-muted)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '6px' }}>
              Difficulté sélectionnée
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '1.4rem' }}>{meta.emoji}</span>
              <div>
                <div style={{ fontFamily: "'Playfair Display', serif", fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>{meta.label}</div>
                <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.62rem', color: 'var(--text-muted)' }}>{meta.desc}</div>
              </div>
            </div>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.6rem', color: 'var(--text-muted)', marginTop: '8px' }}>
              Modifiable dans <a href="#/settings" style={{ color: 'var(--tobacco)' }}>Paramètres</a>
            </div>
          </div>

          <RetroButton
            variant="primary"
            fullWidth
            disabled={game.isLoading}
            onClick={() => game.startGame(settings.difficulty)}
          >
            {game.isLoading ? 'Démarrage…' : '▶ Démarrer la partie'}
          </RetroButton>
        </div>
      </div>
    );
  }

  // ── Écran de fin ──────────────────────────────────────────────
  if (game.gameState.status === 'FINISHED') {
    const humanPlayer = game.gameState.players.find(p => !p.is_ai);
    const aiPlayer    = game.gameState.players.find(p => p.is_ai);
    const won         = game.gameState.winner_name === humanPlayer?.name;

    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg-page)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
        <div style={{ background: 'var(--bg-card)', border: '3px solid var(--border-primary)', borderRadius: '3px', padding: '3rem', maxWidth: '480px', width: '100%', boxShadow: '8px 8px 0 var(--shadow-card)', textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: '12px' }}>{won ? '🏆' : '🎩'}</div>
          <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: '2rem', fontWeight: 900, color: won ? 'var(--olive)' : 'var(--brick)', margin: '0 0 6px' }}>
            {won ? 'Victoire !' : 'Défaite'}
          </h2>
          <p style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '2rem' }}>
            {game.gameState.winner_name} remporte la partie
          </p>

          <ScorePanel players={game.gameState.players} currentPlayerId={-1} />

          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap', marginTop: '2rem' }}>
            <RetroButton onClick={() => game.startGame(settings.difficulty)} variant="primary">
              Rejouer
            </RetroButton>
            {isAuthenticated && (
              <RetroButton onClick={() => { window.location.hash = '#/profile'; }} variant="default">
                Mon profil
              </RetroButton>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Écran de jeu ──────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-page)' }}>

      <GameHeader
        gameState={game.gameState}
        timerActive={game.timerActive && !game.isAITurn}
        timerResetRef={game.timerResetRef}
        onTimerExpire={game.handleTimerExpire}
      />

      {/* Toast message IA */}
      <Toast toasts={toasts} onDismiss={dismissToast} />

        <div style={{ padding: 'clamp(0.75rem, 2vw, 1.5rem) clamp(0.75rem, 2vw, 2rem)', maxWidth: '1600px', margin: '0 auto', boxSizing: 'border-box' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) clamp(260px, 22vw, 340px)', gap: 'clamp(1rem, 2vw, 2rem)', alignItems: 'start' }}>

            {/* Colonne gauche : plateau + rack */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    <Board
                        gameState={game.gameState}
                        placements={game.placements}
                        onDropTile={game.handleDropTile}
                        onMoveTile={game.handleMoveTile}
                        onReturnTile={game.handleReturnTile}
                    />
                    <Legend />
                    <div style={{ marginTop: '4px' }}>
                        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.78rem', color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase', textAlign: 'center', marginBottom: '12px' }}>
                            {game.isSwapMode
                            ? `${game.selectedTilesToSwap.length} tuile(s) sélectionnée(s) pour l'échange`
                            : 'Glissez vos lettres sur le plateau'}
                        </div>
                        <TileRack
                            tiles={game.rackTilesForDisplay}
                            playerId={game.activePlayerId}
                            onTileClick={game.isSwapMode ? game.toggleTileForSwap : undefined}
                            selectedTiles={game.selectedTilesToSwap}
                        />
                    </div>
                </div>

            {/* Sidebar droite */}
            <aside style={{ display: 'flex', flexDirection: 'column', gap: '16px', position: 'sticky', top: '80px', maxHeight: 'calc(100vh - 100px)', overflowY: 'auto' }}>

                <ScorePanel players={game.gameState.players} currentPlayerId={game.activePlayerId} />

                {settings.showScorePreview && (
                <ScorePreview score={game.previewScore} count={game.placements.length} />
                )}

                {/* Actions */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <RetroButton
                    variant="primary"
                    fullWidth
                    disabled={game.placements.length === 0 || game.isAITurn || game.isSwapMode}
                    onClick={async () => {
                    if (settings.confirmValidation && game.placements.length > 0) {
                        const n = game.placements.length;
                        if (!window.confirm(`Valider ce mot (${n} tuile${n > 1 ? 's' : ''}) ?`)) return;
                    }
                    await game.handleValidateWord();
                    }}
                >
                    ✓ Valider le mot ({game.placements.length})
                </RetroButton>

                <RetroButton
                    variant="default"
                    fullWidth
                    disabled={game.placements.length > 0 || game.isAITurn || game.isSwapMode}
                    onClick={game.handlePassTurn}
                >
                    → Passer le tour
                </RetroButton>

                <RetroButton
                    variant="default"
                    fullWidth
                    disabled={game.placements.length > 0 || game.isAITurn}
                    onClick={game.handleShuffleRack}
                >
                    ⇅ Mélanger le rack
                </RetroButton>

                {/* Mode échange */}
                <div style={{ borderTop: '1px solid var(--border-muted)', paddingTop: '10px' }}>
                    {game.isSwapMode ? (
                    <>
                        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.65rem', color: 'var(--text-muted)', textAlign: 'center', marginBottom: '8px' }}>
                        Sélectionnez les lettres à échanger dans le rack
                        </div>
                        <RetroButton
                        variant="danger"
                        fullWidth
                        disabled={game.selectedTilesToSwap.length === 0 || game.placements.length > 0}
                        onClick={game.handleSwapTiles}
                        >
                        Échanger ({game.selectedTilesToSwap.length})
                        </RetroButton>
                        <div style={{ marginTop: '8px' }}>
                        <RetroButton
                            variant="default"
                            fullWidth
                            onClick={() => game.clearSwapMode()}
                        >
                            Annuler l'échange
                        </RetroButton>
                        </div>
                    </>
                    ) : (
                    <RetroButton
                        variant="tobacco"
                        fullWidth
                        disabled={game.isAITurn || game.placements.length > 0}
                        onClick={() => game.initSwapMode()}
                    >
                        ⇄ Mode échange
                    </RetroButton>
                    )}
                </div>

                {/* Abandonner */}
                <div style={{ borderTop: '1px solid rgba(139,32,32,0.2)', paddingTop: '14px', marginTop: '4px' }}>
                    <RetroButton
                    variant="danger"
                    fullWidth
                    onClick={() => game.setShowAbandonModal(true)}
                    >
                    ✕ Abandonner la partie
                    </RetroButton>
                </div>
                </div>

            </aside>
            </div>
        </div>

      {/* Modal abandon */}
      {game.showAbandonModal && (
        <AbandonModal
          onConfirm={game.handleAbandonConfirm}
          onCancel={() => game.setShowAbandonModal(false)}
        />
      )}
    </div>
  );
}