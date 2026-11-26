// src/components/admin/AdminBarChart.jsx
// Histogramme quotidien d'une seule série (barres HTML, pas de dépendance).
// Une série → pas de légende : le titre la nomme. Survol / focus : infobulle.
// Bouton « Tableau » : les mêmes valeurs en tableau (lecteurs d'écran, impression).

import React, { useMemo, useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { formatDate, formatNumber } from './adminUtils';

const niceMax = (v) => {
  if (v <= 4) return 4;
  const pow = 10 ** Math.floor(Math.log10(v));
  // Deux intervalles (0, max/2, max) : max/2 doit être un pas « rond »
  return [1, 2, 2.5, 5, 10].find(s => s * pow * 2 >= v) * pow * 2;
};

export default function AdminBarChart({ title, points, valueKey }) {
  const { t, language } = useLanguage();
  const [hover, setHover] = useState(null);
  const [asTable, setAsTable] = useState(false);

  const values = points.map(p => p[valueKey] ?? 0);
  const total = values.reduce((a, b) => a + b, 0);
  const max = niceMax(Math.max(0, ...values));
  const ticks = [max, max / 2, 0];
  // Une étiquette d'axe sur ~6 pour ne pas chevaucher
  const every = Math.max(1, Math.ceil(points.length / 6));
  const shortDate = useMemo(
    () => new Intl.DateTimeFormat(language === 'en' ? 'en-CA' : 'fr-CA', { day: 'numeric', month: 'short' }),
    [language],
  );

  return (
    <figure className="adm-chart">
      <figcaption className="adm-chart-head">
        <span className="adm-chart-title">{title}</span>
        <span className="adm-chart-total">{t('adm_chart_total', { count: formatNumber(total, language) })}</span>
        <button type="button" className="s-chip" data-active={asTable} onClick={() => setAsTable(v => !v)}>
          {asTable ? t('adm_chart_as_chart') : t('adm_chart_as_table')}
        </button>
      </figcaption>

      {asTable ? (
        <div className="adm-table-wrap adm-chart-table">
          <table className="adm-table">
            <thead><tr><th>{t('adm_col_date')}</th><th className="num">{title}</th></tr></thead>
            <tbody>
              {points.map(p => (
                <tr key={p.date}><td>{formatDate(p.date + 'T12:00:00Z', language, false)}</td>
                  <td className="num">{formatNumber(p[valueKey], language)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="adm-chart-body">
          <div className="adm-chart-y" aria-hidden="true">
            {ticks.map(v => <span key={v}>{formatNumber(v, language)}</span>)}
          </div>
          <div className="adm-chart-plot" onMouseLeave={() => setHover(null)}>
            {ticks.map((v, i) => <span key={v} className="adm-chart-grid" style={{ top: `${(i / 2) * 100}%` }} />)}
            <div className="adm-chart-bars" role="list" aria-label={title}>
              {points.map((p, i) => {
                const v = p[valueKey] ?? 0;
                const label = `${formatDate(p.date + 'T12:00:00Z', language, false)} : ${formatNumber(v, language)}`;
                return (
                  <div
                    key={p.date}
                    role="listitem"
                    tabIndex={0}
                    aria-label={label}
                    className="adm-chart-slot"
                    data-active={hover === i || undefined}
                    onMouseEnter={() => setHover(i)}
                    onFocus={() => setHover(i)}
                    onBlur={() => setHover(null)}
                  >
                    <span className="adm-chart-bar" style={{ height: v ? `max(3px, ${(v / max) * 100}%)` : 0 }} />
                    {hover === i && (
                      <span className="adm-chart-tip" data-side={i > points.length / 2 ? 'left' : 'right'}
                            style={{ bottom: `calc(${Math.min(100, (v / max) * 100)}% + 6px)` }}>
                        <strong>{formatNumber(v, language)}</strong>
                        <span>{formatDate(p.date + 'T12:00:00Z', language, false)}</span>
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          <div className="adm-chart-x" aria-hidden="true">
            {points.map((p, i) => {
              const k = (points.length - 1 - i) / every;           // étiquettes comptées depuis aujourd'hui
              return (
                <span key={p.date} data-alt={Number.isInteger(k) && k % 2 === 1 ? '' : undefined}>
                  {Number.isInteger(k) ? shortDate.format(new Date(p.date + 'T12:00:00Z')) : ''}
                </span>
              );
            })}
          </div>
        </div>
      )}
    </figure>
  );
}
