import { useState, useEffect, useRef } from 'react';
import { getMessages, sendMessage } from '../api';
import InvitePanel from './InvitePanel';
import ClientList from './ClientList';

const POLL_INTERVAL_MS = 3000;
const TABS = { CHAT: 'chat', CLIENTS: 'clients' };

// Append messages we haven't seen yet (matched by id)
function mergeMessages(prev, incoming) {
  if (!incoming.length) return prev;
  const seen = new Set(prev.map((m) => m.id));
  const fresh = incoming.filter((m) => !seen.has(m.id));
  return fresh.length ? [...prev, ...fresh] : prev;
}

export default function ChatWindow({ boardId, apiToken, userId }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [activeTab, setActiveTab] = useState(TABS.CHAT);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const bottomRef = useRef(null);
  const lastSeenRef = useRef(null); // created_at of the newest message we hold

  // Reset when switching boards
  useEffect(() => {
    setMessages([]);
    setLoadError(null);
    lastSeenRef.current = null;
  }, [boardId]);

  // Initial load + incremental polling (only while the chat tab is visible)
  useEffect(() => {
    if (activeTab !== TABS.CHAT) return;

    let cancelled = false;
    let inFlight = false;
    let interval = null;

    const poll = async () => {
      if (inFlight || cancelled) return;
      inFlight = true;
      try {
        const data = await getMessages(boardId, apiToken, lastSeenRef.current);
        if (cancelled) return;
        setLoadError(null);
        if (data.messages.length) {
          lastSeenRef.current = data.messages[data.messages.length - 1].created_at;
          setMessages((prev) => mergeMessages(prev, data.messages));
        }
      } catch (err) {
        if (cancelled) return;
        if (err.status === 403) {
          // Access was removed: stop hammering the API
          setLoadError('Your access to this board has been removed.');
          cancelled = true;
          clearInterval(interval);
        } else if (err.status !== 401) {
          setLoadError(err.message);
        }
      } finally {
        inFlight = false;
      }
    };

    poll();
    interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [boardId, apiToken, activeTab]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setSendError(null);
    try {
      const data = await sendMessage(boardId, trimmed, apiToken);
      setInput('');
      lastSeenRef.current = data.message.created_at;
      setMessages((prev) => mergeMessages(prev, [data.message]));
    } catch (err) {
      // keep the text so the user can retry
      setSendError(err.message || 'Failed to send message.');
    } finally {
      setSending(false);
    }
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
          className={`tab ${activeTab === TABS.CHAT ? 'active' : ''}`}
          onClick={() => setActiveTab(TABS.CHAT)}
        >
          Messages
        </button>
        <button
          className={`tab ${activeTab === TABS.CLIENTS ? 'active' : ''}`}
          onClick={() => setActiveTab(TABS.CLIENTS)}
        >
          Clients
        </button>
      </div>

      {activeTab === TABS.CHAT && (
        <>
          <div className="message-list">
            {loadError && <p className="error-text">{loadError}</p>}
            {messages.length === 0 && !loadError && (
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

          {sendError && <p className="error-text">{sendError}</p>}
          <div className="input-area">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message… (Enter to send)"
              rows={2}
              maxLength={4000}
              disabled={sending}
            />
            <button onClick={handleSend} disabled={sending || !input.trim()}>
              Send
            </button>
          </div>
        </>
      )}

      {activeTab === TABS.CLIENTS && (
        <>
          <InvitePanel boardId={boardId} apiToken={apiToken} />
          <ClientList boardId={boardId} apiToken={apiToken} />
        </>
      )}
    </div>
  );
}
