import { useState } from 'react';
import { createInvite } from '../api';
import { useAsync } from '../hooks/useAsync';

export default function InvitePanel({ boardId, apiToken }) {
  const [email, setEmail] = useState('');
  const { execute: invite, loading } = useAsync((email) => createInvite(email, boardId, apiToken));
  const [status, setStatus] = useState(null);

  const handleInvite = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || loading) return;

    setStatus(null);
    try {
      await invite(trimmed);
      setStatus({ type: 'success', message: `Invite sent to ${trimmed}` });
      setEmail('');
    } catch (err) {
      setStatus({ type: 'error', message: err.message });
    }
  };

  return (
    <div className="invite-panel">
      <h4>Invite Client</h4>
      <div className="invite-row">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleInvite()}
          placeholder="client@email.com"
          disabled={loading}
        />
        <button onClick={handleInvite} disabled={loading || !email.trim()}>
          {loading ? 'Sending…' : 'Send Invite'}
        </button>
      </div>
      {status && (
        <p className={`invite-status ${status.type}`}>{status.message}</p>
      )}
    </div>
  );
}
