const BASE = import.meta.env.VITE_API_URL;

/**
 * Standardized API call wrapper that handles errors and Bearer token injection
 */
async function apiCall(method, path, token = null, body = null) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    ...(body && { body: JSON.stringify(body) }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return data;
}

// Exchange a Monday.com session token for an APlus JWT
export async function mondayAuth(sessionToken) {
  return apiCall('POST', '/auth/monday', null, { sessionToken });
}

// Register/sync a Monday.com board with our DB
export async function syncBoard(mondayBoardId, name, token) {
  return apiCall('POST', '/api/boards/sync', token, { mondayBoardId, name });
}

// Fetch all messages for a board
export async function getMessages(boardId, token) {
  return apiCall('GET', `/api/messages/${boardId}`, token);
}

// Send a message to a board
export async function sendMessage(boardId, content, token) {
  return apiCall('POST', '/api/messages', token, { boardId, content });
}

// Invite a client to a board
export async function createInvite(email, boardId, token) {
  return apiCall('POST', '/api/invites', token, { email, boardId });
}

// List clients on a board
export async function getParticipants(boardId, token) {
  return apiCall('GET', `/api/boards/${boardId}/participants`, token);
}

// Cut a client's access to a board
export async function revokeAccess(boardId, userId, token) {
  return apiCall('DELETE', `/api/boards/${boardId}/participants/${userId}`, token);
}
