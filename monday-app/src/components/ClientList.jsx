import { useState, useEffect } from 'react';
import { getParticipants, revokeAccess } from '../api';
import { useAsync } from '../hooks/useAsync';

export default function ClientList({ boardId, apiToken }) {
  const [participants, setParticipants] = useState([]);
  const { execute: fetchClients, loading: fetching } = useAsync(() => getParticipants(boardId, apiToken));
  const { execute: revoke, loading: revoking } = useAsync((userId) => revokeAccess(boardId, userId, apiToken));
  const [revokingId, setRevokingId] = useState(null);

  useEffect(() => {
    fetchClients().then((data) => setParticipants(data.participants || []));
  }, [boardId]);

  const handleRevoke = async (userId, email) => {
    const confirmed = window.confirm(
      `Remove ${email || 'this client'} from the board? They will lose access immediately.`
    );
    if (!confirmed) return;

    setRevokingId(userId);
    try {
      await revoke(userId);
      setParticipants((prev) => prev.filter((p) => p.user_id !== userId));
    } finally {
      setRevokingId(null);
    }
  };

  if (participants.length === 0) {
    return <p className="empty-state">No clients connected to this board yet.</p>;
  }

  return (
    <div className="client-list">
      <h4>Connected Clients</h4>
      {participants.map((p) => (
        <div key={p.user_id} className="client-row">
          <span className="client-email">{p.users?.email || p.user_id}</span>
          <button
            className="revoke-btn"
            onClick={() => handleRevoke(p.user_id, p.users?.email)}
            disabled={revoking || revokingId === p.user_id}
          >
            {revokingId === p.user_id ? 'Removing…' : 'End Access'}
          </button>
        </div>
      ))}
    </div>
  );
}
