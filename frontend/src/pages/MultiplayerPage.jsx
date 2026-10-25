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
import ScorePanel from '../components/ScorePanel';
import { Toast }  from '../components/Toast';
import JokerPicker from '../components/JokerPicker';
import { useIsMobile } from '../hooks/useViewport';
import {
  MobileGameLayout, ScoreStrip, MobileRack, ActionButton, PlayButton, MoreMenu, StatusLine,
} from '../components/mobile/MobileGame';
import { Card, MonoLabel, RetroButton, Spinner } from '../components/ui';

// ── Sous-composants ───────────────────────────────────────────────

function LobbyScreen({ onCreateRoom, onJoinRoom, isLoading }) {
  const { t } = useLanguage();
  const [code, setCode] = useState('');
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
            onChange={e => setCode(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleJoin()}
            placeholder={t('mp_join_ph')}
            style={{
              width: '100%', boxSizing: 'border-box',
              padding: '0.5rem 0.75rem',
              fontFamily: "'DM Mono', monospace", fontSize: '0.85rem',
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
  const [copied, setCopied] = useState(false);

  const copyCode = () => {
    navigator.clipboard.writeText(roomId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2rem', padding: '4rem 1rem', textAlign: 'center' }}>
      <Spinner size="lg" />
      <div>
        <div style={{ fontFamily: "'Playfair Display', serif", fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
          {t('mp_waiting_title')}
        </div>
        <MonoLabel size="sm" color="var(--text-muted)">{t('mp_waiting_desc')}</MonoLabel>
      </div>

      <Card style={{ padding: '1.5rem 2.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', alignItems: 'center' }}>
        <MonoLabel size="xs" color="var(--text-muted)">{t('mp_code_label')}</MonoLabel>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '1rem', color: 'var(--gold)', letterSpacing: '0.1em', wordBreak: 'break-all', maxWidth: '340px' }}>
          {roomId}
        </div>
        <RetroButton variant="default" onClick={copyCode} style={{ marginTop: '0.25rem' }}>
          {copied ? `✓ ${t('mp_copied')}` : t('mp_copy')}
        </RetroButton>
      </Card>

      <RetroButton variant="danger" onClick={onCancel}>{t('btn_cancel')}</RetroButton>
    </div>
  );
}

// ── SimpleRack ────────────────────────────────────────────────────
//
// FIX B4 : selectedForSwap est maintenant un tableau d'indices (number[]).
//   inSwap utilise selectedForSwap.includes(i) au lieu de selectedForSwap.includes(tile.letter).
//   onTileClick reçoit (tile, i) — l'appelant décide quoi faire de l'index.
//
function SimpleRack({ tiles = [], placements = [], onTileClick, selectedForSwap = [], isSwapMode }) {
  const placed = placements.map(p => p.originalTile);
  return (
    <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', flexWrap: 'wrap' }}>
      {tiles.map((tile, i) => {
        const isPlaced = placed.includes(tile);
        // B4 : comparaison sur l'index, pas sur tile.letter
        const inSwap   = isSwapMode && selectedForSwap.includes(i);
        return (
          <button
            key={i}
            onClick={() => !isPlaced && onTileClick(tile, i)}
            disabled={isPlaced}
            style={{
              width: '44px', height: '44px', border: 'none', borderRadius: '4px',
              cursor: isPlaced ? 'default' : 'pointer',
              background: isPlaced ? 'var(--bg-page-alt)' : inSwap ? 'var(--tobacco)' : 'var(--gold)',
              opacity: isPlaced ? 0.35 : 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexDirection: 'column', gap: '1px',
              boxShadow: isPlaced ? 'none' : '2px 2px 0 rgba(0,0,0,0.3)',
              transition: 'opacity 0.15s',
            }}
          >
            <span style={{ fontFamily: "'Playfair Display', serif", fontSize: '1.1rem', fontWeight: 700, color: '#3a1a00', lineHeight: 1 }}>
              {tile.letter === '*' ? '★' : tile.letter}
            </span>
            {tile.score > 0 && (
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.5rem', color: '#5a2d00' }}>
                {tile.score}
              </span>
            )}
          </button>
        );
      })}
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1rem', maxWidth: '900px', margin: '0 auto' }}>

      {/* Bandeau tour */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0.6rem 1rem',
        background: isMyTurn ? 'var(--olive)' : 'var(--bg-card)',
        border: `2px solid ${isMyTurn ? 'var(--olive)' : 'var(--border-muted)'}`,
        borderRadius: '6px', transition: 'background 0.3s, border-color 0.3s',
      }}>
        <MonoLabel size="sm" color={isMyTurn ? '#fff' : 'var(--text-muted)'}>
          {isMyTurn ? `🟢 ${t('mp_your_turn')}` : `⏳ ${t('mg_waiting', { name: currentPlayer.name })}`}
        </MonoLabel>
        {previewScore > 0 && isMyTurn && (
          <MonoLabel size="sm" color="#fff">+{previewScore} {t('common_pts')}</MonoLabel>
        )}
      </div>

      {claimBanner(false)}
      {resignModal}

      <ScorePanel
        players={gameState.players}
        currentPlayerId={currentPlayer.id}
        remainingTiles={(gameState.remaining_tiles ?? []).length}
      />

      <JokerPicker open={!!pendingJoker} onPick={chooseJokerLetter} onCancel={cancelJoker} />

      <Board
        gameState={gameState}
        placements={placements}
        onDropTile={handleDropTile}
        onMoveTile={handleMoveTile}
        onReturnTile={handleReturnTile}
        onCellPress={handleCellPress}
        canPress={!!selectedRackTile && isMyTurn}
      />

      {/* Chevalet */}
      <Card style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', alignItems: 'center' }}>
        <MonoLabel size="xs" color="var(--text-muted)">{t('mp_your_rack')}</MonoLabel>
        <SimpleRack
          tiles={gameState.players[mp.myPlayerIndex]?.rack ?? []}
          placements={placements}
          onTileClick={(tile, idx) => setSelectedRackTile(prev => prev?.index === idx ? null : { tile, index: idx })}
          selectedForSwap={selectedTilesToSwap}
          isSwapMode={showSwapPanel}
        />
        {selectedRackTile && (
          <MonoLabel size="xs" color="var(--gold)">
            {t('mp_selected_letter', { letter: selectedRackTile.tile.letter === '*' ? '★' : selectedRackTile.tile.letter })}
          </MonoLabel>
        )}
      </Card>

      {/* Actions */}
      {isMyTurn && !showSwapPanel && (
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <RetroButton
            variant="primary"
            onClick={handleValidate}
            disabled={placements.length === 0 || isLoading}
            style={{ flex: 1 }}
          >
            {isLoading ? <Spinner size="sm" /> : `${t('btn_validate')} (${placements.length})`}
          </RetroButton>
          <RetroButton variant="default" onClick={() => setConfirmPass(true)} disabled={placements.length > 0 || isLoading}>
            {t('btn_pass')}
          </RetroButton>
          <RetroButton
            variant="tobacco"
            onClick={() => { setShowSwapPanel(true); setSelectedRackTile(null); }}
            disabled={isLoading || placements.length > 0}
          >
            ⇄
          </RetroButton>
        </div>
      )}

      {/* Panneau échange */}
      {showSwapPanel && isMyTurn && (
        <Card style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', alignItems: 'center' }}>
          <MonoLabel size="sm" color="var(--text-primary)">{t('mp_swap_hint')}</MonoLabel>
          {/* B4 : onTileClick passe l'index à toggleTileForSwap */}
          <SimpleRack
            tiles={gameState.players[mp.myPlayerIndex]?.rack ?? []}
            placements={[]}
            onTileClick={(tile, idx) => toggleTileForSwap(idx)}
            selectedForSwap={selectedTilesToSwap}
            isSwapMode
          />
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <RetroButton
              variant="primary"
              onClick={() => { handleSwapTiles(); setShowSwapPanel(false); }}
              disabled={selectedTilesToSwap.length === 0 || isLoading}
            >
              {t('btn_exchange')} ({selectedTilesToSwap.length})
            </RetroButton>
            <RetroButton variant="default" onClick={() => setShowSwapPanel(false)}>{t('btn_cancel')}</RetroButton>
          </div>
        </Card>
      )}

      {/* Abandon : possible à tout moment */}
      {!showSwapPanel && !confirmPass && (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <RetroButton variant="danger" onClick={() => setConfirmResign(true)} disabled={isLoading}>
            ✕ {t('mp_resign')}
          </RetroButton>
        </div>
      )}

      {/* Confirmation passage */}
      {confirmPass && (
        <Card style={{ padding: '1.25rem', textAlign: 'center', border: '2px solid var(--border-primary)' }}>
          <div style={{ marginBottom: '1rem', fontFamily: "'Playfair Display', serif", color: 'var(--text-primary)' }}>
            {t('mg_pass_question')}
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
            <RetroButton variant="default" onClick={() => setConfirmPass(false)}>{t('btn_cancel')}</RetroButton>
            <RetroButton variant="danger" onClick={() => { setConfirmPass(false); handlePassTurn(); }}>
              {t('mg_pass_confirm')}
            </RetroButton>
          </div>
        </Card>
      )}
    </div>
  );
}

// ── Page principale ───────────────────────────────────────────────

export default function MultiplayerPage() {
  const { user }                           = useAuth();
  const { toasts, dismissToast, addToast } = useToast();
  const { t } = useLanguage();

  const [phase,      setPhase]      = useState('CHECKING');
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
        if (room) {
          setRoomId(room.room_id);
          setHostUserId(room.host_user_id);
          setPhase(room.status === 'WAITING' ? 'WAITING' : 'PLAYING');
        } else {
          setPhase('LOBBY');
        }
      })
      .catch(() => { if (!cancelled) setPhase('LOBBY'); });
    return () => { cancelled = true; };
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
      {currentPhase === 'LOBBY'   && <LobbyScreen onCreateRoom={handleCreateRoom} onJoinRoom={handleJoinRoom} isLoading={isCreating} />}
      {currentPhase === 'WAITING' && <WaitingScreen roomId={roomId} onCancel={handleCancelRoom} />}
      {currentPhase === 'PLAYING' && <PlayingScreen mp={mp} />}
    </div>
  );
}
