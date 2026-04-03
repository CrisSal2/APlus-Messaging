const BASE = import.meta.env.VITE_API_URL;

// Exchange a Monday.com session token for an APlus JWT
export async function mondayAuth(sessionToken) {
  const res = await fetch(`${BASE}/auth/monday`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionToken }),
  });
  return res.json();
}

// Register/sync a Monday.com board with our DB
export async function syncBoard(mondayBoardId, name, token) {
  const res = await fetch(`${BASE}/api/boards/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ mondayBoardId, name }),
  });
  return res.json();
}

// Fetch all messages for a board
export async function getMessages(boardId, token) {
  const res = await fetch(`${BASE}/api/messages/${boardId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json();
}

// Send a message to a board
export async function sendMessage(boardId, content, token) {
  const res = await fetch(`${BASE}/api/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ boardId, content }),
  });
  return res.json();
}

// Invite a client to a board
export async function createInvite(email, boardId, token) {
  const res = await fetch(`${BASE}/api/invites`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ email, boardId }),
  });
  return res.json();
}

// List clients on a board
export async function getParticipants(boardId, token) {
  const res = await fetch(`${BASE}/api/boards/${boardId}/participants`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json();
}

// Cut a client's access to a board
export async function revokeAccess(boardId, userId, token) {
  const res = await fetch(`${BASE}/api/boards/${boardId}/participants/${userId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json();
}
