import axios from 'axios';

// URL de base de notre API FastAPI
const API_URL = 'http://localhost:8000/game';

// Fonction pour démarrer une nouvelle partie
export const startGame = async (playerNames) => {
    try {
        const response = await axios.post(`${API_URL}/start`, playerNames);
        return response.data;
    } catch (error) {
        console.error("Erreur au démarrage de la partie:", error);
        throw error;
    }
};

// Fonction pour obtenir l'état actuel de la partie
export const getGameStatus = async (gameId) => { // CORRIGÉ: Prend gameId
    const response = await axios.get(`${API_URL}/status/${gameId}`); 
    return response.data;
};

// Fonction pour jouer un mot
export const playWord = async (gameId, playerId, placements) => { // CORRIGÉ: Prend gameId
    // Notez que playerId est passé en query param ou dans le body selon l'API design.
    // Ici, nous utilisons l'ID dans le paramètre de requête pour respecter l'API Python
    const response = await axios.post(`${API_URL}/play/${gameId}?player_id=${playerId}`, placements); 
    return response.data.game_state; // Renvoie directement l'état mis à jour
};

// Fonction pour passer son tour
export const passTurn = async (gameId, playerId) => { // CORRIGÉ: Prend gameId
    const response = await axios.post(`${API_URL}/pass/${gameId}?player_id=${playerId}`);
    return response.data.game_state; 
};

// Fonction pour échanger des tuiles
export const swapTiles = async (gameId, playerId, letters) => { // CORRIGÉ: Prend gameId
    const response = await axios.post(`${API_URL}/swap/${gameId}?player_id=${playerId}`, letters);
    return response.data.game_state; 
};

// NOUVEAU: Fonction pour mélanger les tuiles du rack
export const shuffleRack = async (gameId, playerId) => { // NOUVEAU
    const response = await axios.post(`${API_URL}/shuffle/${gameId}?player_id=${playerId}`); 
    return response.data.game_state;
};

// NOUVEAU: Fonction pour que l'IA joue son tour
export const aiPlayTurn = async (gameId) => {
    // Note: L'API n'a pas besoin de playerId ici car le backend vérifie qui est le joueur actuel
    const response = await axios.post(`${API_URL}/ai/play/${gameId}`); 
    return response.data.game_state; 
};