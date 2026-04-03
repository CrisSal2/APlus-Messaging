import { useState, useEffect, useRef } from 'react';
import { getMessages, sendMessage } from '../api';
import InvitePanel from './InvitePanel';
import ClientList from './ClientList';

const POLL_INTERVAL_MS = 3000;

export default function ChatWindow({ boardId, apiToken, userId }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [activeTab, setActiveTab] = useState('chat'); // 'chat' | 'clients'
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);

  const fetchMessages = async () => {
    const data = await getMessages(boardId, apiToken);
    if (data.ok) setMessages(data.messages);
  };

  // Initial load + polling
  useEffect(() => {
    fetchMessages();
    const interval = setInterval(fetchMessages, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [boardId]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || sending) return;
    setSending(true);
    await sendMessage(boardId, trimmed, apiToken);
    setInput('');
    await fetchMessages();
    setSending(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="chat-window">
      <div className="tab-bar">
        <button
          className={`tab ${activeTab === 'chat' ? 'active' : ''}`}
          onClick={() => setActiveTab('chat')}
        >
          Messages
        </button>
        <button
          className={`tab ${activeTab === 'clients' ? 'active' : ''}`}
          onClick={() => setActiveTab('clients')}
        >
          Clients
        </button>
      </div>

      {activeTab === 'chat' && (
        <>
          <div className="message-list">
            {messages.length === 0 && (
              <p className="empty-state">No messages yet. Start the conversation.</p>
            )}
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`message ${msg.sender_id === userId ? 'mine' : 'theirs'}`}
              >
                <p className="message-content">{msg.content}</p>
                <span className="message-time">
                  {new Date(msg.created_at).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          <div className="input-area">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message… (Enter to send)"
              rows={2}
              disabled={sending}
            />
            <button onClick={handleSend} disabled={sending || !input.trim()}>
              Send
            </button>
          </div>
        </>
      )}

      {activeTab === 'clients' && (
        <>
          <InvitePanel boardId={boardId} apiToken={apiToken} />
          <ClientList boardId={boardId} apiToken={apiToken} />
        </>
      )}
    </div>
  );
}
