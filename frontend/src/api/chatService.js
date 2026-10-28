// src/api/chatService.js
// Messagerie (lot 6) : /api/v2/chat/*. Les erreurs axios sont propagées.

import { api } from './axiosInstance';

export const listConversations = async () => (await api.get('/chat/conversations')).data;
export const openPrivate = async (userId) => (await api.post('/chat/conversations/private', { user_id: userId })).data;
export const createGroup = async (name, memberIds) =>
  (await api.post('/chat/conversations/group', { name, member_ids: memberIds })).data;
export const renameGroup = async (id, name) => (await api.patch(`/chat/conversations/${id}`, { name })).data;
export const addMembers = async (id, userIds) => (await api.post(`/chat/conversations/${id}/members`, { user_ids: userIds })).data;
export const removeMember = async (id, userId) => { await api.delete(`/chat/conversations/${id}/members/${userId}`); };
export const muteConversation = async (id, muted) => (await api.post(`/chat/conversations/${id}/mute`, { muted })).data;
export const gameConversation = async (roomId) => (await api.get(`/chat/rooms/${encodeURIComponent(roomId)}`)).data;

/** { messages: [...] (ancien → récent), has_more } */
export const listMessages = async (id, before = null, limit = 50) =>
  (await api.get(`/chat/conversations/${id}/messages`, { params: { limit, ...(before ? { before } : {}) } })).data;
export const sendMessage = async (id, body) => (await api.post(`/chat/conversations/${id}/messages`, { body })).data;
export const markRead = async (id) => { await api.post(`/chat/conversations/${id}/read`); };
export const deleteMessage = async (messageId) => { await api.delete(`/chat/messages/${messageId}`); };
export const reportMessage = async (messageId, reason) => { await api.post(`/chat/messages/${messageId}/report`, { reason }); };

// Administration
export const listReports = async () => (await api.get('/chat/admin/reports')).data;
export const resolveReport = async (id, action) => { await api.post(`/chat/admin/reports/${id}/resolve`, { action }); };
export const muteUser = async (userId, minutes) => { await api.post(`/chat/admin/users/${userId}/mute`, { minutes }); };
export const setSlowMode = async (seconds) => (await api.put('/chat/admin/global/slow-mode', { seconds })).data;
