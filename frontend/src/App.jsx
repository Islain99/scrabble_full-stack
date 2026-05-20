import React, { useState, useEffect, useMemo } from 'react';
import Board from './components/Board';
import TileRack from './components/TileRack';
import ScorePanel from './components/ScorePanel';
import * as gameService from './api/gameService';
import './index.css';
import { POINTS_LETTRES } from './data/constants';

const CLIENT_POINTS = POINTS_LETTRES;

/* ── Retro Button ─────────────────────────────────────────────── */
const RetroButton = ({ onClick, disabled, children, variant = 'default', fullWidth = false }) => {
  const variants = {
    default:  { bg: 'transparent', color: '#1E1A12', border: '#1E1A12', hover: '#1E1A12', hoverText: '#F5EDD6' },
    primary:  { bg: '#5E6B3A',     color: '#F5EDD6', border: '#3D4A20', hover: '#4A5528', hoverText: '#F5EDD6' },
    danger:   { bg: 'transparent', color: '#8B2020', border: '#8B2020', hover: '#8B2020', hoverText: '#F5EDD6' },
    tobacco:  { bg: 'transparent', color: '#8A5010', border: '#C8803A', hover: '#C8803A', hoverText: '#F5EDD6' },
  };
  const v = variants[variant] || variants.default;

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        width: fullWidth ? '100%' : 'auto',
        background: v.bg,
        color: disabled ? '#B0A080' : v.color,
        border: `2px solid ${disabled ? '#C8C0A8' : v.border}`,
        fontFamily: "'DM Mono', monospace",
        fontSize: '0.7rem',
        fontWeight: 500,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        padding: '8px 14px',
        borderRadius: '2px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'background 0.12s, color 0.12s, box-shadow 0.12s',
        boxShadow: disabled ? 'none' : `3px 3px 0 ${disabled ? '#C8C0A8' : v.border}`,
      }}
      onMouseEnter={e => {
        if (!disabled) {
          e.currentTarget.style.background = v.hover;
          e.currentTarget.style.color = v.hoverText;
        }
      }}
      onMouseLeave={e => {
        if (!disabled) {
          e.currentTarget.style.background = v.bg;
          e.currentTarget.style.color = v.color;
        }
      }}
    >
      {children}
    </button>
  );
};

/* ── Divider ─────────────────────────────────────────────────── */
const Divider = ({ label }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '14px 0 10px' }}>
    <div style={{ flex: 1, height: '1px', background: '#C8A830', opacity: 0.4 }} />
    {label && (
      <span style={{
        fontFamily: "'DM Mono', monospace",
        fontSize: '0.58rem',
        color: '#8A7E65',
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
      }}>
        {label}
      </span>
    )}
    <div style={{ flex: 1, height: '1px', background: '#C8A830', opacity: 0.4 }} />
  </div>
);

/* ── Score Preview ───────────────────────────────────────────── */
const ScorePreview = ({ score, count }) => (
  <div style={{
    background: '#1E1A12',
    border: '2px solid #C8A830',
    borderRadius: '2px',
    padding: '10px 14px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    boxShadow: '3px 3px 0 #8A6820',
  }}>
    <div>
      <div style={{
        fontFamily: "'DM Mono', monospace",
        fontSize: '0.6rem',
        color: '#8A7E65',
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        marginBottom: '2px',
      }}>
        Score provisoire
      </div>
      <div style={{
        fontFamily: "'DM Mono', monospace",
        fontSize: '0.65rem',
        color: '#6B5E45',
        letterSpacing: '0.05em',
      }}>
        {count} tuile{count !== 1 ? 's' : ''} posée{count !== 1 ? 's' : ''}
      </div>
    </div>
    <div style={{
      fontFamily: "'Playfair Display', Georgia, serif",
      fontSize: '2rem',
      fontWeight: 700,
      color: '#C8A830',
      lineHeight: 1,
    }}>
      {score}
    </div>
  </div>
);

/* ── Legend ──────────────────────────────────────────────────── */
const Legend = () => {
  const items = [
    { color: '#8B2020', label: 'Mot ×3' },
    { color: '#C8803A', label: 'Mot ×2' },
    { color: '#1A4A8A', label: 'Lettre ×3' },
    { color: '#3A7EB8', label: 'Lettre ×2' },
  ];
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
      {items.map(item => (
        <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <div style={{
            width: '10px', height: '10px',
            background: item.color,
            borderRadius: '1px',
            flexShrink: 0,
          }} />
          <span style={{
            fontFamily: "'DM Mono', monospace",
            fontSize: '0.58rem',
            color: '#8A7E65',
            letterSpacing: '0.05em',
          }}>
            {item.label}
          </span>
        </div>
      ))}
    </div>
  );
};

/* ── App ─────────────────────────────────────────────────────── */
function App() {
  const [gameState, setGameState] = useState(null);
  const [gameId, setGameId] = useState(null);
  const [currentPlayerId, setCurrentPlayerId] = useState(0);
  const [wordPlacements, setWordPlacements] = useState([]);
  const [selectedTilesToSwap, setSelectedTilesToSwap] = useState([]);

  const calculatePreviewScore = (placements) => {
    if (placements.length === 0) return 0;
    let score = 0, wordMultiplier = 1;
    placements.forEach(p => {
      let letterScore = CLIENT_POINTS[p.letter] || 0;
      const bonus = (p.r === 7 && p.c === 7) ? 'DM' : null;
      if (bonus === 'DL') letterScore *= 2;
      if (bonus === 'TL') letterScore *= 3;
      if (bonus === 'DM') wordMultiplier *= 2;
      if (bonus === 'TM') wordMultiplier *= 3;
      score += letterScore;
    });
    return score * wordMultiplier;
  };

  const previewScore = useMemo(() => calculatePreviewScore(wordPlacements), [wordPlacements]);

  useEffect(() => {
    if (!gameState || gameState.status !== 'ACTIVE' || !gameId) return;
    const currentPlayer = gameState.players[gameState.current_player_index];
    if (currentPlayer && currentPlayer.is_ai) {
      const delay = setTimeout(async () => {
        try {
          const updatedState = await gameService.aiPlayTurn(gameId);
          setGameState(updatedState);
        } catch (error) {
          console.error('Erreur lors du tour de l\'IA:', error.response?.data?.detail);
        }
      }, 1500);
      return () => clearTimeout(delay);
    }
  }, [gameState, gameId]);

  const activePlayerId = gameState
    ? gameState.players[gameState.current_player_index].id
    : 0;

  const handleStartGame = async () => {
    try {
      const playerNames = ['Joueur Humain', 'HAL 9000 (IA)'];
      const initialGame = await gameService.startGame(playerNames);
      setGameState(initialGame);
      setGameId(initialGame.game_id);
      setCurrentPlayerId(initialGame.players[0].id);
      setWordPlacements([]);
      setSelectedTilesToSwap([]);
    } catch (e) {
      console.error('Erreur au démarrage:', e);
      alert('Erreur lors du démarrage du jeu. Assurez-vous que le backend est lancé.');
    }
  };

  const handleDropTile = (tileLetter, r, c) => {
    const currentRack = gameState.players.find(p => p.id === currentPlayerId)?.rack || [];
    const availableTiles = currentRack.filter(tile => !wordPlacements.some(p => p.originalTile === tile));
    const tileToPlace = availableTiles.find(t => t.letter === tileLetter);
    if (!tileToPlace) return;
    setWordPlacements(prev => [...prev, { letter: tileLetter, r, c, originalTile: tileToPlace }]);
  };

  const handleUndoPlacement = (r, c) => {
    setWordPlacements(wordPlacements.filter(p => !(p.r === r && p.c === c)));
  };

  const handleValidateWord = async () => {
    if (!gameId || wordPlacements.length === 0) { alert('Veuillez placer un mot sur le plateau.'); return; }
    setSelectedTilesToSwap([]);
    const placementsAPI = wordPlacements.map(p => [p.r, p.c, p.letter]);
    try {
      const result = await gameService.playWord(gameId, activePlayerId, placementsAPI);
      setGameState(result);
      setWordPlacements([]);
      if (result.status === 'FINISHED') {
        alert(`Partie terminée ! Gagnant : ${result.winner_name}`);
      } else {
        setCurrentPlayerId(result.players[result.current_player_index].id);
      }
    } catch (error) {
      alert(`Erreur : ${error.response?.data?.detail || 'Mot invalide ou placement illégal.'}`);
      setWordPlacements([]);
    }
  };

  const handlePassTurn = async () => {
    if (!gameId) return;
    try {
      const updatedState = await gameService.passTurn(gameId, activePlayerId);
      setGameState(updatedState);
    } catch (error) {
      alert(`Erreur : ${error.response?.data?.detail || 'Erreur API'}`);
    }
  };

  const handleShuffleRack = async () => {
    if (!gameId) return;
    try {
      const updatedState = await gameService.shuffleRack(gameId, currentPlayerId);
      setGameState(updatedState);
    } catch (error) {
      alert(`Erreur : ${error.response?.data?.detail || 'Erreur API'}`);
    }
  };

  const handleSwapTiles = async () => {
    if (!gameId || selectedTilesToSwap.length === 0) { alert('Sélectionnez les lettres à échanger.'); return; }
    setWordPlacements([]);
    try {
      const updatedState = await gameService.swapTiles(gameId, activePlayerId, selectedTilesToSwap);
      setGameState(updatedState);
      setSelectedTilesToSwap([]);
    } catch (error) {
      alert(`Échec de l'échange : ${error.response?.data?.detail || 'Erreur API'}`);
    }
  };

  const toggleTileForSwap = (letter) => {
    setSelectedTilesToSwap(prev =>
      prev.includes(letter) ? prev.filter(l => l !== letter) : [...prev, letter]
    );
  };

  const isSwapMode = selectedTilesToSwap.length > 0;
  const currentRack = gameState?.players.find(p => p.id === activePlayerId)?.rack || [];
  const tilesInUse = wordPlacements.map(p => p.originalTile);
  const rackTilesForDisplay = currentRack.filter(tile => !tilesInUse.includes(tile));

  /* ── Start Screen ──────────────────────────────────────────── */
  if (!gameState || gameState.status === 'SETUP') {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
      }}>
        {/* Masthead */}
        <div style={{
          textAlign: 'center',
          marginBottom: '3rem',
          maxWidth: '480px',
        }}>
          <div style={{
            fontFamily: "'DM Mono', monospace",
            fontSize: '0.7rem',
            letterSpacing: '0.3em',
            color: '#8A7E65',
            textTransform: 'uppercase',
            marginBottom: '12px',
          }}>
            Édition de Luxe — 1972
          </div>
          <h1 style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: 'clamp(3.5rem, 10vw, 6rem)',
            fontWeight: 900,
            color: '#1E1A12',
            lineHeight: 0.9,
            letterSpacing: '-0.04em',
            margin: '0 0 8px',
          }}>
            SCRABBLE
          </h1>
          <div style={{
            height: '4px',
            background: 'linear-gradient(90deg, transparent, #C8803A, #C8A830, #C8803A, transparent)',
            margin: '16px auto',
            maxWidth: '300px',
          }} />
          <p style={{
            fontFamily: "'Libre Baskerville', serif",
            fontStyle: 'italic',
            color: '#5E6B3A',
            fontSize: '1rem',
            margin: 0,
          }}>
            Le jeu classique des mots croisés
          </p>
        </div>

        {/* Start button */}
        <div style={{
          border: '3px solid #1E1A12',
          padding: '2rem 3rem',
          textAlign: 'center',
          boxShadow: '6px 6px 0 #C8803A',
          background: '#F5EDD6',
          maxWidth: '360px',
          width: '100%',
        }}>
          <p style={{
            fontFamily: "'DM Mono', monospace",
            fontSize: '0.7rem',
            color: '#8A7E65',
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
            marginBottom: '20px',
          }}>
            Joueur vs IA
          </p>
          <RetroButton onClick={handleStartGame} variant="primary" fullWidth>
            Démarrer la partie
          </RetroButton>
        </div>
      </div>
    );
  }

  /* ── Finished Screen ───────────────────────────────────────── */
  if (gameState.status === 'FINISHED') {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
      }}>
        <div style={{
          border: '3px solid #1E1A12',
          padding: '2.5rem',
          background: '#F5EDD6',
          boxShadow: '8px 8px 0 #C8803A',
          maxWidth: '400px',
          width: '100%',
          textAlign: 'center',
        }}>
          <div style={{
            fontFamily: "'DM Mono', monospace",
            fontSize: '0.65rem',
            color: '#8A7E65',
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            marginBottom: '12px',
          }}>
            Partie Terminée
          </div>
          <h1 style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: '2.5rem',
            fontWeight: 900,
            color: '#1E1A12',
            margin: '0 0 4px',
          }}>
            {gameState.winner_name}
          </h1>
          <p style={{
            fontFamily: "'Libre Baskerville', serif",
            fontStyle: 'italic',
            color: '#5E6B3A',
            margin: '0 0 24px',
          }}>
            remporte la victoire
          </p>
          <div style={{ marginBottom: '24px' }}>
            <ScorePanel players={gameState.players} currentPlayerId={-1} />
          </div>
          <RetroButton onClick={handleStartGame} variant="primary" fullWidth>
            Nouvelle Partie
          </RetroButton>
        </div>
      </div>
    );
  }

  /* ── Game Screen ───────────────────────────────────────────── */
  return (
    <div style={{ minHeight: '100vh', padding: '1.5rem', maxWidth: '1280px', margin: '0 auto' }}>

      {/* Header */}
      <header style={{
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        marginBottom: '1.5rem',
        borderBottom: '3px solid #1E1A12',
        paddingBottom: '12px',
        flexWrap: 'wrap',
        gap: '8px',
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '16px' }}>
          <h1 style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: 'clamp(1.8rem, 5vw, 2.8rem)',
            fontWeight: 900,
            color: '#1E1A12',
            letterSpacing: '-0.04em',
            margin: 0,
          }}>
            SCRABBLE
          </h1>
          <span style={{
            fontFamily: "'DM Mono', monospace",
            fontSize: '0.65rem',
            color: '#8A7E65',
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
          }}>
            Édition 1972
          </span>
        </div>
        <div style={{
          fontFamily: "'DM Mono', monospace",
          fontSize: '0.65rem',
          color: '#8A7E65',
          letterSpacing: '0.1em',
        }}>
          Tour de → <span style={{ color: '#C8803A', fontWeight: 500 }}>
            {gameState.players[gameState.current_player_index]?.name}
          </span>
        </div>
      </header>

      {/* Main grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) 280px',
        gap: '1.5rem',
        alignItems: 'start',
      }}>

        {/* Board column */}
        <div>
          <Board
            gameState={gameState}
            placements={wordPlacements}
            onDropTile={handleDropTile}
            onTileClick={handleUndoPlacement}
          />
          <Legend />
        </div>

        {/* Sidebar */}
        <aside style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
          <ScorePanel
            players={gameState.players}
            currentPlayerId={currentPlayerId}
          />

          <Divider label="Coup" />

          <ScorePreview score={previewScore} count={wordPlacements.length} />

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' }}>
            <RetroButton
              onClick={handleValidateWord}
              disabled={wordPlacements.length === 0 || isSwapMode}
              variant="primary"
              fullWidth
            >
              Valider ({wordPlacements.length})
            </RetroButton>
            <RetroButton
              onClick={handlePassTurn}
              disabled={isSwapMode || wordPlacements.length > 0}
              variant="default"
              fullWidth
            >
              Passer le tour
            </RetroButton>
            <RetroButton
              onClick={handleShuffleRack}
              disabled={isSwapMode || wordPlacements.length > 0}
              variant="tobacco"
              fullWidth
            >
              Mélanger
            </RetroButton>
          </div>

          <Divider label="Échange" />

          <RetroButton
            onClick={handleSwapTiles}
            disabled={selectedTilesToSwap.length === 0 || wordPlacements.length > 0}
            variant="danger"
            fullWidth
          >
            Échanger {selectedTilesToSwap.length > 0 ? `(${selectedTilesToSwap.length})` : ''}
          </RetroButton>
          <p style={{
            fontFamily: "'DM Mono', monospace",
            fontSize: '0.58rem',
            color: '#8A7E65',
            letterSpacing: '0.06em',
            marginTop: '6px',
            lineHeight: 1.5,
          }}>
            Cliquez sur les tuiles du rack pour les sélectionner.
          </p>
        </aside>
      </div>

      {/* Rack */}
      <div style={{ marginTop: '1.5rem' }}>
        <div style={{
          fontFamily: "'DM Mono', monospace",
          fontSize: '0.65rem',
          color: '#8A7E65',
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          textAlign: 'center',
          marginBottom: '10px',
        }}>
          {isSwapMode
            ? `${selectedTilesToSwap.length} tuile(s) sélectionnée(s) — cliquez à nouveau pour désélectionner`
            : 'Glissez vos lettres sur le plateau'}
        </div>
        <TileRack
          tiles={rackTilesForDisplay}
          playerId={currentPlayerId}
          onTileClick={toggleTileForSwap}
          selectedTiles={selectedTilesToSwap}
        />
      </div>
    </div>
  );
}

export default App;