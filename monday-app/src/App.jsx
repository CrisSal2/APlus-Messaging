import { useState, useEffect, useRef, useCallback } from 'react';
import mondaySdk from 'monday-sdk-js';
import ChatWindow from './components/ChatWindow';
import { mondayAuth, syncBoard, setUnauthorizedHandler } from './api';

const monday = mondaySdk();

export default function App() {
  const [apiToken, setApiToken] = useState(null);
  const [userId, setUserId] = useState(null);
  const [boardId, setBoardId] = useState(null); // internal DB board UUID
  const [error, setError] = useState(null);
  const authInFlight = useRef(false);

  // Exchange the Monday session token for an API token (initial load and re-auth)
  const authenticate = useCallback(async () => {
    if (authInFlight.current) return;
    authInFlight.current = true;
    try {
      const res = await monday.get('sessionToken');
      const data = await mondayAuth(res.data);
      setApiToken(data.token);
      setUserId(data.user.id);
      setError(null);
    } catch (err) {
      setError(err.message || 'Authentication failed.');
    } finally {
      authInFlight.current = false;
    }
  }, []);

  useEffect(() => {
    authenticate();
    // Re-authenticate transparently when the API reports an expired token
    setUnauthorizedHandler(authenticate);
    return () => setUnauthorizedHandler(null);
  }, [authenticate]);

  // Once authenticated, get the board context from Monday and sync it to our DB
  useEffect(() => {
    if (!apiToken) return;

    const unsubscribe = monday.listen('context', async (res) => {
      const mondayBoardId = res.data?.boardId;
      if (!mondayBoardId) return;

      let boardName = `Board ${mondayBoardId}`;
      try {
        const gql = await monday.api(
          'query ($ids: [ID!]) { boards(ids: $ids) { name } }',
          { variables: { ids: [String(mondayBoardId)] } }
        );
        boardName = gql.data?.boards?.[0]?.name || boardName;
      } catch {
        // non-fatal: fall back to the default name
      }

      try {
        const data = await syncBoard(String(mondayBoardId), boardName, apiToken);
        setBoardId(data.board.id);
        setError(null);
      } catch (err) {
        // A 401 is handled by re-auth; don't show a dead-end screen for it
        if (err.status !== 401) setError(err.message || 'Failed to load board.');
      }
    });

    return () => unsubscribe?.();
  }, [apiToken]);

  if (error) {
    return (
      <div className="state-screen">
        <p className="error-text">{error}</p>
        <button onClick={() => window.location.reload()}>Retry</button>
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
