// src/components/TileRack.jsx
import React from 'react';
import Tile from './Tile';

/**
 * Rack de lettres du joueur.
 * – Drag-and-drop : l'index de la tuile dans le rack est transmis via DataTransfer
 *   pour que Board.jsx puisse identifier de façon unique la tuile (même lettre en double).
 * – Clic : sélection pour l'échange.
 */
const TileRack = ({
    tiles,
    playerId,
    onTileClick,
    selectedTiles = [],
}) => {
    const isSwapModeActive = onTileClick !== undefined;

    const handleDragStart = (e, tile, index) => {
        if (isSwapModeActive) {
            e.preventDefault();
            return;
        }

        // ── CORRECTION CLEF : on stocke l'INDEX comme `id` dans le JSON ──
        const tileData = {
            letter: tile.letter,
            score: tile.score,
            id: index,          // index dans le rack — unique même si même lettre
        };

        e.dataTransfer.setData('application/json', JSON.stringify(tileData));
        e.dataTransfer.setData('text/plain', tile.letter);
        e.dataTransfer.effectAllowed = 'move';
    };

    const rackStyle = isSwapModeActive
        ? 'border-t-4 border-indigo-600 shadow-xl'
        : 'border-t-4 border-gray-400';

    return (
        <div
            className={`p-4 bg-gray-200 rounded-lg shadow-inner flex flex-wrap justify-center items-center gap-1 ${rackStyle}`}
        >
            {tiles.map((tile, index) => {
                const isSelected = selectedTiles.includes(tile.letter);
                const isDraggable = !isSwapModeActive;

                return (
                    <Tile
                        key={`rack-${tile.letter}-${index}`}
                        letter={tile.letter}
                        score={tile.score}
                        id={index}
                        isDraggable={isDraggable}
                        onDragStart={(e) => handleDragStart(e, tile, index)}
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