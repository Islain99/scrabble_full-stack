// src/App.jsx
import React, { useState, useEffect, useMemo } from 'react';
import Board from './components/Board';
import TileRack from './components/TileRack';
import ScorePanel from './components/ScorePanel'; 
import * as gameService from './api/gameService';
import './index.css'; 
import { POINTS_LETTRES } from './data/constants'; 

// Simuler la structure de points côté client pour la prévisualisation
const CLIENT_POINTS = POINTS_LETTRES; 

function App() {
    const [gameState, setGameState] = useState(null);
    const [gameId, setGameId] = useState(null); // ID de la partie, essentiel pour les API
    const [currentPlayerId, setCurrentPlayerId] = useState(0); 
    const [wordPlacements, setWordPlacements] = useState([]); // {letter, r, c, originalTile}
    const [selectedTilesToSwap, setSelectedTilesToSwap] = useState([]); 
    // const [previewScore, setPreviewScore] = useState(0); 

    // --- Fonctions d'initialisation et de mise à jour ---

    // La logique de prévisualisation reste simple sur le frontend
    const calculatePreviewScore = (placements) => {
        if (placements.length === 0) return 0;
        
        let score = 0;
        let wordMultiplier = 1;

        placements.forEach(p => {
            const letter = p.letter;
            let letterScore = CLIENT_POINTS[letter];
            
            // NOTE: Simulation de bonus au centre uniquement pour l'UX
            const bonus = (p.r === 7 && p.c === 7) ? 'DM' : null; 
            
            if (bonus === 'DL') letterScore *= 2;
            if (bonus === 'TL') letterScore *= 3;
            if (bonus === 'DM') wordMultiplier *= 2;
            if (bonus === 'TM') wordMultiplier *= 3;
            
            score += letterScore;
        });
        
        return score * wordMultiplier;
    };

    const previewScore = useMemo(() => {
      return calculatePreviewScore(wordPlacements);
    }, [wordPlacements]);

    // --- Activation Automatique de l'IA ---
    useEffect(() => {
        if (!gameState || gameState.status !== "ACTIVE" || !gameId) return;

        const currentPlayer = gameState.players[gameState.current_player_index];
        
        // 1. Vérifie si le joueur actuel est une IA
        if (currentPlayer && currentPlayer.is_ai) { 
            console.log(`C'est le tour de l'IA (${currentPlayer.name}). Déclenchement automatique...`);
            
            // Délai pour l'effet visuel afin que l'utilisateur comprenne que l'IA joue
            const delay = setTimeout(async () => {
                try {
                    // 2. Appel au nouvel endpoint de l'IA
                    const updatedState = await gameService.aiPlayTurn(gameId); // Utilise gameId
                    setGameState(updatedState);
                } catch (error) {
                    console.error("Erreur lors du tour de l'IA:", error.response?.data?.detail);
                    alert(`Erreur de l'IA : ${error.response?.data?.detail || "Erreur API."}`);
                }
            }, 1500); // 1.5 seconde de délai
            
            return () => clearTimeout(delay); // Nettoyage
        }
    }, [gameState, gameId]); // Se déclenche à chaque changement d'état ou d'ID de partie

    // --- Mise à jour de handleStartGame pour inclure l'IA ---
    const handleStartGame = async () => {
        try {
            // Créer un joueur humain et un joueur IA
            const playerNames = ['Joueur Humain', 'HAL 9000 (IA)']; 
            
            const initialGame = await gameService.startGame(playerNames);
            setGameState(initialGame);
            setGameId(initialGame.game_id); 
            setCurrentPlayerId(initialGame.players[activePlayerId].id);
            setWordPlacements([]);
            setSelectedTilesToSwap([]);
        } catch (e) {
            console.error("Erreur au démarrage:", e);
            alert("Erreur lors du démarrage du jeu. Assurez-vous que le backend est lancé.");
        }
    };

    // --- GESTION DU DRAG-AND-DROP BIDIRECTIONNEL ---

    const handleDropTile = (tileLetter, r, c) => {
        const currentRack = gameState.players.find(p => p.id === currentPlayerId)?.rack || [];
        
        // Trouver la première instance non utilisée de cette lettre
        const availableTiles = currentRack.filter(tile => {
            return !wordPlacements.some(p => p.originalTile === tile);
        });

        const tileToPlace = availableTiles.find(t => t.letter === tileLetter);
        
        if (!tileToPlace) return;

        const newPlacement = { letter: tileLetter, r, c, originalTile: tileToPlace };
        setWordPlacements(prev => [...prev, newPlacement]);
    };
    
    const handleUndoPlacement = (r, c) => {
        // Annule le placement temporaire à (r, c) en filtrant par coordonnées
        const updatedPlacements = wordPlacements.filter(p => !(p.r === r && p.c === c));
        setWordPlacements(updatedPlacements);
    };
    
    // --- ACTIONS DE JEU (Mise à jour pour inclure gameId) ---
    
    const handleValidateWord = async () => {
      if (!gameId || wordPlacements.length === 0) {
          alert("Veuillez placer un mot sur le plateau.");
          return;
      }
      
      // S'assurer qu'aucune tuile n'est sélectionnée pour l'échange si on joue un mot
      setSelectedTilesToSwap([]); 

      // Conversion du format pour l'API Python: [(r, c, lettre), ...]
      const placementsAPI = wordPlacements.map(p => [p.r, p.c, p.letter]);

      try {
        const result = await gameService.playWord(gameId, activePlayerId, placementsAPI); // CORRIGÉ
        
        setGameState(result);
        setWordPlacements([]); 
        
        if (result.status === "FINISHED") {
            alert(`Partie terminée! Gagnant: ${result.winner_name}`);
        } else {
            // Optionnel: Mettre à jour l'ID du joueur actuel si la fonction useEffect ne le fait pas immédiatement
            const nextPlayer = result.players[result.current_player_index];
            setCurrentPlayerId(nextPlayer.id);
        }
      } catch (error) {
        console.error("Erreur API:", error.response?.data?.detail);
        alert(`Erreur : ${error.response?.data?.detail || "Le mot n'est pas valide ou le placement est illégal."}`);
        
        // Réinitialiser les placements temporaires
        setWordPlacements([]);
      }
    };

    const handlePassTurn = async () => {
        if (!gameId) return;
        try {
            const updatedState = await gameService.passTurn(gameId, activePlayerId); // CORRIGÉ
            setGameState(updatedState);
            alert("Tour passé.");
        } catch (error) {
            alert(`Erreur lors du passage du tour : ${error.response?.data?.detail || "Erreur API"}`);
        }
    }

    const handleShuffleRack = async () => { // NOUVELLE FONCTION
        if (!gameId) return;
        try {
            const updatedState = await gameService.shuffleRack(gameId, currentPlayerId); 
            setGameState(updatedState);
            alert("Rack mélangé.");
        } catch (error) {
            alert(`Erreur lors du mélange du rack : ${error.response?.data?.detail || "Erreur API"}`);
        }
    };

    const handleSwapTiles = async () => {
        if (!gameId) return;
        if (selectedTilesToSwap.length === 0) {
            alert("Sélectionnez les lettres à échanger.");
            return;
        }
        
        // Assurez-vous d'annuler tout placement temporaire avant d'échanger
        setWordPlacements([]);

        try {
            const updatedState = await gameService.swapTiles(gameId, activePlayerId, selectedTilesToSwap); // CORRIGÉ
            setGameState(updatedState);
            setSelectedTilesToSwap([]); 
            alert("Lettres échangées ! Tour passé.");
        } catch (error) {
            alert(`Échec de l'échange : ${error.response?.data?.detail || "Erreur API"}`);
        }
    };
    
    const toggleTileForSwap = (letter) => {
        if (selectedTilesToSwap.includes(letter)) {
            setSelectedTilesToSwap(selectedTilesToSwap.filter(l => l !== letter));
        } else {
            setSelectedTilesToSwap([...selectedTilesToSwap, letter]);
        }
    };

    // Dériver l'ID du joueur actif directement à partir de gameState
    const activePlayerId = gameState 
      ? gameState.players[gameState.current_player_index].id 
      : 0;

    // --- Rendu Conditionnel ---

    if (!gameState || gameState.status === "SETUP") {
        return (
             <div className="min-h-screen bg-gray-900 flex items-center justify-center">
                <button 
                    onClick={() => handleStartGame(['Joueur 1', 'Joueur 2'])}
                    className="bg-green-600 hover:bg-green-700 text-white font-bold py-4 px-8 text-xl rounded-lg shadow-2xl transition"
                >
                    Démarrer la Partie
                </button>
            </div>
        );
    }

    if (gameState.status === "FINISHED") {
        return (
            <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-4 text-white">
                <div className="bg-white text-gray-900 p-8 rounded-xl shadow-2xl text-center">
                    <h1 className="text-4xl font-extrabold mb-4 text-green-600">Partie Terminée ! 🏆</h1>
                    <p className="text-2xl mb-6">Le gagnant est : **{gameState.winner_name}**</p>
                    <ScorePanel players={gameState.players} currentPlayerId={-1} /> 
                    <button 
                        onClick={() => handleStartGame(['Joueur 1', 'Joueur 2'])}
                        className="mt-6 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg transition"
                    >
                        Nouvelle Partie
                    </button>
                </div>
            </div>
        );
    }

    const currentRack = gameState?.players.find(p => p.id === activePlayerId)?.rack || [];
    
    // Déterminer les tuiles disponibles pour le rack (celles qui ne sont pas temporairement posées)
    const tilesInUse = wordPlacements.map(p => p.originalTile);
    let rackTilesForDisplay = currentRack.filter(tile => !tilesInUse.includes(tile));
    
    // Si des tuiles sont sélectionnées pour l'échange, les tuiles restantes ne peuvent pas être glissées
    const isSwapMode = selectedTilesToSwap.length > 0;

    return (
        <div className="min-h-screen bg-gray-100 flex flex-col items-center p-4">
            <h1 className="text-4xl font-serif font-bold text-green-700 mb-6">SCRABBLE</h1>
            
            <div className="flex flex-col lg:flex-row gap-6 w-full max-w-7xl">
                
                {/* 1. Plateau de Jeu */}
                <div className="grow">
                    <Board 
                        gameState={gameState} 
                        placements={wordPlacements} 
                        onDropTile={handleDropTile} 
                        onTileClick={handleUndoPlacement} 
                    />
                </div>
                
                {/* 2. Panneau Latéral (Scores et Actions) */}
                <div className="w-full lg:w-80 bg-white p-4 rounded-lg shadow-xl">
                    <ScorePanel 
                        players={gameState.players} 
                        currentPlayerId={currentPlayerId}
                    />
                    
                    <h3 className="text-xl font-bold mt-6 mb-3 border-t pt-3">Prévisualisation du Coup</h3>
                    <div className="bg-gray-100 p-3 rounded-lg flex justify-between">
                        <span className="font-semibold text-gray-700">Score Provisoire:</span>
                        <span className="text-2xl font-extrabold text-red-600 animate-bounce transition duration-300">
                            {previewScore}
                        </span>
                    </div>

                    <div className="flex flex-col space-y-2 mt-4">
                        <button 
                            onClick={handleValidateWord}
                            disabled={wordPlacements.length === 0 || isSwapMode}
                            className={`px-4 py-2 rounded-lg font-bold transition-colors ${wordPlacements.length > 0 && !isSwapMode ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-gray-300 text-gray-500 cursor-not-allowed'}`}
                        >
                            Valider le Mot ({wordPlacements.length} tuiles)
                        </button>
                        <button 
                            onClick={handlePassTurn}
                            disabled={isSwapMode || wordPlacements.length > 0} // Ne peut pas passer si un mot est posé
                            className="bg-orange-500 hover:bg-orange-600 text-white font-bold py-2 px-4 rounded-lg disabled:bg-gray-300 disabled:text-gray-500"
                        >
                            Passer le Tour
                        </button>
                        <button 
                            onClick={handleShuffleRack}
                            disabled={isSwapMode || wordPlacements.length > 0}
                            className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-lg disabled:bg-gray-300 disabled:text-gray-500"
                        >
                            Mélanger
                        </button>
                    </div>

                    <h3 className="text-lg font-semibold mt-6 mb-3 border-t pt-3">Échange de Tuiles (Cliquez sur le Rack)</h3>
                    <button 
                        onClick={handleSwapTiles}
                        disabled={selectedTilesToSwap.length === 0 || wordPlacements.length > 0} // Ne peut pas échanger si un mot est posé
                        className={`px-4 py-2 w-full rounded-lg font-bold transition-colors ${selectedTilesToSwap.length > 0 && wordPlacements.length === 0 ? 'bg-indigo-600 hover:bg-indigo-700 text-white' : 'bg-gray-300 text-gray-500 cursor-not-allowed'}`}
                    >
                        Échanger {selectedTilesToSwap.length} Tuile(s)
                    </button>
                </div>
            </div>
            
            {/* 3. Rack de Lettres du Joueur Actuel */}
            <div className="mt-8 w-full max-w-4xl">
                <h2 className="text-xl font-semibold mb-2 text-center">Votre Rack (Joueur {currentPlayerId + 1})</h2>
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