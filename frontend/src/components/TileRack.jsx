import React from 'react';
import Tile from './Tile'; // S'assurer que le chemin d'importation est correct

/**
 * Affiche le rack de lettres du joueur. Supporte le Drag-and-Drop pour jouer
 * et le clic pour la sélection (pour l'échange).
 */
const TileRack = ({ 
    tiles, 
    playerId, 
    onTileClick,      // Fonction de rappel pour la sélection (du App.jsx)
    selectedTiles = []    // Liste des lettres sélectionnées (du App.jsx)
}) => {
    
    // Détermine si le mode de sélection pour l'échange est actif
    const isSwapModeActive = onTileClick !== undefined;

    // L'ID unique de la tuile dans le rack est son INDEX.
    const handleDragStart = (e, tile, index) => {
        // Empêche le drag-and-drop si le mode échange est actif
        // Note: La logique initiale était "si le mode échange est actif ET des tuiles sont sélectionnées". 
        // Si le mode est actif, le drag est désactivé directement via isDraggable.
        if (isSwapModeActive) {
            e.preventDefault();
            return;
        }
        
        // --- Utiliser l'index comme ID et stocker l'objet JSON ---
        const tileData = {
            letter: tile.letter,
            score: tile.score,
            id: index // L'ID est l'INDEX dans le rack
        };
        
        // Stocke la tuile complète et son index pour que Board.jsx puisse identifier la tuile à retirer du rack
        e.dataTransfer.setData('application/json', JSON.stringify(tileData));
        
        // Stocke la lettre en tant que fallback (non strictement nécessaire mais bonne pratique)
        e.dataTransfer.setData("text/plain", tile.letter);
        
        e.dataTransfer.setData("source", "rack"); // Indique l'origine
        e.dataTransfer.effectAllowed = "move";
    };
    
    // Détermine l'apparence du rack
    const rackStyle = isSwapModeActive ? 
        'border-t-4 border-indigo-600 shadow-xl' : 
        'border-t-4 border-gray-400';

    return (
        <div className={`p-4 bg-gray-200 rounded-lg shadow-inner flex flex-wrap justify-center items-center space-x-1 ${rackStyle}`}>
            {tiles.map((tile, index) => {
                // Vérification si la lettre est sélectionnée pour l'échange. 
                // Attention: Si plusieurs tuiles ont la même lettre, elles seront toutes sélectionnées.
                const isSelected = selectedTiles.includes(tile.letter);
                
                // Si le mode sélection est actif, le drag est désactivé
                const isDraggable = !isSwapModeActive;
                
                return (
                    <Tile 
                        key={`${tile.letter}-${index}`}
                        letter={tile.letter} 
                        score={tile.score}
                        id={index} // Passage de l'index comme ID pour le Drag et l'identification unique
                        
                        // Propriétés de Drag-and-Drop
                        isDraggable={isDraggable} 
                        onDragStart={(e) => handleDragStart(e, tile, index)} // Passe la tuile et l'index
                        
                        // Propriétés de Sélection (pour l'échange)
                        isSelectable={isSwapModeActive}
                        isSelected={isSelected}
                        onClick={isSwapModeActive ? () => onTileClick(tile.letter) : null}
                    />
                );
            })}
        </div>
    );
};

export default TileRack;