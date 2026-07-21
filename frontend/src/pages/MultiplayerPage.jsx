// src/pages/MultiplayerPage.jsx
//
// Écran unique avec 3 phases :
//   LOBBY    → créer une salle ou saisir un code pour rejoindre
//   WAITING  → hôte attend l'adversaire (affiche room_id à partager)
//   PLAYING  → plateau de jeu (réutilise Board, ScorePanel, etc.)
//
import React, { useState, useCallback, useRef } from 'react';
import { useAuth }     from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useToast }    from '../hooks/useToast';
import { useMultiplayerGame } from '../hooks/useMultiplayerGame';
import * as mpService  from '../api/multiplayerService';

import Board      from '../components/Board';
import ScorePanel from '../components/ScorePanel';
import Toast      from '../components/Toast';
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
          Multijoueur
        </h1>
        <div className="s-gold-bar" style={{ margin: '10px auto' }} />
        <MonoLabel size="sm" color="var(--text-muted)">Jouez contre un ami en temps réel</MonoLabel>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', width: '100%', maxWidth: '600px' }}>

        {/* Créer une salle */}
        <Card style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center', textAlign: 'center' }}>
          <div style={{ fontSize: '2.5rem', lineHeight: 1 }}>🎲</div>
          <div>
            <div style={{ fontFamily: "'Playfair Display', serif", fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.4rem' }}>
              Créer une partie
            </div>
            <MonoLabel size="xs" color="var(--text-muted)">
              Partagez le code à votre adversaire
            </MonoLabel>
          </div>
          <RetroButton
            variant="primary"
            onClick={onCreateRoom}
            disabled={isLoading}
            style={{ width: '100%' }}
          >
            {isLoading ? <Spinner size="sm" /> : 'Nouvelle partie'}
          </RetroButton>
        </Card>

        {/* Rejoindre une salle */}
        <Card style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center', textAlign: 'center' }}>
          <div style={{ fontSize: '2.5rem', lineHeight: 1 }}>🔗</div>
          <div>
            <div style={{ fontFamily: "'Playfair Display', serif", fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.4rem' }}>
              Rejoindre une partie
            </div>
            <MonoLabel size="xs" color="var(--text-muted)">
              Entrez le code partagé par votre ami
            </MonoLabel>
          </div>
          <input
            value={code}
            onChange={e => setCode(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleJoin()}
            placeholder="Code de la partie…"
            style={{
              width: '100%', boxSizing: 'border-box',
              padding: '0.5rem 0.75rem',
              fontFamily: "'DM Mono', monospace", fontSize: '0.85rem',
              background: 'var(--bg-page)', border: '2px solid var(--border-primary)',
              borderRadius: '4px', color: 'var(--text-primary)',
              outline: 'none',
            }}
          />
          <RetroButton
            variant="default"
            onClick={handleJoin}
            disabled={!code.trim() || joining}
            style={{ width: '100%' }}
          >
            {joining ? <Spinner size="sm" /> : 'Rejoindre'}
          </RetroButton>
        </Card>
      </div>
    </div>
  );
}

function WaitingScreen({ roomId, onCancel }) {
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
          En attente d'un adversaire…
        </div>
        <MonoLabel size="sm" color="var(--text-muted)">Partagez ce code à votre ami</MonoLabel>
      </div>

      {/* Code à partager */}
      <Card style={{ padding: '1.5rem 2.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', alignItems: 'center' }}>
        <MonoLabel size="xs" color="var(--text-muted)">CODE DE LA PARTIE</MonoLabel>
        <div
          style={{
            fontFamily: "'DM Mono', monospace", fontSize: '1rem',
            color: 'var(--gold)', letterSpacing: '0.1em',
            wordBreak: 'break-all', maxWidth: '340px',
          }}
        >
          {roomId}
        </div>
        <RetroButton variant="default" onClick={copyCode} style={{ marginTop: '0.25rem' }}>
          {copied ? '✓ Copié !' : '📋 Copier'}
        </RetroButton>
      </Card>

      <RetroButton variant="danger" onClick={onCancel}>
        Annuler
      </RetroButton>
    </div>
  );
}

// Rack simplifié (inline pour éviter une dépendance)
function SimpleRack({ tiles = [], placements = [], onTileClick, selectedForSwap = [], isSwapMode }) {
  const placed = placements.map(p => p.originalTile);
  return (
    <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', flexWrap: 'wrap' }}>
      {tiles.map((tile, i) => {
        const isPlaced = placed.includes(tile);
        const inSwap   = isSwapMode && selectedForSwap.includes(tile.letter);
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
              transform: 'none',
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

function PlayingScreen({ mp, user, roomId }) {
  const [selectedRackTile, setSelectedRackTile] = useState(null);
  const [showSwapPanel,    setShowSwapPanel]    = useState(false);
  const [confirmPass,      setConfirmPass]       = useState(false);

  const { gameState, placements, isMyTurn, availableRackTiles, previewScore,
    handleDropTile, handleMoveTile, handleReturnTile,
    handleValidateWord, handlePassTurn, handleSwapTiles,
    toggleTileForSwap, selectedTilesToSwap, isLoading } = mp;

  if (!gameState) return (
    <div style={{ padding: '3rem', textAlign: 'center' }}>
      <Spinner size="lg" />
    </div>
  );

  const currentPlayer = gameState.players[gameState.current_player_index];
  const isFinished    = gameState.status === 'FINISHED';

  const handleCellPress = (r, c) => {
    if (!selectedRackTile || !isMyTurn) return;
    handleDropTile(selectedRackTile.index, r, c);
    setSelectedRackTile(null);
  };

  const handleValidate = async () => {
    setSelectedRackTile(null);
    const { success, error } = await handleValidateWord();
    if (!success && error) {
      // toast déjà géré dans le hook
    }
  };

  // ── Écran fin de partie ───────────────────────────────────────
  if (isFinished) {
    const winner = gameState.winner_name;
    const isWinner = winner === gameState.players[mp.myPlayerIndex]?.name;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem', padding: '3rem 1rem', textAlign: 'center' }}>
        <div style={{ fontSize: '3rem' }}>{isWinner ? '🏆' : '😔'}</div>
        <div style={{ fontFamily: "'Playfair Display', serif", fontSize: '2rem', fontWeight: 900, color: 'var(--text-primary)' }}>
          {isWinner ? 'Victoire !' : 'Défaite'}
        </div>
        <div style={{ display: 'flex', gap: '2rem' }}>
          {gameState.players.map((p, i) => (
            <Card key={i} style={{ padding: '1.25rem 2rem', textAlign: 'center' }}>
              <div style={{ fontFamily: "'Playfair Display', serif", fontSize: '1.1rem', fontWeight: 700, color: p.name === winner ? 'var(--gold)' : 'var(--text-primary)' }}>
                {p.name} {p.name === winner ? '👑' : ''}
              </div>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '2rem', color: 'var(--text-primary)', marginTop: '0.25rem' }}>
                {p.score}
              </div>
            </Card>
          ))}
        </div>
        <RetroButton variant="primary" onClick={() => { window.location.hash = '#/'; }}>
          Retour à l'accueil
        </RetroButton>
      </div>
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
        borderRadius: '6px',
        transition: 'background 0.3s, border-color 0.3s',
      }}>
        <MonoLabel size="sm" color={isMyTurn ? '#fff' : 'var(--text-muted)'}>
          {isMyTurn ? '🟢 Votre tour' : `⏳ Tour de ${currentPlayer.name}…`}
        </MonoLabel>
        {previewScore > 0 && isMyTurn && (
          <MonoLabel size="sm" color="#fff">+{previewScore} pts</MonoLabel>
        )}
      </div>

      {/* Scores */}
      <ScorePanel
        players={gameState.players}
        currentPlayerId={currentPlayer.id}
        remainingTiles={(gameState.remaining_tiles ?? []).length}
      />

      {/* Plateau */}
      <Board
        gameState={gameState}
        placements={placements}
        onDropTile={handleDropTile}
        onMoveTile={handleMoveTile}
        onReturnTile={handleReturnTile}
        previewScore={previewScore}
      />

      {/* Rack */}
      <Card style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', alignItems: 'center' }}>
        <MonoLabel size="xs" color="var(--text-muted)">VOTRE CHEVALET</MonoLabel>
        <SimpleRack
          tiles={gameState.players[mp.myPlayerIndex]?.rack ?? []}
          placements={placements}
          onTileClick={(tile, idx) => setSelectedRackTile(prev => prev?.index === idx ? null : { tile, index: idx })}
          selectedForSwap={selectedTilesToSwap}
          isSwapMode={showSwapPanel}
        />
        {selectedRackTile && (
          <MonoLabel size="xs" color="var(--gold)">
            « {selectedRackTile.tile.letter} » sélectionnée — cliquez une case vide
          </MonoLabel>
        )}
      </Card>

      {/* Barre d'actions */}
      {isMyTurn && !showSwapPanel && (
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <RetroButton
            variant="primary"
            onClick={handleValidate}
            disabled={placements.length === 0 || isLoading}
            style={{ flex: 1 }}
          >
            {isLoading ? <Spinner size="sm" /> : `Valider (${placements.length})`}
          </RetroButton>
          <RetroButton
            variant="default"
            onClick={() => setConfirmPass(true)}
            disabled={placements.length > 0 || isLoading}
          >
            Passer
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
          <MonoLabel size="sm" color="var(--text-primary)">Sélectionnez les lettres à remettre dans le sac</MonoLabel>
          <SimpleRack
            tiles={gameState.players[mp.myPlayerIndex]?.rack ?? []}
            placements={[]}
            onTileClick={(tile) => toggleTileForSwap(tile.letter)}
            selectedForSwap={selectedTilesToSwap}
            isSwapMode
          />
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <RetroButton
              variant="primary"
              onClick={() => { handleSwapTiles(); setShowSwapPanel(false); }}
              disabled={selectedTilesToSwap.length === 0 || isLoading}
            >
              Échanger ({selectedTilesToSwap.length})
            </RetroButton>
            <RetroButton variant="default" onClick={() => setShowSwapPanel(false)}>
              Annuler
            </RetroButton>
          </div>
        </Card>
      )}

      {/* Confirmation passage */}
      {confirmPass && (
        <Card style={{ padding: '1.25rem', textAlign: 'center', border: '2px solid var(--border-primary)' }}>
          <div style={{ marginBottom: '1rem', fontFamily: "'Playfair Display', serif", color: 'var(--text-primary)' }}>
            Confirmez-vous le passage de tour ?
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
            <RetroButton variant="default" onClick={() => setConfirmPass(false)}>Annuler</RetroButton>
            <RetroButton variant="danger" onClick={() => { setConfirmPass(false); handlePassTurn(); }}>
              Passer le tour
            </RetroButton>
          </div>
        </Card>
      )}
    </div>
  );
}

// ── Page principale ───────────────────────────────────────────────

export default function MultiplayerPage() {
  const { user }              = useAuth();
  const { toasts, dismissToast, addToast } = useToast();

  // Phase : 'LOBBY' | 'WAITING' | 'PLAYING'
  const [phase,        setPhase]        = useState('LOBBY');
  const [roomId,       setRoomId]       = useState(null);
  const [hostUserId,   setHostUserId]   = useState(null);
  const [isCreating,   setIsCreating]   = useState(false);

  const mp = useMultiplayerGame({
    roomId:        phase === 'PLAYING' ? roomId : null,
    currentUserId: user?.id,
    hostUserId,
    addToast,
  });

  // Passer en PLAYING quand la salle devient ACTIVE (invité a rejoint)
  React.useEffect(() => {
    if (phase === 'WAITING' && mp.gameState) {
      setPhase('PLAYING');
    }
  }, [mp.gameState, phase]);

  const handleCreateRoom = useCallback(async () => {
    setIsCreating(true);
    try {
      const room = await mpService.createRoom();
      setRoomId(room.room_id);
      setHostUserId(user?.id);
      setPhase('WAITING');
    } catch (err) {
      addToast(err?.response?.data?.detail || 'Impossible de créer la salle.', 'error');
    } finally {
      setIsCreating(false);
    }
  }, [user, addToast]);

  const handleJoinRoom = useCallback(async (code) => {
    try {
      const room = await mpService.joinRoom(code);
      setRoomId(code);
      // L'invité est toujours le joueur 1 → hostUserId = l'autre
      // On le déduit de current_user_id (hôte commence toujours)
      // Le backend renvoie current_user_id = host_user_id
      setHostUserId(room.current_user_id);
      setPhase('PLAYING');
    } catch (err) {
      addToast(err?.response?.data?.detail || 'Code invalide ou salle introuvable.', 'error');
    }
  }, [addToast]);

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
      {/* Toasts */}
      <div style={{ position: 'fixed', top: '70px', right: '16px', zIndex: 200, display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {(toasts ?? []).map(t => (
          <Toast key={t.id} toast={t} onDismiss={dismissToast} />
        ))}
      </div>

      {phase === 'LOBBY' && (
        <LobbyScreen
          onCreateRoom={handleCreateRoom}
          onJoinRoom={handleJoinRoom}
          isLoading={isCreating}
        />
      )}

      {phase === 'WAITING' && (
        <WaitingScreen roomId={roomId} onCancel={handleCancelRoom} />
      )}

      {phase === 'PLAYING' && (
        <PlayingScreen mp={mp} user={user} roomId={roomId} />
      )}
    </div>
  );
}