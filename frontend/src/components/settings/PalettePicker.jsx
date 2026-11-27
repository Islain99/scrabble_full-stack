// src/components/settings/PalettePicker.jsx
// Sélecteur de palette de couleurs.
//
// Astuce : chaque aperçu porte lui-même data-palette + data-theme. Les
// variables CSS de styles/palettes.css s'appliquent donc à l'aperçu seul,
// qui montre les vraies couleurs de la palette (dans le mode actuel)
// sans rien dupliquer en JavaScript.
import React, { useState } from 'react';
import { useTheme }    from '../../context/ThemeContext';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import { useEconomyOptional } from '../../context/EconomyContext';

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
 * @param {string[]} [only]           palettes à montrer (page Crédits : les premium)
 *
 * Lot A3 : une palette premium pas encore débloquée porte un cadenas et son prix.
 * En grille, la choisir propose de la débloquer ; en pastilles, mène à la page Crédits.
 */
export default function PalettePicker({ variant = 'grid', onPick, only }) {
  const { palette, setPalette, PALETTES, resolvedTheme, lockedPalettes } = useTheme();
  const { t } = useLanguage();
  const economy = useEconomyOptional();
  const { isAuthenticated } = useAuth();
  const [offer, setOffer] = useState(null);          // palette premium proposée au déblocage
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const list = only ? PALETTES.filter(id => only.includes(id)) : PALETTES;
  const locked = (id) => lockedPalettes?.has(id);
  const price = (id) => economy?.premiumPalettes?.[id];

  const pick = (id) => {
    if (locked(id)) {
      if (variant === 'compact') { window.location.assign('#/credits'); onPick?.(id); return; }
      setError(null);
      setOffer(id);
      return;
    }
    setOffer(null);
    setPalette(id);
    onPick?.(id);
  };

  const unlock = async () => {
    setBusy(true); setError(null);
    try {
      await economy.unlockPalette(offer);
      const id = offer;
      setOffer(null);
      // Débloquée : appliquée tout de suite
      setPalette(id, { justUnlocked: true });
      onPick?.(id);
    } catch (err) {
      setError(err?.response?.data?.detail || t('eco_unlock_error'));
    } finally {
      setBusy(false);
    }
  };

  if (variant === 'compact') {
    return (
      <div className="pp-compact" role="radiogroup" aria-label={t('row_palette')}>
        {list.map(id => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={palette === id}
            title={`${t(`palette_${id}`)} — ${locked(id) ? t('eco_palette_locked', { price: price(id) }) : t(`palette_${id}_desc`)}`}
            aria-label={locked(id) ? `${t(`palette_${id}`)} (${t('eco_palette_locked', { price: price(id) })})` : t(`palette_${id}`)}
            className="pp-swatch"
            data-locked={locked(id) || undefined}
            onClick={() => pick(id)}
          >
            <span className="pp-swatch-inner" data-palette={id} data-theme={resolvedTheme}>
              <span style={{ background: 'var(--bg-page)' }} />
              <span style={{ background: 'var(--tobacco)' }} />
              <span style={{ background: 'var(--board-grid-bg)' }} />
            </span>
            {locked(id) && <span className="pp-lock" aria-hidden="true">🔒</span>}
          </button>
        ))}
      </div>
    );
  }

  const balance = economy?.credits ?? 0;
  return (
    <div className="pp-wrap">
      <div className="pp-grid" role="radiogroup" aria-label={t('row_palette')}>
        {list.map(id => {
          const active = palette === id && !locked(id);
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={active}
              className="pp-card"
              data-locked={locked(id) || undefined}
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
                  {locked(id) && <span className="pp-price">🔒 {price(id)}</span>}
                  {!locked(id) && price(id) && only && <span className="pp-price" data-owned="">✓ {t('eco_owned')}</span>}
                </span>
                <span className="pp-desc">{t(`palette_${id}_desc`)}</span>
              </div>
            </button>
          );
        })}
      </div>

      {offer && (
        <div className="pp-offer" role="dialog" aria-label={t('eco_unlock_title', { name: t(`palette_${offer}`) })}>
          {!isAuthenticated ? (
            <p className="pp-offer-text">{t('eco_unlock_login')}</p>
          ) : balance < price(offer) ? (
            <p className="pp-offer-text">
              {t('eco_unlock_short', { name: t(`palette_${offer}`), price: price(offer), balance })}{' '}
              <a className="pp-link" href="#/credits">{t('eco_how_to_earn')}</a>
            </p>
          ) : (
            <p className="pp-offer-text">{t('eco_unlock_confirm', { name: t(`palette_${offer}`), price: price(offer), balance })}</p>
          )}
          {error && <p className="pp-offer-text" data-tone="error" role="alert">{error}</p>}
          <div className="pp-offer-actions">
            {isAuthenticated && balance >= price(offer) && (
              <button type="button" className="s-chip" data-active="true" disabled={busy} onClick={unlock}>
                {t('eco_unlock_btn', { price: price(offer) })}
              </button>
            )}
            <button type="button" className="s-chip" disabled={busy} onClick={() => setOffer(null)}>{t('btn_cancel')}</button>
          </div>
        </div>
      )}
    </div>
  );
}
