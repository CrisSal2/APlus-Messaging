import { useState, useEffect } from 'react';
import { getParticipants, revokeAccess } from '../api';

export default function ClientList({ boardId, apiToken }) {
  const [participants, setParticipants] = useState([]);
  const [revoking, setRevoking] = useState(null); // userId being revoked

  const fetchParticipants = async () => {
    const data = await getParticipants(boardId, apiToken);
    if (data.ok) setParticipants(data.participants);
  };

  useEffect(() => {
    fetchParticipants();
  }, [boardId]);

  const handleRevoke = async (userId, email) => {
    const confirmed = window.confirm(
      `Remove ${email || 'this client'} from the board? They will lose access immediately.`
    );
    if (!confirmed) return;

    setRevoking(userId);
    await revokeAccess(boardId, userId, apiToken);
    await fetchParticipants();
    setRevoking(null);
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
            disabled={revoking === p.user_id}
          >
            {revoking === p.user_id ? 'Removing…' : 'End Access'}
          </button>
        </div>
      ))}
    </div>
  );
}
