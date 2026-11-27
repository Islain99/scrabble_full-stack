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
//   #/admin/subscriptions   niveaux d'abonnement (lot A3)
//   #/admin/credits         règles des crédits et grand livre (lot A3)
//   #/admin/messaging       signalements, sourdines, règles de la messagerie (lot A4)
//   #/admin/profile         champs du profil exigés et montrés (lot A4)
//   #/admin/publications    annonces : bandeau et notifications (lot A4)

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
import AdminSubscriptions from '../components/admin/AdminSubscriptions';
import AdminCredits from '../components/admin/AdminCredits';
import AdminMessaging from '../components/admin/AdminMessaging';
import AdminProfileFields from '../components/admin/AdminProfileFields';
import AdminPublications from '../components/admin/AdminPublications';
import '../styles/admin.css';

const SECTIONS = [
  { id: 'overview',      icon: '◧', ready: true },
  { id: 'users',         icon: '☺', ready: true },
  { id: 'journal',       icon: '≡', ready: true },
  { id: 'settings',      icon: '⚙', ready: true },
  { id: 'privacy',       icon: '§', ready: true },
  { id: 'subscriptions', icon: '★', ready: true },
  { id: 'credits',       icon: '◎', ready: true },
  { id: 'messaging',     icon: '✉', ready: true },
  { id: 'profile',       icon: '▤', ready: true },
  { id: 'publications',  icon: '✦', ready: true },
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
  else if (section === 'subscriptions') body = <AdminSubscriptions />;
  else if (section === 'credits') body = <AdminCredits />;
  else if (section === 'messaging') body = <AdminMessaging />;
  else if (section === 'profile') body = <AdminProfileFields />;
  else if (section === 'publications') body = <AdminPublications />;
  else if (section === 'overview') body = <AdminOverview />;
  else body = <AdminOverview />;

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
