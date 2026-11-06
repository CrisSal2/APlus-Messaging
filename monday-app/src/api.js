const BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

// Called when an authenticated request gets a 401 (expired/invalid token) so
// the app can re-authenticate. Set via setUnauthorizedHandler.
let unauthorizedHandler = null;
export function setUnauthorizedHandler(fn) {
  unauthorizedHandler = fn;
}

/**
 * Standardized API call wrapper: Bearer token injection and consistent errors.
 * Thrown errors carry `.status` (HTTP status, if any).
 */
async function apiCall(method, path, token = null, body = null) {
  if (!BASE) {
    throw new Error('VITE_API_URL is not configured.');
  }

  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      ...(body && { body: JSON.stringify(body) }),
    });
  } catch {
    throw new Error('Network error. Check your connection and try again.');
  }

  let data = null;
  try {
    data = await res.json();
  } catch {
    // non-JSON body (e.g. a proxy error page)
  }

  if (!res.ok) {
    if (res.status === 401 && token) unauthorizedHandler?.();
    const err = new Error(data?.error || `Request failed (HTTP ${res.status}).`);
    err.status = res.status;
    throw err;
  }
  if (data === null) {
    throw new Error('Unexpected response from the server.');
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

// Fetch messages for a board. With `after` (ISO timestamp), only newer ones.
export async function getMessages(boardId, token, after = null) {
  const qs = after ? `?after=${encodeURIComponent(after)}` : '';
  return apiCall('GET', `/api/messages/${boardId}${qs}`, token);
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
