// frontend/src/api/gameService.js
import axios from 'axios';

const BASE = import.meta.env.VITE_API_BASE_URL
  || 'https://scrabblefull-stack-production.up.railway.app';

const API_URL = `${BASE}/game`;

export const startGame = async (playerNames, difficulty = 'medium') => {
    try {
        const response = await axios.post(
            `${API_URL}/start?difficulty=${difficulty}`,
            playerNames
        );
        return response.data;
    } catch (error) {
        console.error("Erreur au démarrage de la partie:", error);
        throw error;
    }
};

export const getGameStatus = async (gameId) => {
    const response = await axios.get(`${API_URL}/status/${gameId}`);
    return response.data;
};

export const playWord = async (gameId, playerId, placements) => {
    const response = await axios.post(
        `${API_URL}/play/${gameId}?player_id=${playerId}`,
        placements
    );
    return response.data.game_state;
};

export const passTurn = async (gameId, playerId) => {
    const response = await axios.post(`${API_URL}/pass/${gameId}?player_id=${playerId}`);
    return response.data.game_state;
};

export const swapTiles = async (gameId, playerId, letters) => {
    const response = await axios.post(
        `${API_URL}/swap/${gameId}?player_id=${playerId}`,
        letters
    );
    return response.data.game_state;
};

export const shuffleRack = async (gameId, playerId) => {
    const response = await axios.post(`${API_URL}/shuffle/${gameId}?player_id=${playerId}`);
    return response.data.game_state;
};

export const aiPlayTurn = async (gameId) => {
    const response = await axios.post(`${API_URL}/ai/play/${gameId}`);
    return response.data.game_state;
};

export const getDifficulties = async () => {
    const response = await axios.get(`${API_URL}/difficulties`);
    return response.data;
};

export const abandonGame = async (gameId, playerId) => {
    const response = await axios.post(
        `${API_URL}/abandon/${gameId}?player_id=${playerId}`
    );
    // Retourne le GameState final (status FINISHED, winner_name = IA)
    return response.data.game_state;
};