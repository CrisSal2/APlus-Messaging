import { useState, useEffect } from 'react';
import { getParticipants, revokeAccess } from '../api';
import { useAsync } from '../hooks/useAsync';

export default function ClientList({ boardId, apiToken }) {
  const [participants, setParticipants] = useState([]);
  const [revokingId, setRevokingId] = useState(null);
  const [actionError, setActionError] = useState(null);
  const {
    execute: fetchClients,
    loading: fetching,
    error: fetchError,
  } = useAsync(() => getParticipants(boardId, apiToken));
  const { execute: revoke } = useAsync((userId) => revokeAccess(boardId, userId, apiToken));

  useEffect(() => {
    let active = true;
    fetchClients()
      .then((data) => active && setParticipants(data.participants || []))
      .catch(() => {}); // surfaced through fetchError
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId, apiToken]);

  const handleRevoke = async (userId, email) => {
    const confirmed = window.confirm(
      `Remove ${email || 'this client'} from the board? They will lose access immediately.`
    );
    if (!confirmed) return;

    setRevokingId(userId);
    setActionError(null);
    try {
      await revoke(userId);
      setParticipants((prev) => prev.filter((p) => p.user_id !== userId));
    } catch (err) {
      setActionError(err.message || 'Failed to remove client.');
    } finally {
      setRevokingId(null);
    }
  };

  if (fetching) {
    return <p className="empty-state">Loading clients…</p>;
  }

  if (fetchError) {
    return <p className="error-text">{fetchError}</p>;
  }

  if (participants.length === 0) {
    return <p className="empty-state">No clients connected to this board yet.</p>;
  }

  return (
    <div className="client-list">
      <h4>Connected Clients</h4>
      {actionError && <p className="error-text">{actionError}</p>}
      {participants.map((p) => (
        <div key={p.user_id} className="client-row">
          <span className="client-email">{p.users?.email || p.user_id}</span>
          <button
            className="revoke-btn"
            onClick={() => handleRevoke(p.user_id, p.users?.email)}
            disabled={revokingId === p.user_id}
          >
            {revokingId === p.user_id ? 'Removing…' : 'End Access'}
          </button>
        </div>
      ))}
    </div>
  );
}
