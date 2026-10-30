// src/api/friendsService.js
// Appels REST vers /api/v2/friends/* et /api/v2/users/* (lot 4 : amis, groupes, blocages).
// Les erreurs axios sont propagées : la page lit `response.data.detail`.

import { api } from './axiosInstance';

/** { my_code, friends, incoming, outgoing, groups, blocked } */
export const getFriends = async () => (await api.get('/friends')).data;
// Liste légère (identifiant, pseudo, avatar, uid) : sélecteurs d'invitation et messagerie
export const getFriendsList = async () => (await api.get('/friends/list')).data;
export const getMyBlocks    = async () => (await api.get('/users/me/blocks')).data.blocked_ids;

/** Demande par code ami ou identifiant → { status: 'pending' | 'accepted', request_id, user } */
export const sendFriendRequest = async ({ friendCode, userId }) =>
  (await api.post('/friends/requests', friendCode ? { friend_code: friendCode } : { user_id: userId })).data;

export const acceptRequest  = async (id) => (await api.post(`/friends/requests/${id}/accept`)).data;
export const declineRequest = async (id) => { await api.post(`/friends/requests/${id}/decline`); };
export const cancelRequest  = async (id) => { await api.delete(`/friends/requests/${id}`); };
export const removeFriend   = async (userId) => { await api.delete(`/friends/${userId}`); };

/** Recherche par pseudo ou code ami → [{ user_id, display_name, friend_code, relation, … }] */
export const searchUsers = async (q) => (await api.get('/users/search', { params: { q } })).data;

export const blockUser   = async (userId) => { await api.post(`/users/${userId}/block`); };
export const unblockUser = async (userId) => { await api.delete(`/users/${userId}/block`); };

export const createGroup     = async (name, color) => (await api.post('/friends/groups', { name, color })).data;
export const updateGroup     = async (id, patch) => (await api.patch(`/friends/groups/${id}`, patch)).data;
export const deleteGroup     = async (id) => { await api.delete(`/friends/groups/${id}`); };
export const setGroupMembers = async (id, friendIds) =>
  (await api.put(`/friends/groups/${id}/members`, { friend_ids: friendIds })).data;
