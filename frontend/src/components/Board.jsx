import React from 'react';
import Tile from './Tile'; // Vérification du chemin d'importation

// Définition simplifiée des couleurs des cases bonus pour l'interface
const BONUS_COLORS = {
    'TM': 'bg-red-500 text-white',      // Triple Mot (Rouge)
    'DM': 'bg-pink-300 text-gray-800',  // Double Mot (Rose)
    'TL': 'bg-blue-400 text-white',     // Triple Lettre (Bleu foncé)
    'DL': 'bg-cyan-200 text-gray-800',  // Double Lettre (Bleu clair)
    'START': 'bg-pink-300 text-gray-800', // Centre (DM)
    'DEFAULT': 'bg-green-100 text-gray-600' // Case standard (Vert très clair)
};

// Logique des bonus standard du Scrabble (coordonnées 0-14)
const getBonus = (r, c) => {
    // 1. Centre de départ (DM)
    if (r === 7 && c === 7) return { type: 'START', label: '★' };

    // 2. Triple Mot (TM - Rouge)
    if (([0, 7, 14].includes(r) && [0, 7, 14].includes(c)) && (r !== 7 || c !== 7)) return { type: 'TM', label: 'Mot x3' };

    // 3. Double Mot (DM - Rose) - Diagonales internes
    if (
        (r === c || r + c === 14) && 
        [1, 2, 3, 4, 10, 11, 12, 13].includes(r) &&
        r !== 7 && c !== 7
    ) return { type: 'DM', label: 'Mot x2' };
    
    // 4. Triple Lettre (TL - Bleu Foncé)
    if (
        ([1, 13].includes(r) && [5, 9].includes(c)) || 
        ([5, 9].includes(r) && [1, 5, 9, 13].includes(c))
    ) return { type: 'TL', label: 'Lettre x3' };

    // 5. Double Lettre (DL - Bleu Clair)
    if (
        ([0, 14].includes(r) && [3, 11].includes(c)) ||
        ([2, 12].includes(r) && [6, 8].includes(c)) ||
        ([3, 11].includes(r) && [0, 7, 14].includes(c)) ||
        ([6, 8].includes(r) && [2, 6, 8, 12].includes(c)) ||
        (r === 7 && [3, 11].includes(c))
    ) {
        // Cette vérification est redondante si les conditions TM/DM/TL ci-dessus sont bonnes,
        // mais elle assure l'exclusivité. L'erreur précédente a été corrigée en retirant la récursion.
        // Puisque nous sommes sûrs que les conditions 1, 2, 3, 4 sont gérées en amont, 
        // ce qui reste ici est bien DL.
        return { type: 'DL', label: 'Lettre x2' };
    }

    return { type: 'DEFAULT', label: '' };
};

const Board = ({ gameState, placements, onDropTile, onTileClick }) => {
    if (!gameState) return <div className="text-xl p-4">Chargement du plateau...</div>;

    // Le tableau grid est 15x15
    const grid = gameState.board.grid;

    const handleDragOver = (e) => {
        e.preventDefault(); // Nécessaire pour permettre le drop
    };

    const handleDrop = (e, r, c) => {
        e.preventDefault();
        
        // 1. Récupérer les données de la tuile (lettre et ID/index du rack)
        const droppedData = e.dataTransfer.getData("application/json");
        
        let tileInfo;
        try {
            tileInfo = JSON.parse(droppedData);
        } catch (error) {
            console.error("Erreur de parsing des données glissées:", error);
            return;
        }

        const tileRackId = tileInfo?.id; // L'ID du rack (index)

        // 2. Permettre le drop uniquement si la case est vide
        if (grid[r][c] === null && tileRackId !== undefined) {
            // Appelle la fonction parent pour placer la tuile (en utilisant l'ID du rack)
            onDropTile(tileRackId, r, c);
        }
    };

    // Création d'une grille temporaire pour la prévisualisation
    // Nous utilisons la grille du gameState car les tuiles permanentes sont dedans.
    const tempGrid = grid.map(row => [...row]);
    
    // Structure pour suivre les emplacements temporaires (clé: "r-c")
    const temporaryTiles = {};
    
    // Fusionner les tuiles permanentes et les tuiles temporairement posées
    placements.forEach(p => {
        // Simuler le placement sur la grille temporaire
        tempGrid[p.r][p.c] = p.originalTile; 
        // Marquer la position comme temporaire, en stockant l'objet de la tuile
        temporaryTiles[`${p.r}-${p.c}`] = p.originalTile;
    });

    return (
        <div className="p-4 bg-gray-700 shadow-2xl rounded-lg">
            <div 
                className="grid grid-cols-[repeat(15,_1fr)] gap-[1px] 
                           w-[400px] h-[400px] md:w-[600px] md:h-[600px] mx-auto"
            >
                {tempGrid.map((row, r) => ( // Utiliser tempGrid pour l'affichage
                    row.map((tile, c) => {
                        const { type, label } = getBonus(r, c);
                        const isTempPlaced = temporaryTiles[`${r}-${c}`] !== undefined;
                        const baseClasses = `
                            w-full h-full flex justify-center items-center text-xs font-bold 
                            transition-colors duration-150 rounded-[1px]
                            border border-gray-500
                        `;
                        const bonusClass = BONUS_COLORS[type];

                        return (
                            <div 
                                key={`${r}-${c}`}
                                className={`${baseClasses} ${bonusClass}`}
                                onDragOver={handleDragOver}
                                onDrop={(e) => handleDrop(e, r, c)}
                            >
                                {tile ? (
                                    // Affiche la tuile (permanente ou temporaire)
                                    <Tile 
                                        letter={tile.letter} 
                                        score={tile.score} 
                                        isDraggable={false} // Les tuiles sur le plateau ne sont jamais draggables
                                        isTempPlaced={isTempPlaced} // Indique que c'est une tuile temporaire
                                        id={`board-${r}-${c}`} 
                                        // Clic pour annuler le placement (si elle est temporaire)
                                        onClick={isTempPlaced ? () => onTileClick(r, c) : null} 
                                    />
                                ) : (
                                    // Affiche le label du bonus si la case est vide
                                    <span className="text-white text-center p-0.5 leading-none">{label}</span>
                                )}
                            </div>
                        );
                    })
                ))}
            </div>
        </div>
    );
};

export default Board;