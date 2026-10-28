// src/api/notificationsService.js
// Invitations à jouer et notifications (lot 5). Les erreurs axios sont propagées.

import { api } from './axiosInstance';

/** Invite un ami dans sa salle d'attente (créée au besoin avec `settings`) → { invitation_id, room_id, status } */
export const inviteFriend = async (userId, settings = null) =>
  (await api.post(`/friends/${userId}/invite`, settings ? { settings } : undefined)).data;

/** Invitations et demandes d'ami en attente (repli quand le temps réel est indisponible). */
export const listNotifications = async () => (await api.get('/notifications')).data;

/** Accepte une invitation → état de la salle (RoomStateResponse), la partie démarre. */
export const acceptInvitation  = async (id) => (await api.post(`/invitations/${id}/accept`)).data;
export const declineInvitation = async (id) => { await api.post(`/invitations/${id}/decline`); };
export const dismissNotification = async (key) => { await api.delete(`/notifications/${encodeURIComponent(key)}`); };

/** Hôte : invitations envoyées pour sa salle → [{ invitation_id, invitee_id, invitee_name, status }] */
export const roomInvitations = async (roomId) =>
  (await api.get(`/multiplayer/rooms/${encodeURIComponent(roomId)}/invitations`)).data;
