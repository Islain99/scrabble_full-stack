// src/pages/MultiplayerPage.jsx
//
// Écran unique avec 4 phases :
//   CHECKING → recherche d'une salle ou d'une partie à reprendre (actualisation)
//   LOBBY    → créer une salle ou saisir un code pour rejoindre
//   WAITING  → hôte attend l'adversaire (affiche room_id à partager)
//   PLAYING  → plateau de jeu (réutilise Board, ScorePanel, etc.)
//
// FIX B1 : roomId toujours passé au hook (plus de conditional phase === 'PLAYING').
// FIX B4 : SimpleRack.selectedForSwap est maintenant un tableau d'indices (number[])
//           au lieu de lettres (string[]). inSwap utilise selectedForSwap.includes(i).
//           Le panneau d'échange passe l'index à toggleTileForSwap via onTileClick(tile, idx).
//
import React, { useState, useCallback, useEffect } from 'react';
import { useAuth }     from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useToast }    from '../hooks/useToast';
import { useMultiplayerGame } from '../hooks/useMultiplayerGame';
import { outcomeFor, isWinner } from '../utils/gameResult';
import * as mpService  from '../api/multiplayerService';

import Board      from '../components/Board';
import TileRack   from '../components/TileRack';
import DesktopGameLayout, { Legend } from '../components/DesktopGameLayout';
import ScorePanel from '../components/ScorePanel';
import { Toast }  from '../components/Toast';
import JokerPicker from '../components/JokerPicker';
import { useIsMobile } from '../hooks/useViewport';
import {
  MobileGameLayout, ScoreStrip, MobileRack, ActionButton, PlayButton, MoreMenu, StatusLine,
} from '../components/mobile/MobileGame';
import { Card, MonoLabel, RetroButton, Spinner } from '../components/ui';

// ── Code et lien d'invitation ─────────────────────────────────────

/** « ABC234 » → « ABC 234 » (lisible à voix haute). Les anciens UUID restent tels quels. */
function formatCode(code) {
  return code && code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3)}` : code;
}

/** Lien qui ouvre directement la salle : …/#/multiplayer?code=ABC234 */
function inviteLink(code) {
  const { origin, pathname } = window.location;
  return `${origin}${pathname}#/multiplayer?code=${encodeURIComponent(code)}`;
}

/** Code reçu par un lien d'invitation, ou null. */
function inviteCodeFromHash(hash) {
  const query = (hash || '').split('?')[1];
  if (!query) return null;
  const code = new URLSearchParams(query).get('code');
  return code ? code.trim() : null;
}

// ── Sous-composants ───────────────────────────────────────────────

function LobbyScreen({ onCreateRoom, onJoinRoom, isLoading, initialCode = null }) {
  const { t } = useLanguage();
  const [code, setCode] = useState(initialCode ?? '');
  const [joining, setJoining] = useState(false);

  const handleJoin = async () => {
    const trimmed = code.trim();
    if (!trimmed) return;
    setJoining(true);
    try {
      await onJoinRoom(trimmed);
    } finally {
      setJoining(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2rem', padding: '3rem 1rem' }}>
      <div style={{ textAlign: 'center' }}>
        <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: '2.2rem', fontWeight: 900, color: 'var(--text-primary)', margin: 0 }}>
          {t('nav_multiplayer')}
        </h1>
        <div className="s-gold-bar" style={{ margin: '10px auto' }} />
        <MonoLabel size="sm" color="var(--text-muted)">{t('mp_subtitle')}</MonoLabel>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem', width: '100%', maxWidth: '600px' }}>
        <Card style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center', textAlign: 'center' }}>
          <div style={{ fontSize: '2.5rem', lineHeight: 1 }}>🎲</div>
          <div>
            <div style={{ fontFamily: "'Playfair Display', serif", fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.4rem' }}>
              {t('mp_create_title')}
            </div>
            <MonoLabel size="xs" color="var(--text-muted)">{t('mp_create_desc')}</MonoLabel>
          </div>
          <RetroButton variant="primary" onClick={onCreateRoom} disabled={isLoading} style={{ width: '100%' }}>
            {isLoading ? <Spinner size="sm" /> : t('mp_create_btn')}
          </RetroButton>
        </Card>

        <Card style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center', textAlign: 'center' }}>
          <div style={{ fontSize: '2.5rem', lineHeight: 1 }}>🔗</div>
          <div>
            <div style={{ fontFamily: "'Playfair Display', serif", fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.4rem' }}>
              {t('mp_join_title')}
            </div>
            <MonoLabel size="xs" color="var(--text-muted)">{t('mp_join_desc')}</MonoLabel>
          </div>
          <input
            value={code}
            onChange={e => setCode(e.target.value.toUpperCase())}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            onKeyDown={e => e.key === 'Enter' && handleJoin()}
            placeholder={t('mp_join_ph')}
            style={{
              width: '100%', boxSizing: 'border-box',
              padding: '0.5rem 0.75rem',
              fontFamily: "'DM Mono', monospace", fontSize: '1rem', letterSpacing: '0.15em', textAlign: 'center',
              background: 'var(--bg-page)', border: '2px solid var(--border-primary)',
              borderRadius: '4px', color: 'var(--text-primary)', outline: 'none',
            }}
          />
          <RetroButton variant="default" onClick={handleJoin} disabled={!code.trim() || joining} style={{ width: '100%' }}>
            {joining ? <Spinner size="sm" /> : t('mp_join_btn')}
          </RetroButton>
        </Card>
      </div>
    </div>
  );
}

function WaitingScreen({ roomId, onCancel }) {
  const { t } = useLanguage();
  const [copied, setCopied] = useState(null);   // 'code' | 'link' | null
  const link = inviteLink(roomId);
  const canShare = typeof navigator !== 'undefined' && !!navigator.share;

  const copy = (what, text) => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(what);
      setTimeout(() => setCopied(null), 2000);
    }).catch(() => {});
  };
  const share = () => {
    navigator.share({ title: 'Scrabble', text: t('mp_share_text', { code: formatCode(roomId) }), url: link }).catch(() => {});
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2rem', padding: '3rem 1rem', textAlign: 'center' }}>
      <Spinner size="lg" />
      <div>
        <div style={{ fontFamily: "'Playfair Display', serif", fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
          {t('mp_waiting_title')}
        </div>
        <MonoLabel size="sm" color="var(--text-muted)">{t('mp_waiting_desc')}</MonoLabel>
      </div>

      <Card style={{ padding: '1.5rem 2rem', display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center', width: '100%', maxWidth: '380px', boxSizing: 'border-box' }}>
        <MonoLabel size="xs" color="var(--text-muted)">{t('mp_code_label')}</MonoLabel>
        <div data-testid="room-code" style={{ fontFamily: "'DM Mono', monospace", fontSize: roomId.length === 6 ? '2.4rem' : '1rem', fontWeight: 500, color: 'var(--gold)', letterSpacing: roomId.length === 6 ? '0.2em' : '0.1em', wordBreak: 'break-all', lineHeight: 1.1 }}>
          {formatCode(roomId)}
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
          <RetroButton variant="default" onClick={() => copy('code', roomId)}>
            {copied === 'code' ? `✓ ${t('mp_copied')}` : t('mp_copy')}
          </RetroButton>
          <RetroButton variant="default" onClick={() => copy('link', link)}>
            {copied === 'link' ? `✓ ${t('mp_copied')}` : t('mp_copy_link')}
          </RetroButton>
          {canShare && (
            <RetroButton variant="primary" onClick={share}>{t('mp_share')}</RetroButton>
          )}
        </div>
      </Card>

      <RetroButton variant="danger" onClick={onCancel}>{t('btn_cancel')}</RetroButton>
    </div>
  );
}

// ── Abandon : confirmation ────────────────────────────────────────

function ResignModal({ opponentName, onConfirm, onCancel, busy }) {
  const { t } = useLanguage();
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onCancel}
      style={{ position: 'fixed', inset: 0, background: 'rgba(30,26,18,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: 'var(--bg-page)', border: '3px solid var(--brick)', borderRadius: '3px', padding: '1.75rem 2rem', maxWidth: '420px', width: '100%', boxShadow: '8px 8px 0 var(--brick)', textAlign: 'center' }}
      >
        <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: '1.5rem', fontWeight: 900, color: 'var(--brick)', margin: '0 0 8px' }}>
          {t('mp_resign_title')}
        </h2>
        <p style={{ fontFamily: "'Libre Baskerville', serif", fontSize: '0.95rem', color: 'var(--text-secondary)', fontStyle: 'italic', margin: '0 0 20px' }}>
          {t('mp_resign_desc', { name: opponentName })}
        </p>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
          <RetroButton variant="default" onClick={onCancel}>{t('btn_cancel')}</RetroButton>
          <RetroButton variant="danger" onClick={onConfirm} disabled={busy}>{t('mp_resign_confirm')}</RetroButton>
        </div>
      </div>
    </div>
  );
}

// ── Adversaire inactif : réclamer la victoire ─────────────────────

function ClaimBanner({ name, idleMs, onClaim, busy, compact = false }) {
  const { t } = useLanguage();
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap',
      padding: compact ? '6px 10px' : '0.6rem 1rem',
      background: 'var(--bg-card)', border: '2px solid var(--tobacco)', borderRadius: '4px',
    }}>
      <MonoLabel size={compact ? 'xs' : 'sm'} color="var(--text-primary)">
        {t('mp_idle_claimable', { name, min: Math.floor(idleMs / 60000) })}
      </MonoLabel>
      <RetroButton variant="tobacco" onClick={onClaim} disabled={busy} style={compact ? { padding: '6px 10px', fontSize: '0.7rem' } : undefined}>
        {t('mp_claim_win')}
      </RetroButton>
    </div>
  );
}

// ── PlayingScreen ─────────────────────────────────────────────────

function PlayingScreen({ mp }) {
  const [selectedRackTile, setSelectedRackTile] = useState(null);
  const [showSwapPanel,    setShowSwapPanel]    = useState(false);
  const [confirmPass,      setConfirmPass]       = useState(false);
  const [confirmResign,    setConfirmResign]     = useState(false);
  const isMobile = useIsMobile();
  const { t, tp } = useLanguage();

  const {
    gameState, placements, isMyTurn, availableRackTiles, previewScore,
    handleDropTile, handleMoveTile, handleReturnTile,
    handleValidateWord, handlePassTurn, handleSwapTiles,
    toggleTileForSwap, selectedTilesToSwap, isLoading,
    pendingJoker, chooseJokerLetter, cancelJoker, handleClearPlacements,
    canClaim, opponentIdleMs, handleResign, handleClaimWin,
  } = mp;
  const closeResign = useCallback(() => setConfirmResign(false), []);

  if (!gameState) return (
    <div style={{ padding: '3rem', textAlign: 'center' }}><Spinner size="lg" /></div>
  );

  const currentPlayer = gameState.players[gameState.current_player_index];
  const isFinished    = gameState.status === 'FINISHED';
  const opponentName  = gameState.players[1 - mp.myPlayerIndex]?.name ?? '';

  const resignModal = confirmResign && (
    <ResignModal
      opponentName={opponentName}
      busy={isLoading}
      onCancel={closeResign}
      onConfirm={async () => { setConfirmResign(false); await handleResign(); }}
    />
  );
  const claimBanner = (compact) => canClaim && (
    <ClaimBanner name={opponentName} idleMs={opponentIdleMs} onClaim={handleClaimWin} busy={isLoading} compact={compact} />
  );

  const handleCellPress = (r, c) => {
    if (!selectedRackTile || !isMyTurn) return;
    // SimpleRack numérote le chevalet complet ; handleDropTile attend un index
    // dans availableRackTiles (chevalet sans les tuiles déjà posées).
    const index = availableRackTiles.indexOf(selectedRackTile.tile);
    if (index === -1) return;
    handleDropTile(index, r, c);
    setSelectedRackTile(null);
  };

  const handleValidate = async () => {
    setSelectedRackTile(null);
    await handleValidateWord();
  };

  // Fin de partie
  if (isFinished) {
    const outcome = outcomeFor(gameState, gameState.players[mp.myPlayerIndex]);
    const won  = outcome === 'win';
    const draw = outcome === 'draw';
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem', padding: '3rem 1rem', textAlign: 'center' }}>
        <div style={{ fontSize: '3rem' }}>{won ? '🏆' : draw ? '🤝' : '😔'}</div>
        <div style={{ fontFamily: "'Playfair Display', serif", fontSize: '2rem', fontWeight: 900, color: 'var(--text-primary)' }}>
          {won ? t('game_win_title') : draw ? t('game_draw_title') : t('game_lose_title')}
        </div>
        <div style={{ display: 'flex', gap: '2rem' }}>
          {gameState.players.map((p, i) => (
            <Card key={i} style={{ padding: '1.25rem 2rem', textAlign: 'center' }}>
              <div style={{ fontFamily: "'Playfair Display', serif", fontSize: '1.1rem', fontWeight: 700, color: isWinner(gameState, p) ? 'var(--gold)' : 'var(--text-primary)' }}>
                {p.name} {isWinner(gameState, p) ? '👑' : ''}
              </div>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '2rem', color: 'var(--text-primary)', marginTop: '0.25rem' }}>
                {p.score}
              </div>
            </Card>
          ))}
        </div>
        <RetroButton variant="primary" onClick={() => { window.location.hash = '#/'; }}>
          {t('mp_back_home')}
        </RetroButton>
      </div>
    );
  }

  // ── Téléphone (portrait ou paysage) ─────────────────────────────
  if (isMobile) {
    const placed = placements.length;
    let statusText;
    if (!isMyTurn)                   statusText = t('mg_waiting', { name: currentPlayer.name });
    else if (showSwapPanel)          statusText = tp('game_swap_count', selectedTilesToSwap.length);
    else if (confirmPass)            statusText = t('mg_pass_question');
    else if (placed > 0)             statusText = tp('game_tile', placed);
    else if (selectedRackTile)       statusText = t('mg_tap_square');
    else                             statusText = t('mg_tap_letter');

    return (
      <>
        <JokerPicker open={!!pendingJoker} onPick={chooseJokerLetter} onCancel={cancelJoker} />
        {resignModal}
        <MobileGameLayout
          top={
            <ScoreStrip
              players={gameState.players}
              activeIndex={gameState.current_player_index}
              bagCount={(gameState.remaining_tiles ?? []).length}
              bagLabel={t('mg_bag')}
              extra={
                <MoreMenu
                  label={t('mg_more')}
                  items={[{ icon: '✕', label: t('mp_resign'), danger: true, onSelect: () => setConfirmResign(true) }]}
                />
              }
              below={claimBanner(true)}
            />
          }
          board={
            <Board
              compact
              gameState={gameState}
              placements={placements}
              onDropTile={handleDropTile}
              onMoveTile={handleMoveTile}
              onReturnTile={handleReturnTile}
              onCellPress={handleCellPress}
              canPress={!!selectedRackTile && isMyTurn}
            />
          }
          status={
            <StatusLine
              thinking={!isMyTurn}
              points={isMyTurn && placed > 0 ? previewScore : null}
              text={statusText}
            />
          }
          dock={
            <>
              <MobileRack
                tiles={availableRackTiles}
                mode={showSwapPanel ? 'swap' : 'place'}
                disabled={!isMyTurn || isLoading}
                isPressed={(tile, i) => showSwapPanel
                  ? selectedTilesToSwap.includes(i)
                  : selectedRackTile?.tile === tile}
                onPress={(tile, i) => showSwapPanel
                  ? toggleTileForSwap(i)
                  : setSelectedRackTile(prev => (prev?.tile === tile ? null : { tile, index: i }))}
                labelFor={tile => tile.letter === '*' ? t('mg_joker') : `${tile.letter}, ${tile.score}`}
              />

              <div className="mg-actions">
                {showSwapPanel ? (
                  <>
                    <ActionButton icon="✕" label={t('btn_cancel')} onClick={() => setShowSwapPanel(false)} />
                    <ActionButton
                      variant="wide"
                      icon="⇄"
                      label={`${t('btn_exchange')} (${selectedTilesToSwap.length})`}
                      disabled={selectedTilesToSwap.length === 0 || isLoading}
                      onClick={() => { handleSwapTiles(); setShowSwapPanel(false); }}
                    />
                  </>
                ) : confirmPass ? (
                  <>
                    <ActionButton icon="✕" label={t('btn_cancel')} onClick={() => setConfirmPass(false)} />
                    <ActionButton
                      variant="danger"
                      icon="→"
                      label={t('mg_pass_confirm')}
                      onClick={() => { setConfirmPass(false); handlePassTurn(); }}
                    />
                  </>
                ) : (
                  <>
                    {placed > 0 ? (
                      <ActionButton icon="↺" label={t('mg_recall')} onClick={handleClearPlacements} />
                    ) : (
                      <ActionButton icon="→" label={t('btn_pass')} disabled={!isMyTurn || isLoading} onClick={() => setConfirmPass(true)} />
                    )}
                    <ActionButton
                      icon="⇄"
                      label={t('mg_swap')}
                      disabled={!isMyTurn || isLoading || placed > 0}
                      onClick={() => { setShowSwapPanel(true); setSelectedRackTile(null); }}
                    />
                    <PlayButton
                      label={isLoading ? '…' : t('mg_play')}
                      points={placed > 0 ? previewScore : null}
                      disabled={placed === 0 || isLoading || !isMyTurn}
                      onClick={handleValidate}
                    />
                  </>
                )}
              </div>
            </>
          }
        />
      </>
    );
  }

  // ── Ordinateur et tablette : même disposition plein écran que le solo ─
  const placed     = placements.length;
  const myRack     = gameState.players[mp.myPlayerIndex]?.rack ?? [];
  const rackTiles  = showSwapPanel ? myRack : availableRackTiles;
  const selIndex   = selectedRackTile ? availableRackTiles.indexOf(selectedRackTile.tile) : -1;
  const busy       = isLoading || !isMyTurn;
  const hint = !isMyTurn
    ? t('mg_waiting', { name: currentPlayer.name })
    : showSwapPanel
      ? tp('game_swap_count', selectedTilesToSwap.length)
      : t('game_drag_hint');

  return (
    <DesktopGameLayout>
      <JokerPicker open={!!pendingJoker} onPick={chooseJokerLetter} onCancel={cancelJoker} />
      {resignModal}

      <header className="game-header mp-header" style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
        padding: '0 24px', height: '58px',
        borderBottom: '3px solid var(--border-primary)', background: 'var(--bg-card)',
      }}>
        <span style={{
          fontFamily: "'DM Mono', monospace", fontSize: '0.78rem', letterSpacing: '0.08em',
          color: isMyTurn ? 'var(--olive)' : 'var(--text-muted)', fontWeight: isMyTurn ? 600 : 400,
        }}>
          {isMyTurn ? `● ${t('mp_your_turn')}` : `⏳ ${t('mg_waiting', { name: currentPlayer.name })}`}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--bg-invert)', borderRadius: '2px', padding: '4px 12px', border: '1.5px solid var(--border-gold)' }}>
          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.62rem', color: 'var(--text-invert-muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            {t('mg_bag')}
          </span>
          <span style={{ fontFamily: "'Playfair Display', serif", fontSize: '1.1rem', fontWeight: 700, color: 'var(--gold)', lineHeight: 1 }}>
            {(gameState.remaining_tiles ?? []).length}
          </span>
        </div>
      </header>

      <div className="dg-main">
        <div className="dg-play">
          <div className="dg-board">
            <Board
              fit
              gameState={gameState}
              placements={placements}
              onDropTile={handleDropTile}
              onMoveTile={handleMoveTile}
              onReturnTile={handleReturnTile}
              onCellPress={handleCellPress}
              canPress={!!selectedRackTile && isMyTurn && !showSwapPanel}
            />
          </div>
          <div className="dg-below">
            <div className="dg-rack">
              <TileRack
                tiles={rackTiles}
                playerId={mp.myPlayerIndex}
                selectByIndex
                onTileClick={showSwapPanel ? toggleTileForSwap : undefined}
                selectedTiles={selectedTilesToSwap}
                selectedIndex={selIndex >= 0 ? selIndex : null}
                onSelectTile={isMyTurn ? (i => setSelectedRackTile(prev => (
                  prev?.tile === availableRackTiles[i] ? null : { tile: availableRackTiles[i], index: i }
                ))) : undefined}
              />
            </div>
          </div>
        </div>

        <div className="dg-info">
          <div className="dg-hint">{hint}</div>
          <div className="dg-legend"><Legend t={t} /></div>
        </div>

        <aside className="game-sidebar dg-side">
          {claimBanner(true)}

          <div className="dg-scores">
            <ScorePanel
              compact
              players={gameState.players}
              currentPlayerId={currentPlayer.id}
              remainingTiles={(gameState.remaining_tiles ?? []).length}
            />
          </div>

          <div className="dg-preview">
            {isMyTurn && placed > 0 && (
              <div className="dg-preview-card">
                <div className="dg-preview-text">
                  <span className="dg-preview-label">{t('game_score_preview')}</span>
                  <span className="dg-preview-count">{tp('game_tile', placed)}</span>
                </div>
                <span className="dg-preview-score">+{previewScore}</span>
              </div>
            )}
          </div>

          <div className="dg-actions">
            <RetroButton
              variant="primary"
              fullWidth
              style={{ gridColumn: '1 / -1' }}
              disabled={placed === 0 || busy || showSwapPanel}
              onClick={handleValidate}
            >
              {isLoading ? '…' : `✓ ${t('btn_validate')} (${placed})`}
            </RetroButton>

            <RetroButton variant="default" fullWidth disabled={placed > 0 || busy || showSwapPanel} onClick={handlePassTurn}>
              → {t('btn_pass')}
            </RetroButton>

            <RetroButton variant="default" fullWidth disabled={placed === 0 || isLoading} onClick={handleClearPlacements}>
              ↺ {t('mg_recall')}
            </RetroButton>

            <div className={showSwapPanel ? 'dg-swap dg-swap--open' : 'dg-swap'}>
              {showSwapPanel ? (
                <>
                  <div className="dg-swap-hint">{t('game_swap_hint')}</div>
                  <RetroButton
                    variant="danger"
                    fullWidth
                    disabled={selectedTilesToSwap.length === 0 || busy}
                    onClick={() => { handleSwapTiles(); setShowSwapPanel(false); }}
                  >
                    {t('btn_exchange')} ({selectedTilesToSwap.length})
                  </RetroButton>
                  <RetroButton variant="default" fullWidth onClick={() => setShowSwapPanel(false)}>
                    {t('game_swap_cancel')}
                  </RetroButton>
                </>
              ) : (
                <RetroButton
                  variant="tobacco"
                  fullWidth
                  disabled={busy || placed > 0}
                  onClick={() => { setShowSwapPanel(true); setSelectedRackTile(null); }}
                >
                  ⇄ {t('game_swap_mode')}
                </RetroButton>
              )}
            </div>

            <div className="dg-resign">
              <RetroButton variant="danger" fullWidth disabled={isLoading} onClick={() => setConfirmResign(true)}>
                ✕ {t('mp_resign')}
              </RetroButton>
            </div>
          </div>
        </aside>
      </div>
    </DesktopGameLayout>
  );
}

// ── Page principale ───────────────────────────────────────────────

export default function MultiplayerPage() {
  const { user }                           = useAuth();
  const { toasts, dismissToast, addToast } = useToast();
  const { t } = useLanguage();

  const [phase,      setPhase]      = useState('CHECKING');
  // Code reçu par un lien d'invitation (#/multiplayer?code=ABC234), lu une fois
  const [inviteCode] = useState(() => inviteCodeFromHash(window.location.hash));
  const [roomId,     setRoomId]     = useState(null);
  const [hostUserId, setHostUserId] = useState(null);
  const [isCreating, setIsCreating] = useState(false);

  // FIX B1 : roomId toujours passé (pas de conditional phase === 'PLAYING').
  // Pendant LOBBY, roomId est null — le hook fait `if (!roomId) return` sans effet.
  const mp = useMultiplayerGame({
    roomId,
    currentUserId: user?.id,
    hostUserId,
    addToast,
  });

  // Reprise après une actualisation : salle en attente ou partie en cours (R1)
  useEffect(() => {
    let cancelled = false;
    mpService.getCurrentRoom()
      .then((room) => {
        if (cancelled) return;
        // Une partie en cours passe avant l'invitation
        if (room && (room.status === 'ACTIVE' || !inviteCode)) {
          setRoomId(room.room_id);
          setHostUserId(room.host_user_id);
          setPhase(room.status === 'WAITING' ? 'WAITING' : 'PLAYING');
        } else if (inviteCode) {
          // Lien d'invitation : on rejoint directement, puis on nettoie l'adresse
          window.history.replaceState(null, '', '#/multiplayer');
          mpService.joinRoom(inviteCode)
            .then((joined) => {
              if (cancelled) return;
              setRoomId(joined.room_id);
              setHostUserId(joined.host_user_id);
              setPhase('PLAYING');
            })
            .catch((err) => {
              if (cancelled) return;
              addToast(err?.response?.data?.detail || t('mp_join_error'), 'error');
              setPhase('LOBBY');
            });
        } else {
          setPhase('LOBBY');
        }
      })
      .catch(() => { if (!cancelled) setPhase('LOBBY'); });
    return () => { cancelled = true; };
    // Une seule fois au chargement de la page
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Passage WAITING → PLAYING dès que l'invité rejoint (RTDB pousse le game_state)
  const currentPhase = phase === 'WAITING' && mp.gameState ? 'PLAYING' : phase;

  const handleCreateRoom = useCallback(async () => {
    setIsCreating(true);
    try {
      const room = await mpService.createRoom();
      setRoomId(room.room_id);
      setHostUserId(user?.id);
      setPhase('WAITING');
    } catch (err) {
      addToast(err?.response?.data?.detail || t('mp_create_error'), 'error');
    } finally {
      setIsCreating(false);
    }
  }, [user, addToast, t]);

  const handleJoinRoom = useCallback(async (code) => {
    try {
      const room = await mpService.joinRoom(code);
      setRoomId(room.room_id ?? code);
      setHostUserId(room.host_user_id ?? room.current_user_id);
      setPhase('PLAYING');
    } catch (err) {
      addToast(err?.response?.data?.detail || t('mp_join_error'), 'error');
    }
  }, [addToast, t]);

  const handleCancelRoom = useCallback(async () => {
    if (roomId) {
      try { await mpService.cancelRoom(roomId); } catch { /* silencieux */ }
    }
    setPhase('LOBBY');
    setRoomId(null);
    setHostUserId(null);
  }, [roomId]);

  return (
    <div className="s-page">
      {/* Toast affiche lui-même la pile (avant : un Toast par message avec une
          prop `toast` inexistante → plantage de la page au premier message) */}
      <Toast toasts={toasts} onDismiss={dismissToast} />

      {currentPhase === 'CHECKING' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', padding: '4rem 1rem' }}>
          <Spinner size="lg" />
          <MonoLabel size="sm" color="var(--text-muted)">{t('mp_resuming')}</MonoLabel>
        </div>
      )}
      {currentPhase === 'LOBBY'   && <LobbyScreen onCreateRoom={handleCreateRoom} onJoinRoom={handleJoinRoom} isLoading={isCreating} initialCode={inviteCode} />}
      {currentPhase === 'WAITING' && <WaitingScreen roomId={roomId} onCancel={handleCancelRoom} />}
      {currentPhase === 'PLAYING' && <PlayingScreen mp={mp} />}
    </div>
  );
}
