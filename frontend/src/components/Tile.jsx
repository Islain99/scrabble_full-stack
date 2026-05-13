// src/components/Tile.jsx
import React from 'react';

const Tile = ({ 
    letter, 
    score, 
    isDraggable = true, 
    isSelectable = false, // Si la tuile peut être cliquée pour sélection (échange)
    isSelected = false,   // Si elle est actuellement sélectionnée
    isTempPlaced = false, // Si la tuile est posée temporairement sur le plateau
    onDragStart, 
    onClick, 
    id // Utilisé pour identifier la tuile dans le rack (souvent l'index)
}) => {
    
    // --- Styles Conditionnels ---
    
    // Joker (blanc)
    const tileClass = letter === '*' ? 'bg-gray-300 border-gray-500' : 'bg-yellow-200 border-yellow-500';
    
    // Sélection pour l'échange
    const selectionClass = isSelected 
        ? 'ring-4 ring-indigo-500 ring-offset-2 scale-105' 
        : 'hover:shadow-lg'; 

    // Placement temporaire sur le plateau
    const tempClass = isTempPlaced 
        ? 'bg-blue-300 border-blue-600 shadow-xl animate-pulse' 
        : '';

    // Détermine le type de curseur et l'action au clic
    const cursorClass = isSelectable || isTempPlaced 
        ? 'cursor-pointer' 
        : (isDraggable ? 'cursor-grab' : '');

    // --- Gestionnaire de Drag Start ---
    const handleDragStart = (e) => {
        if (!onDragStart) return;
        
        // Stocke la lettre dans le DataTransfer pour être récupérée par la cible de dépôt (BoardCell)
        // et ajoute une référence à l'ID (utile si plusieurs tuiles ont la même lettre)
        e.dataTransfer.setData('text/plain', letter);
        e.dataTransfer.setData('application/json', JSON.stringify({ letter, id }));
        
        onDragStart(e); // Appel de la fonction de rappel parent (si fournie)
    };

    // La lettre affichée: le caractère '*' pour le joker par défaut.
    const displayLetter = letter === '*' ? ' ' : letter; 
    
    return (
        <div 
            id={id}
            className={`
                w-10 h-10 flex flex-col justify-center items-center m-0.5 border-2 rounded shadow-md 
                transition-all duration-150 relative select-none
                ${tileClass} ${selectionClass} ${tempClass} ${cursorClass}
            `}
            // La tuile est draggable uniquement si elle est dans le rack ET n'est PAS sélectionnée
            draggable={isDraggable && !isSelectable && !isTempPlaced} 
            onDragStart={isDraggable && !isSelectable && !isTempPlaced ? handleDragStart : null}
            // La tuile est cliquable si elle est sélectionnable (échange) OU si elle est posée temporairement (annulation)
            onClick={isSelectable || isTempPlaced ? () => onClick(letter) : null} 
        >
            <span className="text-xl font-bold leading-none text-black">{displayLetter}</span>
            {score > 0 && (
                <span className="text-xs absolute bottom-0 right-0 p-[1px] font-medium text-red-700">{score}</span>
            )}
            
            {/* L'indicateur visuel pour la sélection d'échange (le ring-4 est déjà une bonne indication) */}
            {/* Si vous voulez un point supplémentaire pour l'échange (souvent non nécessaire avec ring-4) */}
            {/* {isSelected && (
                 <div className="absolute top-0 right-0 w-3 h-3 bg-indigo-500 rounded-full border border-white opacity-90"></div>
            )}
            */}
        </div>
    );
};

export default Tile;