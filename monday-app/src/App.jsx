import { useState, useEffect } from 'react';
import mondaySdk from 'monday-sdk-js';
import ChatWindow from './components/ChatWindow';
import { mondayAuth, syncBoard } from './api';

const monday = mondaySdk();

export default function App() {
  const [apiToken, setApiToken] = useState(null);
  const [userId, setUserId] = useState(null);
  const [boardId, setBoardId] = useState(null);  // internal DB board UUID
  const [error, setError] = useState(null);

  // Step 1: Authenticate with our backend using the Monday session token
  useEffect(() => {
    monday.get('sessionToken').then(async (res) => {
      const data = await mondayAuth(res.data);
      if (data.ok) {
        setApiToken(data.token);
        setUserId(data.user.id);
      } else {
        setError(data.error || 'Authentication failed.');
      }
    }).catch(() => setError('Could not reach the authentication server.'));
  }, []);

  // Step 2: Once authenticated, get the current board context from Monday
  // and sync it to our DB to get the internal board ID
  useEffect(() => {
    if (!apiToken) return;

    monday.listen('context', async (res) => {
      const mondayBoardId = res.data?.boardId;
      if (!mondayBoardId) return;

      // Get the board name via Monday GraphQL API
      let boardName = `Board ${mondayBoardId}`;
      try {
        const gql = await monday.api(`query { boards(ids: [${mondayBoardId}]) { name } }`);
        boardName = gql.data?.boards?.[0]?.name || boardName;
      } catch {
        // non-fatal — we'll fall back to the default name
      }

      const data = await syncBoard(String(mondayBoardId), boardName, apiToken);
      if (data.ok) {
        setBoardId(data.board.id);
      } else {
        setError(data.error || 'Failed to load board.');
      }
    });
  }, [apiToken]);

  if (error) {
    return (
      <div className="state-screen">
        <p className="error-text">{error}</p>
      </div>
    );
  }

  if (!apiToken || !boardId) {
    return (
      <div className="state-screen">
        <div className="spinner" />
        <p>Loading...</p>
      </div>
    );
  }

  return <ChatWindow boardId={boardId} apiToken={apiToken} userId={userId} />;
}
