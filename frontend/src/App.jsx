// src/App.jsx
import React, { useState, useEffect, useMemo } from 'react';
import Board from './components/Board';
import TileRack from './components/TileRack';
import ScorePanel from './components/ScorePanel';
import * as gameService from './api/gameService';
import './index.css';
import { POINTS_LETTRES } from './data/constants';

const CLIENT_POINTS = POINTS_LETTRES;

// ---------------------------------------------------------------------------
// Configuration des niveaux (miroir du backend, pour l'UX)
// ---------------------------------------------------------------------------

const DIFFICULTY_CONFIG = {
    beginner: {
        label: 'Débutant',
        emoji: '🐣',
        description: "Joue des mots de 2-3 lettres et commet beaucoup d'erreurs.",
        delayMs: 600,
        color: 'from-slate-400 to-gray-500',
        border: 'border-slate-400',
        badge: 'bg-slate-100 text-slate-700',
    },
    easy: {
        label: 'Facile',
        emoji: '🟢',
        description: "Mots courts (max 4 lettres), ignore les cases bonus.",
        delayMs: 1000,
        color: 'from-green-500 to-emerald-600',
        border: 'border-green-400',
        badge: 'bg-green-100 text-green-800',
    },
    medium: {
        label: 'Moyen',
        emoji: '🟡',
        description: "Équilibré : exploite les bonus DL/DM, mots jusqu'à 7 lettres.",
        delayMs: 1600,
        color: 'from-yellow-500 to-amber-600',
        border: 'border-yellow-400',
        badge: 'bg-yellow-100 text-yellow-800',
    },
    hard: {
        label: 'Expert',
        emoji: '🔴',
        description: "Analyse toutes les options et maximise chaque score.",
        delayMs: 2400,
        color: 'from-red-500 to-rose-600',
        border: 'border-red-400',
        badge: 'bg-red-100 text-red-800',
    },
};

// ---------------------------------------------------------------------------
// Calcul preview score (côté client, simplifié)
// ---------------------------------------------------------------------------

function calculatePreviewScore(placements) {
    if (!placements.length) return 0;
    let score = 0;
    let wordMultiplier = 1;
    placements.forEach(p => {
        const letterScore = CLIENT_POINTS[p.letter] || 0;
        const bonus = (p.r === 7 && p.c === 7) ? 'DM' : null;
        score += bonus === 'DL' ? letterScore * 2 : bonus === 'TL' ? letterScore * 3 : letterScore;
        if (bonus === 'DM') wordMultiplier *= 2;
        if (bonus === 'TM') wordMultiplier *= 3;
    });
    return score * wordMultiplier;
}

// ---------------------------------------------------------------------------
// Composant : Écran de sélection du niveau
// ---------------------------------------------------------------------------

function DifficultyScreen({ onStart }) {
    const [selected, setSelected] = useState('medium');
    const [playerName, setPlayerName] = useState('Joueur 1');

    return (
        <div className="min-h-screen bg-gray-950 flex items-center justify-center p-6">
            <div className="max-w-lg w-full">
                {/* Titre */}
                <div className="text-center mb-10">
                    <h1 className="text-6xl font-serif font-black text-green-400 tracking-tight mb-2">
                        SCRABBLE
                    </h1>
                    <p className="text-gray-400 text-lg">Choisissez votre niveau de difficulté</p>
                </div>

                {/* Nom du joueur */}
                <div className="mb-6">
                    <label className="block text-sm font-semibold text-gray-300 mb-2">
                        Votre nom
                    </label>
                    <input
                        type="text"
                        value={playerName}
                        onChange={e => setPlayerName(e.target.value || 'Joueur 1')}
                        className="w-full bg-gray-800 border border-gray-600 rounded-xl px-4 py-3
                                text-white placeholder-gray-500 focus:outline-none focus:border-green-500
                                transition-colors"
                        placeholder="Joueur 1"
                        maxLength={20}
                    />
                </div>

                {/* Cartes de difficulté */}
                <div className="space-y-3 mb-8">
                    {Object.entries(DIFFICULTY_CONFIG).map(([key, cfg]) => (
                        <button
                        key={key}
                        onClick={() => setSelected(key)}
                        className={`
                            w-full text-left p-5 rounded-2xl border-2 transition-all duration-200
                            ${selected === key
                            ? `bg-gray-800 ${cfg.border} shadow-lg shadow-black/30 scale-[1.02]`
                            : 'bg-gray-900 border-gray-700 hover:border-gray-500 hover:bg-gray-850'
                            }
                        `}
                        >
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <span className="text-2xl">{cfg.emoji}</span>
                                    <div>
                                        <div className="font-bold text-white text-lg">{cfg.label}</div>
                                        <div className="text-gray-400 text-sm mt-0.5">{cfg.description}</div>
                                    </div>
                                </div>
                                {selected === key && (
                                    <div className={`w-5 h-5 rounded-full bg-gradient-to-br ${cfg.color} flex-shrink-0`} />
                                )}
                            </div>
                        </button>
                    ))}
                </div>

                {/* Bouton démarrer */}
                <button
                    onClick={() => onStart(playerName.trim() || 'Joueur 1', selected)}
                    className={`
                        w-full py-4 rounded-2xl font-bold text-xl text-white
                        bg-gradient-to-r ${DIFFICULTY_CONFIG[selected].color}
                        hover:opacity-90 active:scale-[0.98] transition-all duration-150
                        shadow-xl shadow-black/40
                    `}
                >
                    Démarrer la Partie →
                </button>

                {/* Légende délai IA */}
                <p className="text-center text-gray-600 text-sm mt-4">
                    L'IA réfléchit pendant{' '}
                    <span className="text-gray-400 font-medium">
                        {(DIFFICULTY_CONFIG[selected].delayMs / 1000).toFixed(1)} s
                    </span>
                </p>
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Composant : Badge du niveau en jeu
// ---------------------------------------------------------------------------

function DifficultyBadge({ difficulty }) {
    const cfg = DIFFICULTY_CONFIG[difficulty];
    if (!cfg) return null;
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${cfg.badge}`}>
            {cfg.emoji} IA {cfg.label}
        </span>
    );
}

// ---------------------------------------------------------------------------
// Composant principal App
// ---------------------------------------------------------------------------

function App() {
    const [screen, setScreen] = useState('difficulty'); // 'difficulty' | 'game'
    const [gameState, setGameState] = useState(null);
    const [gameId, setGameId] = useState(null);
    const [difficulty, setDifficulty] = useState('medium');
    const [currentPlayerId, setCurrentPlayerId] = useState(0);
    const [wordPlacements, setWordPlacements] = useState([]);
    const [selectedTilesToSwap, setSelectedTilesToSwap] = useState([]);
    const [aiThinking, setAiThinking] = useState(false);

    const previewScore = useMemo(
        () => calculatePreviewScore(wordPlacements),
        [wordPlacements]
    );

    // --- Activation automatique de l'IA ---
    useEffect(() => {
        if (!gameState || gameState.status !== 'ACTIVE' || !gameId) return;
        const currentPlayer = gameState.players[gameState.current_player_index];
        if (!currentPlayer?.is_ai) return;

        const delayMs = DIFFICULTY_CONFIG[difficulty]?.delayMs ?? 1500;

        setAiThinking(true);
        const timer = setTimeout(async () => {
            try {
                const updatedState = await gameService.aiPlayTurn(gameId);
                setGameState(updatedState);
            } catch (error) {
                console.error("Erreur lors du tour de l'IA:", error.response?.data?.detail);
                alert(`Erreur de l'IA : ${error.response?.data?.detail || 'Erreur API.'}`);
            } finally {
                setAiThinking(false);
            }
        }, delayMs);

        return () => {
            clearTimeout(timer);
            setAiThinking(false);
        };
    }, [gameState, gameId, difficulty]);

  // --- Démarrage de la partie ---
    const handleStartGame = async (playerName, selectedDifficulty) => {
        try {
            const playerNames = [playerName, `HAL 9000 (IA)`];
            const initialGame = await gameService.startGame(playerNames, selectedDifficulty);
            setGameState(initialGame);
            setGameId(initialGame.game_id);
            setDifficulty(selectedDifficulty);
            setCurrentPlayerId(initialGame.players[0].id);
            setWordPlacements([]);
            setSelectedTilesToSwap([]);
            setScreen('game');
        } catch (e) {
            console.error('Erreur au démarrage:', e);
            alert("Erreur lors du démarrage. Assurez-vous que le backend est lancé.");
        }
    };

    const handleReturnToMenu = () => {
        setScreen('difficulty');
        setGameState(null);
        setGameId(null);
        setWordPlacements([]);
        setSelectedTilesToSwap([]);
    };

    // --- Drag & Drop ---
    const handleDropTile = (tileLetter, r, c) => {
        const currentRack = gameState.players.find(p => p.id === activePlayerId)?.rack || [];
        const availableTiles = currentRack.filter(tile => !wordPlacements.some(p => p.originalTile === tile));
        const tileToPlace = availableTiles.find(t => t.letter === tileLetter);
        if (!tileToPlace) return;
        setWordPlacements(prev => [...prev, { letter: tileLetter, r, c, originalTile: tileToPlace }]);
    };

    const handleUndoPlacement = (r, c) => {
        setWordPlacements(prev => prev.filter(p => !(p.r === r && p.c === c)));
    };

    // --- Actions de jeu ---
    const handleValidateWord = async () => {
        if (!gameId || wordPlacements.length === 0) {
            alert('Veuillez placer un mot sur le plateau.');
            return;
        }
        setSelectedTilesToSwap([]);
        const placementsAPI = wordPlacements.map(p => [p.r, p.c, p.letter]);
        try {
            const result = await gameService.playWord(gameId, activePlayerId, placementsAPI);
            setGameState(result);
            setWordPlacements([]);
            if (result.status === 'FINISHED') {
                // Géré par le rendu conditionnel
            } else {
                setCurrentPlayerId(result.players[result.current_player_index].id);
            }
        } catch (error) {
            console.error('Erreur API:', error.response?.data?.detail);
            alert(`Erreur : ${error.response?.data?.detail || "Le mot n'est pas valide."}`);
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
            alert(`Erreur mélange : ${error.response?.data?.detail || 'Erreur API'}`);
        }
    };

    const handleSwapTiles = async () => {
        if (!gameId || selectedTilesToSwap.length === 0) return;
        setWordPlacements([]);
        try {
            const updatedState = await gameService.swapTiles(gameId, activePlayerId, selectedTilesToSwap);
            setGameState(updatedState);
            setSelectedTilesToSwap([]);
        } catch (error) {
            alert(`Échec échange : ${error.response?.data?.detail || 'Erreur API'}`);
        }
    };

    const toggleTileForSwap = (letter) => {
        setSelectedTilesToSwap(prev =>
        prev.includes(letter) ? prev.filter(l => l !== letter) : [...prev, letter]
        );
    };

    // --- Écran de sélection du niveau ---
    if (screen === 'difficulty') {
        return <DifficultyScreen onStart={handleStartGame} />;
    }

    // --- Dérivés de l'état ---
    const activePlayerId = gameState
        ? gameState.players[gameState.current_player_index].id
        : 0;

    const isCurrentPlayerAI = gameState
        ? gameState.players[gameState.current_player_index]?.is_ai
        : false;

    // --- Écran fin de partie ---
    if (gameState?.status === 'FINISHED') {
        return (
            <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-4">
                <div className="bg-gray-900 border border-gray-700 text-white p-8 rounded-2xl shadow-2xl text-center max-w-md w-full">
                    <div className="text-5xl mb-4">🏆</div>
                    <h1 className="text-3xl font-bold mb-2 text-green-400">Partie Terminée !</h1>
                    <p className="text-xl mb-1 text-gray-200">
                        Gagnant : <span className="font-extrabold text-white">{gameState.winner_name}</span>
                    </p>
                    <div className="mb-6">
                        <DifficultyBadge difficulty={difficulty} />
                    </div>
                    <ScorePanel players={gameState.players} currentPlayerId={-1} />
                    <div className="flex gap-3 mt-6">
                        <button
                        onClick={() => handleStartGame(gameState.players.find(p => !p.is_ai)?.name || 'Joueur 1', difficulty)}
                        className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded-xl transition"
                        >
                        Rejouer
                        </button>
                        <button
                        onClick={handleReturnToMenu}
                        className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-bold py-3 px-4 rounded-xl transition"
                        >
                        Menu
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    const currentRack = gameState?.players.find(p => p.id === activePlayerId)?.rack || [];
    const tilesInUse = wordPlacements.map(p => p.originalTile);
    const rackTilesForDisplay = currentRack.filter(tile => !tilesInUse.includes(tile));
    const isSwapMode = selectedTilesToSwap.length > 0;

    return (
        <div className="min-h-screen bg-gray-100 flex flex-col items-center p-4">
            <div className="flex items-center gap-4 mb-6">
                <h1 className="text-4xl font-serif font-bold text-green-700">SCRABBLE</h1>
                <DifficultyBadge difficulty={difficulty} />
            </div>

            {/* Bannière IA en train de réfléchir */}
            {aiThinking && (
                <div className="mb-4 w-full max-w-7xl">
                    <div className="bg-gray-800 border border-gray-600 rounded-xl px-4 py-3 flex items-center gap-3">
                        <div className="flex gap-1">
                            {[0, 1, 2].map(i => (
                                <div
                                key={i}
                                className="w-2 h-2 bg-yellow-400 rounded-full animate-bounce"
                                style={{ animationDelay: `${i * 0.15}s` }}
                                />
                            ))}
                        </div>
                        <span className="text-white font-medium text-sm">
                            {DIFFICULTY_CONFIG[difficulty]?.emoji} L'IA réfléchit ({DIFFICULTY_CONFIG[difficulty]?.label})…
                        </span>
                    </div>
                </div>
            )}

            <div className="flex flex-col lg:flex-row gap-6 w-full max-w-7xl">
                {/* Plateau */}
                <div className="grow">
                    <Board
                        gameState={gameState}
                        placements={wordPlacements}
                        onDropTile={handleDropTile}
                        onTileClick={handleUndoPlacement}
                    />
                </div>

                {/* Panneau latéral */}
                <div className="w-full lg:w-80 bg-white p-4 rounded-xl shadow-xl">
                    <ScorePanel
                        players={gameState.players}
                        currentPlayerId={currentPlayerId}
                    />

                    <h3 className="text-xl font-bold mt-6 mb-3 border-t pt-3">Score provisoire</h3>
                    <div className="bg-gray-100 p-3 rounded-lg flex justify-between items-center">
                        <span className="font-semibold text-gray-700">Points estimés :</span>
                        <span className="text-2xl font-extrabold text-red-600">{previewScore}</span>
                    </div>

                    {/* Actions — désactivées pendant le tour de l'IA */}
                    <div className="flex flex-col space-y-2 mt-4">
                        <button
                            onClick={handleValidateWord}
                            disabled={wordPlacements.length === 0 || isSwapMode || isCurrentPlayerAI || aiThinking}
                            className={`px-4 py-2 rounded-lg font-bold transition-colors ${
                                wordPlacements.length > 0 && !isSwapMode && !isCurrentPlayerAI && !aiThinking
                                ? 'bg-green-600 hover:bg-green-700 text-white'
                                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                            }`}
                        >
                            Valider ({wordPlacements.length} tuiles)
                        </button>

                        <button
                            onClick={handlePassTurn}
                            disabled={isSwapMode || wordPlacements.length > 0 || isCurrentPlayerAI || aiThinking}
                            className="bg-orange-500 hover:bg-orange-600 text-white font-bold py-2 px-4 rounded-lg disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed"
                        >
                            Passer le Tour
                        </button>

                        <button
                            onClick={handleShuffleRack}
                            disabled={isSwapMode || wordPlacements.length > 0 || isCurrentPlayerAI || aiThinking}
                            className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-lg disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed"
                        >
                            Mélanger
                        </button>

                        <button
                            onClick={handleReturnToMenu}
                            className="bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold py-2 px-4 rounded-lg transition"
                        >
                            ← Menu principal
                        </button>
                    </div>

                    <h3 className="text-lg font-semibold mt-6 mb-3 border-t pt-3">
                        Échange de tuiles
                    </h3>
                    <button
                        onClick={handleSwapTiles}
                        disabled={selectedTilesToSwap.length === 0 || wordPlacements.length > 0 || isCurrentPlayerAI || aiThinking}
                        className={`px-4 py-2 w-full rounded-lg font-bold transition-colors ${
                        selectedTilesToSwap.length > 0 && wordPlacements.length === 0 && !isCurrentPlayerAI && !aiThinking
                            ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                            : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        }`}
                    >
                        Échanger {selectedTilesToSwap.length} tuile(s)
                    </button>
                    <p className="text-xs text-gray-400 mt-1">
                        Cliquez sur les tuiles du rack pour les sélectionner.
                    </p>
                </div>
            </div>

            {/* Rack */}
            <div className="mt-8 w-full max-w-4xl">
                <h2 className="text-xl font-semibold mb-2 text-center text-gray-700">
                    {isCurrentPlayerAI
                        ? `⏳ Tour de l'IA (${DIFFICULTY_CONFIG[difficulty]?.label})`
                        : `Votre Rack`}
                </h2>
                <TileRack
                    tiles={rackTilesForDisplay}
                    playerId={currentPlayerId}
                    onTileClick={!isCurrentPlayerAI && !aiThinking ? toggleTileForSwap : undefined}
                    selectedTiles={selectedTilesToSwap}
                />
            </div>
        </div>
    );
}

export default App;