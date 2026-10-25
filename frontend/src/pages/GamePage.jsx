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
import JokerPicker           from '../components/JokerPicker';
import TurnTimer             from '../components/TurnTimer';
import { useIsMobile }       from '../hooks/useViewport';
import {
  MobileGameLayout, ScoreStrip, MobileRack, ActionButton, PlayButton, MoreMenu, StatusLine,
} from '../components/mobile/MobileGame';
import { outcomeFor } from '../utils/gameResult';
import DesktopGameLayout, { Legend } from '../components/DesktopGameLayout';

// ── ScorePreview ──────────────────────────────────────────────────

function ScorePreview({ score, count, t, tp, compact = false }) {
  if (count === 0) return null;

  // Version sur une ligne (écran de jeu ordinateur / tablette)
  if (compact) {
    return (
      <div className="dg-preview-card">
        <div className="dg-preview-text">
          <span className="dg-preview-label">{t('game_score_preview')}</span>
          <span className="dg-preview-count">{tp('game_tile', count)}</span>
        </div>
        <span className="dg-preview-score">+{score}</span>
      </div>
    );
  }

  return (
    <div style={{ background: 'var(--bg-card)', border: '2px solid var(--gold)', borderRadius: '2px', padding: '10px 16px', textAlign: 'center', boxShadow: '3px 3px 0 var(--gold)',}}>
      <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.6rem', color: 'var(--text-muted)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '4px',}}>
        {t('game_score_preview')}
      </div>
      <div style={{ fontFamily: "'Playfair Display', serif", fontSize: '2rem', fontWeight: 900, color: 'var(--gold)', lineHeight: 1,}}>
        +{score}
      </div>
      <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.6rem', color: 'var(--text-muted)', marginTop: '2px',}}>
        {tp('game_tile', count)}
      </div>
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
  const { settings, DIFFICULTY_META } = useSettings();
  const { t, tp }              = useLanguage();
  const { toasts, dismissToast, addToast } = useToast();
  const game = useGameLogic({ addToast });
  const isMobile = useIsMobile();

  // Sélection « toucher une lettre, puis une case » (écrans tactiles)
  // La sélection est liée à l'état de partie courant : elle s'annule d'elle-même
  // quand le plateau change (coup joué, tour de l'IA) ou en mode échange.
  const [rackSelection, setRackSelection] = React.useState(null); // { index, state }
  const selectedRackIndex =
    rackSelection && rackSelection.state === game.gameState && !game.isSwapMode
      ? rackSelection.index
      : null;
  const handleSelectRackTile = (index) =>
    setRackSelection(selectedRackIndex === index ? null : { index, state: game.gameState });
  const handleCellPress = (r, c) => {
    if (selectedRackIndex === null) return;
    game.handleDropTile(selectedRackIndex, r, c);
    setRackSelection(null);
  };
  const { notifyGameState } = useTutorialContext();
  const scorePreviewRef = useTutorialRef('score-preview');
  const btnValidateRef  = useTutorialRef('btn-validate');
  const btnPassRef      = useTutorialRef('btn-pass');
  const legendRef       = useTutorialRef('board-legend');

    // ── Synchronisation état jeu → tutoriel ──────────────────
  const validatedTurnsRef = React.useRef(0);
  const prevPlayerIndexRef = React.useRef(null);

  const tutoGameState   = game.gameState;
  const tutoPlacedCount = game.placements.length;
  React.useEffect(() => {
    if (!tutoGameState || !tutoGameState.players?.length) return;

    const idx = tutoGameState.current_player_index;
    if (prevPlayerIndexRef.current !== null && prevPlayerIndexRef.current !== idx) {
      validatedTurnsRef.current += 1;
    }
    prevPlayerIndexRef.current = idx;

    notifyGameState({
      placementsCount: tutoPlacedCount,
      validatedTurns:  validatedTurnsRef.current,
    });
  }, [tutoGameState, tutoPlacedCount, notifyGameState]);
  
  // ── Écran de démarrage ────────────────────────────────────────
  if (!game.gameState || game.gameState.status === 'SETUP') {
    const meta = DIFFICULTY_META?.[settings.difficulty] ?? {
      label: settings.difficulty,
      emoji: '🎮',
      desc:  '',
    };

    return (
      <div className="screen-center" style={{ minHeight: '100vh', background: 'var(--bg-page)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem',}}>
        <div className="screen-card" style={{ background: 'var(--bg-card)', border: '3px solid var(--border-primary)', borderRadius: '3px', padding: '3rem 2.5rem', maxWidth: '480px', width: '100%', boxShadow: '8px 8px 0 var(--shadow-card)', textAlign: 'center',}}>
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
    const outcome     = outcomeFor(game.gameState, humanPlayer);
    const won         = outcome === 'win';
    const draw        = outcome === 'draw';

    return (
      <div className="screen-center" style={{ minHeight: 'calc(100vh - 60px)', background: 'var(--bg-page)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem',}}>
        <div className="screen-card" style={{ background:   'var(--bg-card)', border: '3px solid var(--border-primary)', borderRadius: '3px', padding:      '3rem', maxWidth:     '480px', width:        '100%', boxShadow:    '8px 8px 0 var(--shadow-card)', textAlign:    'center',}}>
          <div style={{ fontSize: '3rem', marginBottom: '12px' }}>
            {won ? '🏆' : draw ? '🤝' : '🎩'}
          </div>
          <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: '2rem', fontWeight: 900, color: won ? 'var(--olive)' : draw ? 'var(--gold)' : 'var(--brick)', margin: '0 0 6px', }}>
            {won ? t('game_win_title') : draw ? t('game_draw_title') : t('game_lose_title')}
          </h2>
          <p style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '2rem',}}>
            {draw ? t('game_draw_sentence') : `${game.gameState.winner_name} ${t('game_wins_sentence')}`}
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

  // Valider le coup (avec confirmation si l'option est activée)
  const handleValidate = async () => {
    if (settings.confirmValidation && game.placements.length > 0) {
      const n = game.placements.length;
      const tile = tp('game_tile', game.placements.length);
      if (!window.confirm(`${t('game_confirm_play')} (${n} ${tile}) ?`)) return;
    }
    await game.handleValidateWord();
  };

  // ── Écran de jeu : téléphone (portrait ou paysage) ────────────
  if (isMobile) {
    const players     = game.gameState.players;
    const activeIndex = game.gameState.current_player_index;
    const placed      = game.placements.length;
    const showPoints  = settings.showScorePreview && placed > 0;
    const busy        = game.isAITurn;

    let statusText;
    if (busy)                           statusText = t('mg_ai_thinking', { name: players[activeIndex]?.name ?? '' });
    else if (game.isSwapMode)           statusText = tp('game_swap_count', game.selectedTilesToSwap.length);
    else if (placed > 0)                statusText = tp('game_tile', placed);
    else if (selectedRackIndex !== null) statusText = t('mg_tap_square');
    else                                statusText = t('mg_tap_letter');

    return (
      <>
        <Toast toasts={toasts} onDismiss={dismissToast} />
        <JokerPicker open={!!game.pendingJoker} onPick={game.chooseJokerLetter} onCancel={game.cancelJoker} />
        <TutorialOverlay t={t} />

        <MobileGameLayout
          top={
            <ScoreStrip
              players={players}
              activeIndex={activeIndex}
              bagCount={settings.showRemainingTiles ? (game.gameState.remaining_tiles?.length ?? 0) : null}
              bagLabel={t('mg_bag')}
              extra={<TutorialButton t={t} inline />}
              below={settings.turnDuration > 0 ? (
                <TurnTimer
                  duration={settings.turnDuration}
                  isActive={game.timerActive && !busy}
                  onExpire={game.handleTimerExpire}
                  resetRef={game.timerResetRef}
                />
              ) : null}
            />
          }
          board={
            <Board
              compact
              gameState={game.gameState}
              placements={game.placements}
              onDropTile={game.handleDropTile}
              onMoveTile={game.handleMoveTile}
              onReturnTile={game.handleReturnTile}
              onCellPress={handleCellPress}
              canPress={selectedRackIndex !== null && !game.isSwapMode}
            />
          }
          status={
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
              <StatusLine thinking={busy} points={showPoints ? game.previewScore : null} text={statusText} />
            </span>
          }
          dock={
            <>
              <MobileRack
                tiles={game.rackTilesForDisplay}
                mode={game.isSwapMode ? 'swap' : 'place'}
                disabled={busy}
                isPressed={(tile, i) => game.isSwapMode
                  ? game.selectedTilesToSwap.includes(tile.letter)
                  : selectedRackIndex === i}
                onPress={(tile, i) => game.isSwapMode
                  ? game.toggleTileForSwap(tile.letter)
                  : handleSelectRackTile(i)}
                labelFor={tile => tile.letter === '*' ? t('mg_joker') : `${tile.letter}, ${tile.score}`}
              />

              <div className="mg-actions">
                {game.isSwapMode ? (
                  <>
                    <ActionButton icon="✕" label={t('btn_cancel')} onClick={() => game.clearSwapMode()} />
                    <ActionButton
                      variant="wide"
                      icon="⇄"
                      label={`${t('btn_exchange')} (${game.selectedTilesToSwap.length})`}
                      disabled={game.selectedTilesToSwap.length === 0}
                      onClick={game.handleSwapTiles}
                    />
                  </>
                ) : (
                  <>
                    {placed > 0 ? (
                      <ActionButton icon="↺" label={t('mg_recall')} onClick={game.handleClearPlacements} />
                    ) : (
                      <ActionButton icon="→" label={t('btn_pass')} disabled={busy} onClick={game.handlePassTurn} buttonRef={btnPassRef} />
                    )}
                    <ActionButton icon="⇅" label={t('mg_shuffle')} disabled={busy || placed > 0} onClick={game.handleShuffleRack} />
                    <ActionButton icon="⇄" label={t('mg_swap')} disabled={busy || placed > 0} onClick={() => game.initSwapMode()} />
                    <MoreMenu
                      label={t('mg_more')}
                      items={[
                        { icon: '✕', label: t('game_abandon'), danger: true, onSelect: () => game.setShowAbandonModal(true) },
                      ]}
                    />
                    <PlayButton
                      label={t('mg_play')}
                      points={showPoints ? game.previewScore : null}
                      disabled={placed === 0 || busy}
                      onClick={handleValidate}
                      buttonRef={btnValidateRef}
                    />
                  </>
                )}
              </div>
            </>
          }
        />

        {game.showAbandonModal && (
          <AbandonModal
            onConfirm={game.handleAbandonConfirm}
            onCancel={() => game.setShowAbandonModal(false)}
            t={t}
          />
        )}
      </>
    );
  }

  // ── Écran de jeu : ordinateur et tablette ─────────────────────
  // Tout tient dans la fenêtre, sans défilement (styles/desktop.css) :
  //   - paysage : plateau + chevalet à gauche, scores et actions à droite ;
  //   - portrait (tablette verticale) : plateau en haut, scores et actions dessous.
  return (
    <DesktopGameLayout>

      <GameHeader
        gameState={game.gameState}
        timerActive={game.timerActive && !game.isAITurn}
        timerResetRef={game.timerResetRef}
        onTimerExpire={game.handleTimerExpire}
        actions={<TutorialButton t={t} inline />}
      />

      <Toast toasts={toasts} onDismiss={dismissToast} />
      <JokerPicker open={!!game.pendingJoker} onPick={game.chooseJokerLetter} onCancel={game.cancelJoker} />
      <TutorialOverlay t={t} />

      <div className="dg-main">

        {/* ── Plateau + chevalet ────────────────────────────── */}
        <div className="dg-play">
          <div className="dg-board" data-tutorial="board">
            <Board
              fit
              gameState={game.gameState}
              placements={game.placements}
              onDropTile={game.handleDropTile}
              onMoveTile={game.handleMoveTile}
              onReturnTile={game.handleReturnTile}
              onCellPress={handleCellPress}
              canPress={selectedRackIndex !== null && !game.isSwapMode}
            />
          </div>

          <div className="dg-below">
            <div className="dg-rack" data-tutorial="tile-rack">
              <TileRack
                tiles={game.rackTilesForDisplay}
                playerId={game.activePlayerId}
                onTileClick={game.isSwapMode ? game.toggleTileForSwap : undefined}
                selectedTiles={game.selectedTilesToSwap}
                selectedIndex={selectedRackIndex}
                onSelectTile={handleSelectRackTile}
              />
            </div>
          </div>
        </div>

        {/* ── Consigne + légende (sous la colonne de droite, ou sous le chevalet en portrait) ── */}
        <div className="dg-info">
          <div className="dg-hint">
            {game.isSwapMode
              ? tp('game_swap_count', game.selectedTilesToSwap.length)
              : t('game_drag_hint')}
          </div>
          <div ref={legendRef} className="dg-legend">
            <Legend t={t} />
          </div>
        </div>

        {/* ── Scores et actions ─────────────────────────────── */}
        <aside className="game-sidebar dg-side">
          <div className="dg-scores" data-tutorial="score-panel">
            <ScorePanel
              compact
              players={game.gameState.players}
              currentPlayerId={game.activePlayerId}
              remainingTiles={game.gameState.remaining_tiles?.length ?? 0}
            />
          </div>

          <div ref={scorePreviewRef} className="dg-preview" data-tutorial="score-preview">
            {settings.showScorePreview && (
              <ScorePreview
                compact
                score={game.previewScore}
                count={game.placements.length}
                t={t}
                tp={tp}
              />
            )}
          </div>

          <div className="dg-actions">
            {/* Valider */}
            <span ref={btnValidateRef} data-tutorial="btn-validate" style={{ display: 'contents' }}>
              <RetroButton
                variant="primary"
                fullWidth
                style={{ gridColumn: '1 / -1' }}
                disabled={game.placements.length === 0 || game.isAITurn || game.isSwapMode}
                onClick={handleValidate}
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
            <div className={game.isSwapMode ? 'dg-swap dg-swap--open' : 'dg-swap'}>
              {game.isSwapMode ? (
                <>
                  <div className="dg-swap-hint">{t('game_swap_hint')}</div>
                  <RetroButton
                    variant="danger"
                    fullWidth
                    disabled={game.selectedTilesToSwap.length === 0 || game.placements.length > 0}
                    onClick={game.handleSwapTiles}
                  >
                    {t('btn_exchange')} ({game.selectedTilesToSwap.length})
                  </RetroButton>
                  <RetroButton
                    variant="default"
                    fullWidth
                    onClick={() => game.clearSwapMode()}
                  >
                    {t('game_swap_cancel')}
                  </RetroButton>
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
            <div className="dg-resign">
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

      {/* Modal abandon */}
      {game.showAbandonModal && (
        <AbandonModal
          onConfirm={game.handleAbandonConfirm}
          onCancel={() => game.setShowAbandonModal(false)}
          t={t}
        />
      )}
    </DesktopGameLayout>
  );
}
