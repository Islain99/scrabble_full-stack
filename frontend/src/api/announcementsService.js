// src/api/announcementsService.js
// Annonces de l'administrateur (lot A4) : celles du bandeau, pour le joueur
// connecté (ou un invité : seulement celles destinées à tout le monde).

import { api } from './axiosInstance';

export const getAnnouncements = async () => (await api.get('/announcements')).data;
