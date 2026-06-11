// src/pages/GamePage.jsx
import React from 'react';
import { useAuth }      from '../context/AuthContext';
import { useSettings }  from '../context/SettingsContext';
import { useLanguage }  from '../context/LanguageContext';
import { useGameLogic } from '../hooks/useGameLogic';

import GameHeader  from '../components/GameHeader';
import Board       from '../components/Board';
import TileRack    from '../components/TileRack';
import ScorePanel  from '../components/ScorePanel';
import RetroButton from '../components/ui/RetroButton';
import { useToast } from '../hooks/useToast';
import { Toast }   from '../components/Toast';
import { useTutorialContext, useTutorialRef } from '../context/TutorialContext';
import TutorialOverlay       from '../components/TutorialOverlay';
import TutorialButton        from '../components/TutorialButton';

// ── ScorePreview ──────────────────────────────────────────────────

function ScorePreview({ score, count, t }) {
  if (count === 0) return null;
  const tile  = count > 1 ? t('game_tiles_plural')   : t('game_tiles_singular');
  const placed = count > 1 ? t('game_placed_plural') : t('game_placed_singular');
  return (
    <div style={{ background: 'var(--bg-card)', border: '2px solid var(--gold)', borderRadius: '2px', padding: '10px 16px', textAlign: 'center', boxShadow: '3px 3px 0 var(--gold)',}}>
      <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.6rem', color: 'var(--text-muted)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '4px',}}>
        {t('game_score_preview')}
      </div>
      <div style={{ fontFamily: "'Playfair Display', serif", fontSize: '2rem', fontWeight: 900, color: 'var(--gold)', lineHeight: 1,}}>
        +{score}
      </div>
      <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.6rem', color: 'var(--text-muted)', marginTop: '2px',}}>
        {count} {tile} {placed}
      </div>
    </div>
  );
}

// ── Legend ────────────────────────────────────────────────────────

function Legend({ t }) {
  const items = [
    { label: 'TM', color: '#8B2020', key: 'legend_tw' },
    { label: 'DM', color: '#C8803A', key: 'legend_dw' },
    { label: 'TL', color: '#1A4A8A', key: 'legend_tl' },
    { label: 'DL', color: '#3A7EB8', key: 'legend_dl' },
  ];
  return (
    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
      {items.map(({ label, color, key }) => (
        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{ width: '22px', height: '22px', background: color, borderRadius: '2px', display: 'flex', alignItems: 'center', justifyContent: 'center',}}>
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.55rem', color: '#fff', fontWeight: 700, letterSpacing: '0.05em',}}>
              {label}
            </span>
          </div>
          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.65rem', color: 'var(--text-muted)',}}>
            {t(key)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── AbandonModal ──────────────────────────────────────────────────

function AbandonModal({ onConfirm, onCancel, t }) {
  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(30,26,18,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,padding: '1rem',}}
      onClick={onCancel}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: 'var(--bg-page)', border: '3px solid #8B2020', borderRadius: '3px', padding: '2rem 2.4rem', maxWidth: '420px', width: '100%', boxShadow: '8px 8px 0 #8B2020', textAlign: 'center',}}
      >
        <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>🏳️</div>
        <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: '1.6rem', fontWeight: 900, color: 'var(--brick)', margin: '0 0 8px', letterSpacing: '-0.02em',}}>
          {t('game_abandon_title')}
        </h2>
        <p style={{ fontFamily: "'Libre Baskerville', serif", fontSize: '0.95rem', color: 'var(--text-secondary)', fontStyle: 'italic', margin: '0 0 20px',}}>
          {t('game_abandon_desc')}
        </p>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
          <RetroButton variant="default" onClick={onCancel}>
            {t('btn_cancel')}
          </RetroButton>
          <RetroButton variant="danger" onClick={onConfirm}>
            {t('game_abandon_confirm')}
          </RetroButton>
        </div>
      </div>
    </div>
  );
}

// ── GamePage ──────────────────────────────────────────────────────

export default function GamePage() {
  const { isAuthenticated }    = useAuth();
  const { settings }           = useSettings();
  const { t, tp, language }        = useLanguage();
  const { toasts, dismissToast, addToast } = useToast();
  const game = useGameLogic({ addToast });
  const { notifyGameState } = useTutorialContext();
  const scorePreviewRef = useTutorialRef('score-preview');
  const btnValidateRef  = useTutorialRef('btn-validate');
  const btnPassRef      = useTutorialRef('btn-pass');
  const legendRef       = useTutorialRef('board-legend');

    // ── Synchronisation état jeu → tutoriel ──────────────────
  const validatedTurnsRef = React.useRef(0);
  const prevPlayerIndexRef = React.useRef(null);

  React.useEffect(() => {
    if (!game.gameState) return;
    // Détecter un changement de joueur (= un coup validé ou passé)
    const idx = game.gameState.current_player_index;
    if (prevPlayerIndexRef.current !== null && prevPlayerIndexRef.current !== idx) {
      validatedTurnsRef.current += 1;
    }
    prevPlayerIndexRef.current = idx;

    notifyGameState({
      placementsCount: game.placements.length,
      validatedTurns:  validatedTurnsRef.current,
    });
  }, [game.gameState, game.placements.length, notifyGameState]);
  
  // ── Écran de démarrage ────────────────────────────────────────
  if (!game.gameState || game.gameState.status === 'SETUP') {
    const { DIFFICULTY_META } = useSettings ? settings : {};
    // Import local pour éviter un hook conditionnel
    const meta = (settings._DIFFICULTY_META ?? {})[settings.difficulty] ?? {
      label: settings.difficulty,
      emoji: '🎮',
      desc:  '',
    };

    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg-page)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem',}}>
        <div style={{ background: 'var(--bg-card)', border: '3px solid var(--border-primary)', borderRadius: '3px', padding: '3rem 2.5rem', maxWidth: '480px', width: '100%', boxShadow: '8px 8px 0 var(--shadow-card)', textAlign: 'center',}}>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.6rem', color: 'var(--text-muted)', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: '6px',}}>
            {t('start_edition')}
          </div>
          <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 'clamp(2.5rem, 6vw, 4rem)', fontWeight: 900, color: 'var(--text-primary)', letterSpacing: '-0.04em', margin: '0 0 4px',}}>
            SCRABBLE
          </h1>
          <div style={{ height: '3px', background: 'var(--gold)', margin: '8px auto 12px', width: '60px',}} />
          <p style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.7rem', color: 'var(--text-muted)', letterSpacing: '0.1em', marginBottom: '2rem',}}>
            {t('start_subtitle')}
          </p>

          {/* Difficulté courante */}
          <div style={{ background: 'var(--bg-page-alt)', border: '1px solid var(--border-muted)', borderRadius: '2px', padding: '12px 16px', marginBottom: '1.5rem', textAlign: 'left',}}>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.6rem', color: 'var(--text-muted)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '6px',}}>
              {t('row_difficulty')}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '1.4rem' }}>{meta.emoji}</span>
              <div>
                <div style={{ fontFamily: "'Playfair Display', serif", fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)',}}>
                  {t(`diff_${settings.difficulty}_label`)}
                </div>
                <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.62rem', color: 'var(--text-muted)',}}>
                  {t(`diff_${settings.difficulty}_desc`)}
                </div>
              </div>
            </div>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.6rem', color: 'var(--text-muted)', marginTop: '8px',}}>
              {t('start_change_in')}{' '}
              <a href="#/settings" style={{ color: 'var(--tobacco)' }}>
                {t('nav_settings')}
              </a>
            </div>
          </div>

          <RetroButton
            variant="primary"
            fullWidth
            disabled={game.isLoading}
            onClick={() => game.startGame(settings.difficulty)}
          >
            {game.isLoading ? t('start_loading') : `▶ ${t('start_btn')}`}
          </RetroButton>
        </div>
      </div>
    );
  }

  // ── Écran de fin ──────────────────────────────────────────────
  if (game.gameState.status === 'FINISHED') {
    const humanPlayer = game.gameState.players.find(p => !p.is_ai);
    const won         = game.gameState.winner_name === humanPlayer?.name;

    return (
      <div style={{ minHeight: 'calc(100vh - 60px)', background: 'var(--bg-page)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem',}}>
        <div style={{ background:   'var(--bg-card)', border: '3px solid var(--border-primary)', borderRadius: '3px', padding:      '3rem', maxWidth:     '480px', width:        '100%', boxShadow:    '8px 8px 0 var(--shadow-card)', textAlign:    'center',}}>
          <div style={{ fontSize: '3rem', marginBottom: '12px' }}>
            {won ? '🏆' : '🎩'}
          </div>
          <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: '2rem', fontWeight: 900, color: won ? 'var(--olive)' : 'var(--brick)', margin: '0 0 6px', }}>
            {won ? t('game_win_title') : t('game_lose_title')}
          </h2>
          <p style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '2rem',}}>
            {game.gameState.winner_name} {t('game_wins_sentence')}
          </p>

          <ScorePanel
            players={game.gameState.players}
            currentPlayerId={-1}
          />

          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap', marginTop: '2rem', }}>
            <RetroButton
              onClick={() => game.startGame(settings.difficulty)}
              variant="primary"
            >
              {t('game_replay')}
            </RetroButton>
            {isAuthenticated && (
              <RetroButton
                onClick={() => { window.location.hash = '#/profile'; }}
                variant="default"
              >
                {t('game_my_profile')}
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

      <Toast toasts={toasts} onDismiss={dismissToast} />
      <TutorialOverlay t={t} />
      <TutorialButton t={t} />

      <div style={{ padding: 'clamp(0.75rem, 2vw, 1.5rem) clamp(0.75rem, 2vw, 2rem)', maxWidth: '1600px', margin: '0 auto', boxSizing: 'border-box',}}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) clamp(260px, 22vw, 340px)', gap: 'clamp(1rem, 2vw, 2rem)', alignItems: 'start',}}>

          {/* ── Colonne gauche : plateau + rack ─────────────── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div data-tutorial="board" style={{ width: '100%' }}>
              <Board
                gameState={game.gameState}
                placements={game.placements}
                onDropTile={game.handleDropTile}
                onMoveTile={game.handleMoveTile}
                onReturnTile={game.handleReturnTile}
              />
            </div>

            <div ref={legendRef}>
              <Legend t={t} />
            </div>

            <div style={{ marginTop: '4px' }}>
              {/* Instruction contextuelle */}
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.78rem', color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase', textAlign: 'center', marginBottom: '12px', }}>
                {game.isSwapMode
                  ? tp('game_swap_count', game.selectedTilesToSwap.length)
                  : t('game_drag_hint')}
              </div>

              <div data-tutorial="tile-rack">
                <TileRack
                  tiles={game.rackTilesForDisplay}
                  playerId={game.activePlayerId}
                  onTileClick={game.isSwapMode ? game.toggleTileForSwap : undefined}
                  selectedTiles={game.selectedTilesToSwap}
                />
              </div>
            </div>
          </div>

          {/* ── Sidebar droite ──────────────────────────────── */}
          <aside style={{ display: 'flex', flexDirection: 'column', gap: '16px', position: 'sticky', top: '80px', maxHeight: 'calc(100vh - 100px)', overflowY: 'auto', }}>
            <div data-tutorial="score-panel">
              <ScorePanel
                players={game.gameState.players}
                currentPlayerId={game.activePlayerId}
              />
            </div>

            <div ref={scorePreviewRef} data-tutorial="score-preview">
              {settings.showScorePreview && (
                <ScorePreview
                  score={game.previewScore}
                  count={game.placements.length}
                  t={t}
                />
              )}
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>

              {/* Valider */}
                <span ref={btnValidateRef} data-tutorial="btn-validate" style={{ display: 'contents' }}>
                  <RetroButton
                    variant="primary"
                    fullWidth
                    disabled={game.placements.length === 0 || game.isAITurn || game.isSwapMode}
                    onClick={async () => {
                      if (settings.confirmValidation && game.placements.length > 0) {
                        const n = game.placements.length;
                        const tile = tp('game_tile', game.placements.length);
                        if (!window.confirm(`${t('game_confirm_play')} (${n} ${tile}) ?`)) return;
                      }
                      await game.handleValidateWord();
                    }}
                  >
                    ✓ {t('btn_validate')} ({game.placements.length})
                  </RetroButton>
                </span>

              {/* Passer */}
              <span ref={btnPassRef} data-tutorial="btn-pass" style={{ display: 'contents' }}>
                <RetroButton
                  variant="default"
                  fullWidth
                  disabled={game.placements.length > 0 || game.isAITurn || game.isSwapMode}
                  onClick={game.handlePassTurn}
                >
                  → {t('btn_pass')}
                </RetroButton>
              </span>

              {/* Mélanger */}
              <RetroButton
                variant="default"
                fullWidth
                disabled={game.placements.length > 0 || game.isAITurn}
                onClick={game.handleShuffleRack}
              >
                ⇅ {t('game_shuffle')}
              </RetroButton>

              {/* Mode échange */}
              <div style={{ borderTop: '1px solid var(--border-muted)', paddingTop: '10px', }}>
                {game.isSwapMode ? (
                  <>
                    <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.65rem', color: 'var(--text-muted)', textAlign: 'center', marginBottom: '8px',}}>
                      {t('game_swap_hint')}
                    </div>
                    <RetroButton
                      variant="danger"
                      fullWidth
                      disabled={game.selectedTilesToSwap.length === 0 || game.placements.length > 0}
                      onClick={game.handleSwapTiles}
                    >
                      {t('btn_exchange')} ({game.selectedTilesToSwap.length})
                    </RetroButton>
                    <div style={{ marginTop: '8px' }}>
                      <RetroButton
                        variant="default"
                        fullWidth
                        onClick={() => game.clearSwapMode()}
                      >
                        {t('game_swap_cancel')}
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
                    ⇄ {t('game_swap_mode')}
                  </RetroButton>
                )}
              </div>

              {/* Abandonner */}
              <div style={{ borderTop:  '1px solid rgba(139,32,32,0.2)', paddingTop: '14px', marginTop:  '4px',}}>
                <RetroButton
                  variant="danger"
                  fullWidth
                  onClick={() => game.setShowAbandonModal(true)}
                >
                  ✕ {t('game_abandon')}
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
          t={t}
        />
      )}
    </div>
  );
}