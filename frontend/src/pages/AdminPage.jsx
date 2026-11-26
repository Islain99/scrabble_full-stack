// src/pages/AdminPage.jsx
// Dashboard administrateur. Réservé aux comptes is_admin (le serveur vérifie aussi).
//
//   #/admin                 vue d'ensemble
//   #/admin/users           joueurs            #/admin/users/{id}   fiche d'un joueur
//   #/admin/journal         journal des actions
//
//   #/admin/settings        paramètres des joueurs (lot A2)
//   #/admin/privacy         politique de confidentialité (lot A2)
//
// Rubriques des lots suivants (affichées « bientôt ») : abonnements et crédits (A3),
// messagerie, profil, notifications et publications (A4).

import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { PageHeader } from '../components/ui';
import AdminOverview from '../components/admin/AdminOverview';
import AdminUsers from '../components/admin/AdminUsers';
import AdminUserDetail from '../components/admin/AdminUserDetail';
import AdminJournal from '../components/admin/AdminJournal';
import AdminSettings from '../components/admin/AdminSettings';
import AdminPrivacy from '../components/admin/AdminPrivacy';
import '../styles/admin.css';

const SECTIONS = [
  { id: 'overview',      icon: '◧', ready: true },
  { id: 'users',         icon: '☺', ready: true },
  { id: 'journal',       icon: '≡', ready: true },
  { id: 'settings',      icon: '⚙', ready: true },
  { id: 'privacy',       icon: '§', ready: true },
  { id: 'subscriptions', icon: '★', lot: 'A3' },
  { id: 'credits',       icon: '◎', lot: 'A3' },
  { id: 'messaging',     icon: '✉', lot: 'A4' },
  { id: 'profile',       icon: '▤', lot: 'A4' },
  { id: 'publications',  icon: '✦', lot: 'A4' },
];

function parseRoute() {
  const path = (window.location.hash || '').split('?')[0].replace(/^#\/admin\/?/, '');
  const [section = 'overview', id] = path.split('/');
  return { section: SECTIONS.some(s => s.id === section) ? section : 'overview', id: id ? Number(id) : null };
}

function useAdminRoute() {
  const [route, setRoute] = useState(parseRoute);
  useEffect(() => {
    const onHash = () => setRoute(parseRoute());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return route;
}

function Soon({ section, t }) {
  return (
    <div className="adm-soon">
      <p className="adm-soon-title">{t(`adm_nav_${section.id}`)}</p>
      <p className="acc-text">{t(`adm_soon_${section.id}`)}</p>
      <p className="adm-hint">{t('adm_soon_lot', { lot: section.lot })}</p>
    </div>
  );
}

export default function AdminPage() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const { section, id } = useAdminRoute();

  if (!user?.is_admin) {
    return (
      <main className="adm-page">
        <PageHeader title={t('adm_title')} />
        <p className="st-note" data-tone="error">{t('adm_forbidden')}</p>
      </main>
    );
  }

  const current = SECTIONS.find(s => s.id === section);
  let body;
  if (section === 'users') body = Number.isFinite(id) && id > 0 ? <AdminUserDetail key={id} userId={id} /> : <AdminUsers />;
  else if (section === 'journal') body = <AdminJournal />;
  else if (section === 'settings') body = <AdminSettings />;
  else if (section === 'privacy') body = <AdminPrivacy />;
  else if (section === 'overview') body = <AdminOverview />;
  else body = <Soon section={current} t={t} />;

  return (
    <main className="adm-page">
      <PageHeader title={t('adm_title')} subtitle={t('adm_subtitle')} />
      <div className="adm-layout">
        <nav className="adm-nav" aria-label={t('adm_title')}>
          {SECTIONS.map(s => (
            <a key={s.id} href={`#/admin${s.id === 'overview' ? '' : `/${s.id}`}`} className="adm-nav-link"
               aria-current={s.id === section ? 'page' : undefined} data-soon={!s.ready || undefined}>
              <span className="adm-nav-icon" aria-hidden="true">{s.icon}</span>
              <span>{t(`adm_nav_${s.id}`)}</span>
              {!s.ready && <span className="adm-nav-soon">{t('adm_soon')}</span>}
            </a>
          ))}
        </nav>
        <section className="adm-content" aria-label={t(`adm_nav_${current.id}`)}>
          <h2 className="adm-section-title">{t(`adm_nav_${current.id}`)}</h2>
          {body}
        </section>
      </div>
    </main>
  );
}
