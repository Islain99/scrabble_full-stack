// src/components/admin/UserBadges.jsx
// Pastilles d'état d'un joueur : administrateur, désactivé, muet.
import React from 'react';
import { Badge } from '../ui';
import { isMuted } from './adminUtils';

export default function UserBadges({ user, t }) {
  return (
    <>
      {user.is_admin && <Badge variant="gold">{t('adm_badge_admin')}</Badge>}
      {!user.is_active && <Badge variant="brick">{t('adm_badge_disabled')}</Badge>}
      {isMuted(user) && <Badge variant="blue">{t('adm_badge_muted')}</Badge>}
    </>
  );
}
