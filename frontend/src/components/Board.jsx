// src/components/Board.jsx
import React, { useState, useCallback } from 'react';
import { useTutorialRef } from '../context/TutorialContext';

const BONUS_STYLES = {
  TM:      { bg: 'var(--bonus-tm)',    label: '3M', text: 'var(--bonus-tm-text)' },
  DM:      { bg: 'var(--bonus-dm)',    label: '2M', text: 'var(--bonus-dm-text)' },
  TL:      { bg: 'var(--bonus-tl)',    label: '3L', text: 'var(--bonus-tl-text)' },
  DL:      { bg: 'var(--bonus-dl)',    label: '2L', text: 'var(--bonus-dl-text)' },
  START:   { bg: 'var(--bonus-start)', label: '★',  text: 'var(--bonus-start-text)' },
  DEFAULT: { bg: null, label: '', text: '' },
};

const getBonus = (r, c) => {
  if (r === 7 && c === 7) return 'START';
  if (([0,7,14].includes(r) && [0,7,14].includes(c)) && !(r===7&&c===7)) return 'TM';
  if ((r===c||r+c===14) && [1,2,3,4,10,11,12,13].includes(r) && r!==7 && c!==7) return 'DM';
  if (([1,13].includes(r)&&[5,9].includes(c))||([5,9].includes(r)&&[1,5,9,13].includes(c))) return 'TL';
  if (([0,14].includes(r)&&[3,11].includes(c))||([2,12].includes(r)&&[6,8].includes(c))||([3,11].includes(r)&&[0,7,14].includes(c))||([6,8].includes(r)&&[2,6,8,12].includes(c))||(r===7&&[3,11].includes(c))) return 'DL';
  return 'DEFAULT';
};

const Board = ({ gameState, placements, onDropTile, onMoveTile, onReturnTile }) => {
  const [hoverCell, setHoverCell] = useState(null);
  const [dragSource, setDragSource] = useState(null);
  const boardRef       = useTutorialRef('board');
  const boardCenterRef = useTutorialRef('board-center');

  const grid = gameState?.board?.grid ?? null;
  const tempMap = {};
  if (grid && placements) placements.forEach(p => { tempMap[`${p.r}-${p.c}`] = p; });

  const handleDragOver = useCallback((e, r, c) => {
    e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setHoverCell(`${r}-${c}`);
  }, []);

  const handleDragLeave = useCallback((e) => {
    if (!e.currentTarget.contains(e.relatedTarget)) setHoverCell(null);
  }, []);

  const handleDrop = useCallback((e, r, c) => {
    e.preventDefault(); setHoverCell(null); setDragSource(null);
    if (!grid || grid[r][c] !== null || tempMap[`${r}-${c}`]) return;
    let info; try { info = JSON.parse(e.dataTransfer.getData('application/json')); } catch { return; }
    if (info.source === 'board') { onMoveTile(info.fromR, info.fromC, r, c); }
    else { if (info.rackIndex === undefined) return; onDropTile(info.rackIndex, r, c); }
  }, [grid, tempMap, onDropTile, onMoveTile]);

  const handleBoardDragEnd = useCallback(() => { setHoverCell(null); setDragSource(null); }, []);

  const handleBoardTileDragStart = useCallback((e, r, c) => {
    const placement = tempMap[`${r}-${c}`];
    if (!placement) return;
    e.dataTransfer.setData('application/json', JSON.stringify({ source: 'board', fromR: r, fromC: c, letter: placement.letter }));
    e.dataTransfer.effectAllowed = 'move';
    setDragSource({ type: 'board', fromR: r, fromC: c });
  }, [tempMap]);

  if (!gameState || !grid) return (
    <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '1.4rem', color: 'var(--olive)', padding: '3rem', textAlign: 'center' }}>
      Chargement du plateau...
    </div>
  );

  const tempGrid = grid.map(row => [...row]);
  placements.forEach(p => { tempGrid[p.r][p.c] = p.originalTile; });

  return (
    <div
      ref={boardRef}
      style={{ width: '100%', maxWidth: 'min(100%, calc(100vh - 160px))', aspectRatio: '1/1', background: 'var(--board-bg)', borderRadius: '6px', padding: 'clamp(6px, 1.5%, 14px)', boxShadow: '6px 6px 0 var(--board-shadow)', border: '3px solid var(--board-border)', position: 'relative', userSelect: 'none', boxSizing: 'border-box', margin: '0 auto' }}
      onDragEnd={handleBoardDragEnd}
    >
      {[{ top:'5px',left:'5px'},{top:'5px',right:'5px'},{bottom:'5px',left:'5px'},{bottom:'5px',right:'5px'}].map((pos,i) => (
        <div key={i} style={{ position:'absolute', width:'16px', height:'16px', background:'var(--board-rivet)', borderRadius:'50%', boxShadow:'2px 2px 0 var(--board-shadow)', zIndex:2, ...pos }} />
      ))}

      <div style={{ display:'grid', gridTemplateColumns:'repeat(15,1fr)', gridTemplateRows:'repeat(15,1fr)', gap:'1px', backgroundColor:'var(--board-grid-bg)', width:'100%', height:'100%' }}>
        {tempGrid.map((row, r) => row.map((tile, c) => {
          const bonusKey = getBonus(r, c);
          const bonus    = BONUS_STYLES[bonusKey];
          const cellKey  = `${r}-${c}`;
          const isTemp   = !!tempMap[cellKey];
          const isPerm   = grid[r][c] !== null;
          const isHovered = hoverCell === cellKey;
          const isDraggingFrom = dragSource?.type==='board' && dragSource.fromR===r && dragSource.fromC===c;

          let cellBg;
          if (tile)                      cellBg = 'transparent';
          else if (isHovered && !isPerm) cellBg = 'var(--board-cell-hover)';
          else if (bonus.bg)             cellBg = bonus.bg;
          else                           cellBg = 'var(--board-cell-empty)';

          // Attributs data-tutorial pour le tutoriel
          const tutorialAttr = {};
          const cellRef = (r === 7 && c === 7) ? boardCenterRef : undefined;
          if (r === 7 && c === 7)  tutorialAttr['data-tutorial'] = 'board-center';
          if (r === 0 && c === 0)  tutorialAttr['data-tutorial'] = 'board-bonus';

          return (
            <div
              key={cellKey}
              ref={cellRef}
              {...tutorialAttr}
              style={{ display:'flex', justifyContent:'center', alignItems:'center', backgroundColor:cellBg, borderRadius:'1px', transition:'background 0.08s', position:'relative', outline: isHovered&&!isPerm&&!isTemp?'2px solid rgba(200,168,48,0.8)':'none', outlineOffset:'-1px', opacity:isDraggingFrom?0.35:1, overflow:'hidden' }}
              onDragOver={(e) => handleDragOver(e, r, c)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, r, c)}
            >
              {tile ? (
                <TileBoardCell tile={tile} isTemp={isTemp} r={r} c={c} onReturnTile={onReturnTile} onDragStart={handleBoardTileDragStart} />
              ) : (
                bonus.label && (
                  <span style={{ fontSize:'clamp(0.4rem,1.1vw,0.65rem)', fontWeight:700, color:bonus.text, fontFamily:"'DM Mono', monospace", textAlign:'center', lineHeight:1, letterSpacing:'-0.02em', pointerEvents:'none' }}>
                    {bonus.label}
                  </span>
                )
              )}
            </div>
          );
        }))}
      </div>
    </div>
  );
};

const TileBoardCell = ({ tile, isTemp, r, c, onReturnTile, onDragStart }) => {
  const [isOver, setIsOver] = useState(false);

  if (isTemp) {
    return (
      <div
        draggable onDragStart={(e) => onDragStart(e, r, c)}
        onClick={() => onReturnTile(r, c)}
        onMouseEnter={() => setIsOver(true)} onMouseLeave={() => setIsOver(false)}
        title="Cliquez pour récupérer — glissez pour déplacer"
        style={{ width:'100%', height:'100%', display:'flex', flexDirection:'column', justifyContent:'center', alignItems:'center', position:'relative', background: isOver ? 'var(--tile-temp-shadow)' : 'var(--tile-temp-bg)', border:'2px solid var(--tile-temp-border)', boxShadow:'2px 2px 0 var(--tile-temp-shadow)', cursor:'grab', borderRadius:'2px', transition:'background 0.1s, transform 0.1s', transform: isOver ? 'scale(1.05)' : 'none' }}
      >
        <span style={{ fontSize:'clamp(0.7rem,1.8vw,1.1rem)', fontWeight:700, color:'var(--tile-temp-text)', fontFamily:"'Playfair Display', Georgia, serif", lineHeight:1, pointerEvents:'none' }}>
          {tile.letter === '*' ? '★' : tile.letter}
        </span>
        {tile.score > 0 && (
          <span style={{ position:'absolute', bottom:'2px', right:'3px', fontSize:'clamp(0.35rem,0.8vw,0.5rem)', color:'var(--tile-temp-text)', fontFamily:"'DM Mono', monospace", lineHeight:1, pointerEvents:'none', opacity:0.8 }}>
            {tile.score}
          </span>
        )}
        {isOver && (
          <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,0.1)', borderRadius:'2px', pointerEvents:'none' }}>
            <span style={{ fontSize:'clamp(0.5rem,1.2vw,0.8rem)', color:'var(--tile-temp-text)' }}>↩</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ width:'100%', height:'100%', display:'flex', flexDirection:'column', justifyContent:'center', alignItems:'center', position:'relative', background: tile.letter==='*'?'var(--tile-joker-bg)':'var(--tile-bg)', border:`2px solid ${tile.letter==='*'?'var(--tile-joker-border)':'var(--tile-border)'}`, boxShadow:'2px 2px 0 var(--tile-shadow)', borderRadius:'2px' }}>
      <span style={{ fontSize:'clamp(0.7rem,1.8vw,1.1rem)', fontWeight:700, color:'var(--tile-text)', fontFamily:"'Playfair Display', Georgia, serif", lineHeight:1 }}>
        {tile.letter === '*' ? '★' : tile.letter}
      </span>
      {tile.score > 0 && (
        <span style={{ position:'absolute', bottom:'2px', right:'3px', fontSize:'clamp(0.35rem,0.8vw,0.5rem)', color:'var(--tile-score)', fontFamily:"'DM Mono', monospace", lineHeight:1 }}>
          {tile.score}
        </span>
      )}
    </div>
  );
};

export default Board;