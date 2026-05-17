// src/components/Board.jsx
import React from 'react';
import Tile from './Tile';

const BONUS_COLORS = {
    TM: 'bg-red-500 text-white',
    DM: 'bg-pink-300 text-gray-800',
    TL: 'bg-blue-400 text-white',
    DL: 'bg-cyan-200 text-gray-800',
    START: 'bg-pink-300 text-gray-800',
    DEFAULT: 'bg-green-100 text-gray-600',
};

const getBonus = (r, c) => {
    if (r === 7 && c === 7) return { type: 'START', label: '★' };

    if ([0, 7, 14].includes(r) && [0, 7, 14].includes(c) && !(r === 7 && c === 7))
        return { type: 'TM', label: 'Mot×3' };

    if (
        (r === c || r + c === 14) &&
        [1, 2, 3, 4, 10, 11, 12, 13].includes(r) &&
        r !== 7 && c !== 7
    )
        return { type: 'DM', label: 'Mot×2' };

    if (
        ([1, 13].includes(r) && [5, 9].includes(c)) ||
        ([5, 9].includes(r) && [1, 5, 9, 13].includes(c))
    )
        return { type: 'TL', label: 'Ltr×3' };

    if (
        ([0, 14].includes(r) && [3, 11].includes(c)) ||
        ([2, 12].includes(r) && [6, 8].includes(c)) ||
        ([3, 11].includes(r) && [0, 7, 14].includes(c)) ||
        ([6, 8].includes(r) && [2, 6, 8, 12].includes(c)) ||
        (r === 7 && [3, 11].includes(c))
    )
        return { type: 'DL', label: 'Ltr×2' };

    return { type: 'DEFAULT', label: '' };
};

const Board = ({ gameState, placements, onDropTile, onTileClick }) => {
    if (!gameState) return <div className="text-xl p-4">Chargement du plateau…</div>;

    const grid = gameState.board.grid;

    const handleDragOver = (e) => e.preventDefault();

    const handleDrop = (e, r, c) => {
        e.preventDefault();

        // Récupère les données de la tuile depuis le DataTransfer
        let tileInfo;
        try {
            tileInfo = JSON.parse(e.dataTransfer.getData('application/json'));
        } catch {
            return;
        }

        // ── CORRECTION CLEF : on transmet l'INDEX du rack, pas la lettre ──
        const rackIndex = tileInfo?.id;
        if (rackIndex === undefined) return;

        // Case vide uniquement
        if (grid[r][c] !== null) return;
        const alreadyPlaced = placements.some(p => p.r === r && p.c === c);
        if (alreadyPlaced) return;

        onDropTile(rackIndex, r, c);
    };

    // Construire la grille d'affichage avec tuiles temporaires
    const temporaryTiles = {};
    const displayGrid = grid.map(row => [...row]);

    placements.forEach(p => {
        displayGrid[p.r][p.c] = p.originalTile;
        temporaryTiles[`${p.r}-${p.c}`] = true;
    });

    return (
        <div className="p-4 bg-gray-700 shadow-2xl rounded-lg">
            <div className="grid grid-cols-[repeat(15,_1fr)] gap-[1px] w-[375px] h-[375px] md:w-[570px] md:h-[570px] mx-auto">
                {displayGrid.map((row, r) =>
                    row.map((tile, c) => {
                        const { type, label } = getBonus(r, c);
                        const isTempPlaced = temporaryTiles[`${r}-${c}`] === true;
                        const bonusClass = BONUS_COLORS[type];

                        return (
                            <div
                                key={`${r}-${c}`}
                                className={`
                                w-full h-full flex justify-center items-center text-[9px] font-bold
                                transition-colors duration-150 rounded-[1px] border border-gray-500
                                ${bonusClass}
                                `}
                                onDragOver={handleDragOver}
                                onDrop={(e) => handleDrop(e, r, c)}
                            >
                                {tile ? (
                                    <Tile
                                        letter={tile.letter}
                                        score={tile.score}
                                        isDraggable={false}
                                        isTempPlaced={isTempPlaced}
                                        id={`board-${r}-${c}`}
                                        onClick={isTempPlaced ? () => onTileClick(r, c) : null}
                                    />
                                ) : (
                                    <span className="text-center leading-none p-[1px]">{label}</span>
                                )}
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
};

export default Board;