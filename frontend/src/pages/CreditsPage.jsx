// src/pages/CreditsPage.jsx
// Mes crédits (lot A3) : solde, niveau d'abonnement, comment gagner des crédits,
// à quoi les dépenser (indices, palettes premium), et l'historique des mouvements.
// Page #/credits, réservée aux joueurs connectés.

import React, { useEffect, useState } from 'react';
import { useEconomy } from '../context/EconomyContext';
import { useLanguage } from '../context/LanguageContext';
import { getMyTransactions } from '../api/economyService';
import { Card, PageHeader, RetroButton, Spinner } from '../components/ui';
import TierBadge from '../components/TierBadge';
import PalettePicker from '../components/settings/PalettePicker';

const DIFFS = ['beginner', 'easy', 'medium', 'hard_minus', 'hard'];
const LOCALES = { fr: 'fr-CA', en: 'en-CA' };
const PAGE = 30;

function EarnRow({ label, amount, t }) {
  return (
    <li className="cr-earn">
      <span>{label}</span>
      <span className="cr-amount" data-sign="+">{t('eco_amount_plus', { count: amount })}</span>
    </li>
  );
}

export default function CreditsPage() {
  const { wallet, rules, tierOf, premiumPalettes, refreshWallet } = useEconomy();
  const { t, language } = useLanguage();
  const [history, setHistory] = useState(null);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    refreshWallet();
    getMyTransactions({ limit: PAGE })
      .then(rows => { if (!cancelled) { setHistory(rows); setMore(rows.length === PAGE); } })
      .catch(() => { if (!cancelled) setHistory([]); });
    return () => { cancelled = true; };
  }, [refreshWallet]);

  const loadMore = async () => {
    setBusy(true);
    try {
      const rows = await getMyTransactions({ limit: PAGE, beforeId: history[history.length - 1].id });
      setHistory(h => [...h, ...rows]);
      setMore(rows.length === PAGE);
    } finally {
      setBusy(false);
    }
  };

  const fmtDate = (iso) => new Intl.DateTimeFormat(LOCALES[language] ?? language, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
  const n = (v) => new Intl.NumberFormat(LOCALES[language] ?? language).format(v ?? 0);

  if (!wallet || !rules) return <div className="s-page"><div className="s-container cr-loading"><Spinner size={20} /></div></div>;

  const tier = tierOf(wallet.tier_id);
  const tierName = tier ? (language === 'en' ? tier.name_en : tier.name_fr) : null;
  const tierDesc = tier ? (language === 'en' ? tier.description_en : tier.description_fr) : null;
  const premiumIds = Object.keys(premiumPalettes);

  return (
    <div className="s-page">
      <div className="s-container cr-page">
        <PageHeader title={t('eco_title')} subtitle={t('eco_subtitle')} />

        {!rules.enabled && <p className="st-note" data-tone="warn">{t('eco_disabled')}</p>}

        <div className="cr-top">
          <Card>
            <Card.Body className="cr-balance">
              <span className="cr-label">{t('eco_balance')}</span>
              <span className="cr-big">🪙 {n(wallet.credits)}</span>
              <span className="cr-hint">
                {rules.daily_game_cap
                  ? t('eco_today_cap', { count: n(wallet.earned_today_games), cap: n(rules.daily_game_cap) })
                  : t('eco_today', { count: n(wallet.earned_today_games) })}
              </span>
            </Card.Body>
          </Card>
          {tier && (
            <Card>
              <Card.Body className="cr-balance">
                <span className="cr-label">{t('eco_my_tier')}</span>
                <span className="cr-tier">
                  <span className="cr-tier-name" style={{ color: 'var(--text-primary)' }}>{tierName}</span>
                  <TierBadge tier={tier} />
                </span>
                <span className="cr-hint">
                  {wallet.tier_expires_at
                    ? t('eco_tier_until', { date: fmtDate(wallet.tier_expires_at) })
                    : tierDesc || t('eco_tier_free')}
                </span>
              </Card.Body>
            </Card>
          )}
        </div>

        <div className="cr-two">
          <Card>
            <Card.Header><span className="cr-h">{t('eco_earn_title')}</span></Card.Header>
            <Card.Body>
              <ul className="cr-list">
                <EarnRow label={t('eco_earn_daily')} amount={rules.daily_login} t={t} />
                {DIFFS.filter(d => rules.solo_win[d]).map(d => (
                  <EarnRow key={d} label={t('eco_earn_solo', { level: t(`diff_${d}_label`) })} amount={rules.solo_win[d]} t={t} />
                ))}
                <EarnRow label={t('eco_earn_mp_win')} amount={rules.mp_win} t={t} />
                <EarnRow label={t('eco_earn_mp_draw')} amount={rules.mp_draw} t={t} />
                <EarnRow label={t('eco_earn_mp_loss')} amount={rules.mp_loss} t={t} />
              </ul>
              {rules.daily_game_cap > 0 && <p className="cr-note">{t('eco_cap_note', { cap: n(rules.daily_game_cap) })}</p>}
            </Card.Body>
          </Card>

          <Card>
            <Card.Header><span className="cr-h">{t('eco_spend_title')}</span></Card.Header>
            <Card.Body>
              <ul className="cr-list">
                <li className="cr-earn">
                  <span>{t('eco_spend_hint')}</span>
                  <span className="cr-amount">{rules.hint_price ? t('eco_amount', { count: rules.hint_price }) : t('eco_free')}</span>
                </li>
              </ul>
              <p className="cr-note">
                {rules.hints_per_game ? t('eco_hint_limit', { count: rules.hints_per_game }) : t('eco_hint_nolimit')}
              </p>
            </Card.Body>
          </Card>
        </div>

        {premiumIds.length > 0 && (
          <Card>
            <Card.Header><span className="cr-h">{t('eco_palettes_title')}</span></Card.Header>
            <Card.Body>
              <p className="cr-note" style={{ margin: '0 0 12px' }}>{t('eco_palettes_intro')}</p>
              <PalettePicker only={premiumIds} />
            </Card.Body>
          </Card>
        )}

        <Card>
          <Card.Header><span className="cr-h">{t('eco_history')}</span></Card.Header>
          <Card.Body>
            {history === null ? <Spinner size={16} /> : history.length === 0 ? (
              <p className="cr-note">{t('eco_history_empty')}</p>
            ) : (
              <>
                <ul className="cr-history">
                  {history.map(tx => (
                    <li key={tx.id}>
                      <span className="cr-hist-main">
                        <span>{t(`eco_kind_${tx.kind}`)}</span>
                        {tx.note && <span className="cr-hint">{tx.note}</span>}
                      </span>
                      <span className="cr-amount" data-sign={tx.amount > 0 ? '+' : tx.amount < 0 ? '-' : '0'}>
                        {tx.amount > 0 ? '+' : ''}{n(tx.amount)}
                      </span>
                      <span className="cr-hint cr-hist-date">{fmtDate(tx.created_at)} · {t('eco_after', { count: n(tx.balance_after) })}</span>
                    </li>
                  ))}
                </ul>
                {more && <RetroButton disabled={busy} onClick={loadMore}>{t('eco_load_more')}</RetroButton>}
              </>
            )}
          </Card.Body>
        </Card>
      </div>
    </div>
  );
}
