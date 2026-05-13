import React from 'react';
import PropTypes from 'prop-types';

/**
 * Affiche les scores de tous les joueurs et indique le joueur actuel.
 * @param {Array<Object>} players - Liste des objets joueurs (name, score, id, éventuellement userId si c'est l'utilisateur local).
 * @param {number|string} currentPlayerId - L'ID du joueur dont c'est le tour (peut être number ou string selon le modèle).
 */
const ScorePanel = ({ players, currentPlayerId, localUserId = null }) => {
    if (!players || players.length === 0) {
        return (
            <div className="bg-white p-4 rounded shadow-md text-center text-gray-500">
                Aucun joueur n'a démarré.
            </div>
        );
    }

    return (
        <div className="bg-gray-50 border border-gray-200 p-4 rounded-lg shadow-inner w-full">
            <h3 className="text-xl font-bold mb-4 text-gray-800 border-b pb-2 flex items-center">
                <span className="mr-2">Scores de la Partie</span> 🏆
            </h3>
            
            <div className="space-y-3">
                {players.map((player) => {
                    // Détermine si c'est le tour de ce joueur
                    const isCurrentPlayer = player.id === currentPlayerId;
                    // Détermine si c'est l'utilisateur regardant cet écran (si localUserId est fourni)
                    const isLocalPlayer = localUserId && player.userId === localUserId; 
                    
                    const playerClass = isCurrentPlayer
                        ? "bg-yellow-100 border-l-4 border-yellow-500 shadow-xl transform scale-[1.01]"
                        : "bg-white border-l-4 border-gray-300";

                    return (
                        <div 
                            key={player.id} 
                            className={`flex justify-between items-center p-3 rounded-lg transition duration-300 ease-in-out ${playerClass}`}
                        >
                            <div className="flex items-center space-x-2 truncate">
                                {/* Affichage visuel du tour */}
                                {isCurrentPlayer && (
                                    <span className="text-yellow-600 font-extrabold text-lg animate-pulse" title="Tour Actuel">➡️</span>
                                )}
                                <span className="font-semibold text-lg text-gray-700 truncate">
                                    {player.name}
                                </span>
                                {isLocalPlayer && (
                                    <span className="text-xs font-bold bg-indigo-500 text-white px-2 py-0.5 rounded-full ml-2">Moi</span>
                                )}
                            </div>
                            
                            <span className="text-2xl font-extrabold text-blue-600 flex-shrink-0">
                                {player.score}
                            </span>
                        </div>
                    );
                })}
            </div>
            
            {/* Légende du tour */}
            <p className="mt-4 text-sm text-center text-gray-500">
                <span className="text-yellow-600">➡️</span> Indique le joueur qui joue.
            </p>
        </div>
    );
};

ScorePanel.propTypes = {
    // Les IDs peuvent être des strings (Firestore) ou des numbers (modèle Python)
    players: PropTypes.arrayOf(
        PropTypes.shape({
            id: PropTypes.oneOfType([PropTypes.number, PropTypes.string]).isRequired,
            name: PropTypes.string.isRequired,
            score: PropTypes.number.isRequired,
            rack: PropTypes.array.isRequired, 
            userId: PropTypes.string, // Optionnel pour le multijoueur
        })
    ).isRequired,
    currentPlayerId: PropTypes.oneOfType([PropTypes.number, PropTypes.string]).isRequired,
    localUserId: PropTypes.string, // ID de l'utilisateur local pour l'affichage "Moi"
};

export default ScorePanel;