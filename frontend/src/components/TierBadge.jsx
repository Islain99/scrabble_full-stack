// src/components/TierBadge.jsx
// Badge d'abonnement à côté d'un pseudo (lot A3). Rien pour un niveau sans badge
// (le niveau par défaut, en général).
import React from 'react';
import { useEconomyOptional } from '../context/EconomyContext';
import { useLanguage } from '../context/LanguageContext';

/**
 * @param {number|null} tierId   niveau en vigueur (null = défaut)
 * @param {boolean} [withName]   affiche aussi le nom du niveau
 */
export default function TierBadge({ tierId, withName = false, tier: given }) {
  const economy = useEconomyOptional();
  const { language } = useLanguage();
  const tier = given ?? economy?.tierOf(tierId ?? null);
  if (!tier || !tier.badge) return null;
  const name = language === 'en' ? tier.name_en : tier.name_fr;
  return (
    <span className="tier-badge" style={{ '--tier-color': tier.color }} title={name} aria-label={name}>
      <span aria-hidden="true">{tier.badge}</span>
      {withName && <span className="tier-badge-name">{name}</span>}
    </span>
  );
}
