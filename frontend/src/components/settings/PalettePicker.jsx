// src/components/settings/PalettePicker.jsx
// Sélecteur de palette de couleurs.
//
// Astuce : chaque aperçu porte lui-même data-palette + data-theme. Les
// variables CSS de styles/palettes.css s'appliquent donc à l'aperçu seul,
// qui montre les vraies couleurs de la palette (dans le mode actuel)
// sans rien dupliquer en JavaScript.
import React from 'react';
import { useTheme }    from '../../context/ThemeContext';
import { useLanguage } from '../../context/LanguageContext';

/** Mini-plateau 3×3 : case bonus, tuile posée, étoile… */
function PalettePreview() {
  const cells = [
    'bonus-tm', 'empty',    'bonus-dl',
    'empty',    'start',    'tile',
    'bonus-tl', 'tile',     'bonus-dm',
  ];
  return (
    <div className="pp-preview" aria-hidden="true">
      <div className="pp-board">
        {cells.map((c, i) => <span key={i} className={`pp-cell pp-cell--${c}`} />)}
      </div>
      <div className="pp-side">
        <span className="pp-line pp-line--title" />
        <span className="pp-line" />
        <div className="pp-dots">
          <span style={{ background: 'var(--tobacco)' }} />
          <span style={{ background: 'var(--olive)' }} />
          <span style={{ background: 'var(--gold)' }} />
        </div>
      </div>
    </div>
  );
}

/**
 * @param {'grid'|'compact'} variant  grid = cartes avec aperçu (Paramètres),
 *                                    compact = pastilles (menus de la barre)
 * @param {function} [onPick]         appelé après le choix (ex. fermer un menu)
 */
export default function PalettePicker({ variant = 'grid', onPick }) {
  const { palette, setPalette, PALETTES, resolvedTheme } = useTheme();
  const { t } = useLanguage();

  const pick = (id) => { setPalette(id); onPick?.(id); };

  if (variant === 'compact') {
    return (
      <div className="pp-compact" role="radiogroup" aria-label={t('row_palette')}>
        {PALETTES.map(id => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={palette === id}
            title={`${t(`palette_${id}`)} — ${t(`palette_${id}_desc`)}`}
            aria-label={t(`palette_${id}`)}
            className="pp-swatch"
            onClick={() => pick(id)}
          >
            <span className="pp-swatch-inner" data-palette={id} data-theme={resolvedTheme}>
              <span style={{ background: 'var(--bg-page)' }} />
              <span style={{ background: 'var(--tobacco)' }} />
              <span style={{ background: 'var(--board-grid-bg)' }} />
            </span>
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="pp-grid" role="radiogroup" aria-label={t('row_palette')}>
      {PALETTES.map(id => {
        const active = palette === id;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={active}
            className="pp-card"
            onClick={() => pick(id)}
          >
            {/* Zone « scopée » : reçoit les variables de la palette */}
            <div className="pp-scope" data-palette={id} data-theme={resolvedTheme}>
              <PalettePreview />
            </div>
            <div className="pp-meta">
              <span className="pp-name">
                {t(`palette_${id}`)}
                {active && <span className="pp-check" aria-hidden="true">✓</span>}
              </span>
              <span className="pp-desc">{t(`palette_${id}_desc`)}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
