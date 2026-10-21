// utils/scoring.js
//
// Aperçu du score d'un coup, calculé côté client pendant que le joueur pose
// ses tuiles. Même règle que GameEngine._calculate_score (backend) :
//   - chaque mot formé compte TOUTES ses lettres, y compris celles déjà
//     présentes sur le plateau ;
//   - les bonus (DL/TL/DM/TM) ne s'appliquent qu'aux cases posées ce tour-ci ;
//   - +50 points si les 7 tuiles sont posées (scrabble).
// Le score officiel reste celui renvoyé par le serveur.

import { POINTS_LETTRES, BONUS_MAP } from '../data/constants';

const SIZE = 15;
const SCRABBLE_BONUS = 50;

const inBoard = (r, c) => r >= 0 && r < SIZE && c >= 0 && c < SIZE;

/** Valeur d'une tuile posée ce tour-ci (un joker vaut 0). */
function placedTileScore(p) {
  const s = p.originalTile?.score;
  if (typeof s === 'number') return s;
  return POINTS_LETTRES[p.letter] || 0;
}

/**
 * @param {Array<{r:number, c:number, letter:string, originalTile?:{score:number}}>} placements
 * @param {Array<Array<{letter:string, score:number}|null>>|undefined} grid  plateau AVANT le coup
 * @returns {number}
 */
export function calculatePreviewScore(placements, grid) {
  if (!placements?.length) return 0;

  const rows = new Set(placements.map(p => p.r));
  const cols = new Set(placements.map(p => p.c));
  if (rows.size > 1 && cols.size > 1) return 0; // ni ligne ni colonne

  const placedAt = new Map(placements.map(p => [`${p.r}-${p.c}`, p]));

  // Valeur de la case (r,c) : tuile posée ce tour-ci, tuile existante, ou null si vide
  const cellScore = (r, c) => {
    const placed = placedAt.get(`${r}-${c}`);
    if (placed) return placedTileScore(placed);
    const existing = grid?.[r]?.[c];
    return existing ? (existing.score ?? POINTS_LETTRES[existing.letter] ?? 0) : null;
  };

  // Cases d'un mot passant par (r,c) dans la direction (dr,dc)
  const span = (r, c, dr, dc) => {
    while (inBoard(r - dr, c - dc) && cellScore(r - dr, c - dc) !== null) {
      r -= dr; c -= dc;
    }
    const cells = [];
    while (inBoard(r, c) && cellScore(r, c) !== null) {
      cells.push([r, c]);
      r += dr; c += dc;
    }
    return cells;
  };

  const { r: r0, c: c0 } = placements[0];
  const candidates = [];
  if (rows.size === 1) candidates.push(span(r0, c0, 0, 1));
  if (cols.size === 1) candidates.push(span(r0, c0, 1, 0));
  if (placements.length > 1) {
    const [dr, dc] = rows.size === 1 ? [1, 0] : [0, 1];
    placements.forEach(p => candidates.push(span(p.r, p.c, dr, dc)));
  }

  const seen = new Set();
  let total = 0;
  for (const cells of candidates) {
    const key = cells.map(([r, c]) => `${r}-${c}`).join('|');
    if (cells.length < 2 || seen.has(key)) continue;
    seen.add(key);

    let wordScore = 0;
    let wordMult = 1;
    for (const [r, c] of cells) {
      let letterScore = cellScore(r, c);
      if (placedAt.has(`${r}-${c}`)) {
        const bonus = BONUS_MAP[`${r}-${c}`];
        if (bonus === 'DL') letterScore *= 2;
        else if (bonus === 'TL') letterScore *= 3;
        else if (bonus === 'DM') wordMult *= 2;
        else if (bonus === 'TM') wordMult *= 3;
      }
      wordScore += letterScore;
    }
    total += wordScore * wordMult;
  }

  if (placements.length === 7) total += SCRABBLE_BONUS;
  return total;
}
