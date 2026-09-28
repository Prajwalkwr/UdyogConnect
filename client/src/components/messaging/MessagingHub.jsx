import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  BadgeCheck,
  Archive,
  Ban,
  Flag,
  Image as ImageIcon,
  Loader2,
  MessageCircle,
  Package,
  Paperclip,
  Search,
  Send,
  ShoppingBag,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import Swal from 'sweetalert2';
import api from '../../utils/api';
import { getSessionToken } from '../../utils/sessionAuth';
import { createSubmissionGuard, createIdempotencyHeader } from '../../utils/submitProtection';

function timeLabel(value) {
  if (!value) return '';
  const date = new Date(value);
  const diff = Date.now() - date.getTime();
  if (diff < 60_000) return 'Just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min ago`;
  if (diff < 86_400_000) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diff < 172_800_000) return 'Yesterday';
  return date.toLocaleDateString();
}

function lastSeenLabel(value) {
  if (!value) return 'Offline';
  return `Last seen ${timeLabel(value)}`;
}

function Receipt({ message, mine }) {
  if (!mine) return null;
  if (message.isRead) return <span className="msg-receipt read">✓✓</span>;
  if (message.deliveredAt) return <span className="msg-receipt">✓✓</span>;
  return <span className="msg-receipt">✓</span>;
}

export default function MessagingHub({
  user,
  mode = 'customer', // customer | business
  initialConversationId = null,
  socket: externalSocket = null,
  onUnreadChange,
  embedded = false,
}) {
  const [conversations, setConversations] = useState([]);
  const [unreadTotal, setUnreadTotal] = useState(0);
  const [selectedId, setSelectedId] = useState(initialConversationId);
  const [messages, setMessages] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState('');
  const [query, setQuery] = useState('');
  const [typing, setTyping] = useState(false);
  const [peerTyping, setPeerTyping] = useState(false);
  const [connection, setConnection] = useState('connecting');
  const [mobileShowChat, setMobileShowChat] = useState(Boolean(initialConversationId));
  const [error, setError] = useState('');
  const [attachment, setAttachment] = useState(null);
  const [shareProducts, setShareProducts] = useState([]);
  const [showProductPicker, setShowProductPicker] = useState(false);

  const listRef = useRef(null);
  const bottomRef = useRef(null);
  const typingTimer = useRef(null);
  const peerTypingTimer = useRef(null);
  const socketRef = useRef(null);
  const selectedRef = useRef(selectedId);
  const guard = useMemo(() => createSubmissionGuard(), []);
  selectedRef.current = selectedId;

  const selected = useMemo(
    () => conversations.find((c) => String(c._id) === String(selectedId)) || null,
    [conversations, selectedId]
  );

  const peer = mode === 'customer' ? selected?.business : selected?.customer;
  const isCustomer = mode === 'customer';

  const refreshList = useCallback(async (search = query) => {
    setLoadingList(true);
    setError('');
    try {
      const { data } = await api.get('/api/conversations', { params: { q: search || undefined } });
      setConversations(data.conversations || []);
      setUnreadTotal(data.unreadTotal || 0);
      onUnreadChange?.(data.unreadTotal || 0);
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to load conversations');
    } finally {
      setLoadingList(false);
    }
  }, [onUnreadChange, query]);

  const loadMessages = useCallback(async (conversationId, { before, append } = {}) => {
    if (!conversationId) return;
    setLoadingMessages(true);
    setError('');
    try {
      const { data } = await api.get(`/api/conversations/${conversationId}/messages`, {
        params: { before, limit: 40 },
      });
      const next = data.messages || [];
      setHasMore(Boolean(data.hasMore));
      setMessages((current) => {
        if (!append) return next;
        const ids = new Set(current.map((m) => String(m._id)));
        return [...next.filter((m) => !ids.has(String(m._id))), ...current];
      });
      await api.patch(`/api/conversations/${conversationId}/read`);
      setConversations((rows) => rows.map((row) => (
        String(row._id) === String(conversationId)
          ? { ...row, unreadCount: 0, customerUnreadCount: isCustomer ? 0 : row.customerUnreadCount, businessUnreadCount: isCustomer ? row.businessUnreadCount : 0 }
          : row
      )));
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to load messages');
      if (err.response?.status === 403) {
        setSelectedId(null);
        setMobileShowChat(false);
      }
    } finally {
      setLoadingMessages(false);
    }
  }, [isCustomer]);

  useEffect(() => {
    refreshList('');
  }, [user?._id, user?.id]);

  useEffect(() => {
    if (initialConversationId) {
      setSelectedId(initialConversationId);
      setMobileShowChat(true);
    }
  }, [initialConversationId]);

  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      return;
    }
    loadMessages(selectedId);
  }, [selectedId, loadMessages]);

  useEffect(() => {
    if (!loadingMessages) {
      bottomRef.current?.scrollIntoView?.({ behavior: 'smooth' });
    }
  }, [messages.length, loadingMessages, peerTyping]);

  // Socket.IO: reuse app socket or create dedicated one
  useEffect(() => {
    let owned = false;
    let socket = externalSocket;
    let cancelled = false;

    const bind = (sock) => {
      if (!sock || cancelled) return;
      socketRef.current = sock;
      setConnection(sock.connected ? 'connected' : 'connecting');

      const onConnect = () => setConnection('connected');
      const onDisconnect = () => setConnection('disconnected');
      const onReconnectAttempt = () => setConnection('reconnecting');

      const onMessage = (msg) => {
        const convId = String(msg.conversationId || '');
        setConversations((rows) => {
          const exists = rows.some((r) => String(r._id) === convId);
          if (!exists) {
            refreshList();
            return rows;
          }
          return rows
            .map((row) => {
              if (String(row._id) !== convId) return row;
              const mine = String(msg.senderId) === String(user?._id || user?.id);
              const unreadBump = !mine && String(selectedRef.current) !== convId ? 1 : 0;
              return {
                ...row,
                lastMessage: msg.messageType === 'image' ? '📷 Image' : (msg.message || row.lastMessage),
                lastMessageAt: msg.createdAt,
                unreadCount: Number(row.unreadCount || 0) + unreadBump,
              };
            })
            .sort((a, b) => new Date(b.lastMessageAt || 0) - new Date(a.lastMessageAt || 0));
        });

        if (String(selectedRef.current) === convId) {
          setMessages((current) => (
            current.some((m) => String(m._id) === String(msg._id) || (msg.clientMessageId && m.clientMessageId === msg.clientMessageId))
              ? current
              : [...current, msg]
          ));
          api.patch(`/api/conversations/${convId}/read`).catch(() => {});
        }
      };

      const onTyping = (payload) => {
        if (String(payload.conversationId) !== String(selectedRef.current)) return;
        if (String(payload.userId) === String(user?._id || user?.id)) return;
        setPeerTyping(Boolean(payload.isTyping));
        clearTimeout(peerTypingTimer.current);
        if (payload.isTyping) {
          peerTypingTimer.current = setTimeout(() => setPeerTyping(false), 2500);
        }
      };

      const onRead = (payload) => {
        if (String(payload.conversationId) !== String(selectedRef.current)) return;
        const ids = new Set((payload.messageIds || []).map(String));
        setMessages((current) => current.map((m) => (
          ids.has(String(m._id)) ? { ...m, isRead: true, readAt: payload.readAt } : m
        )));
      };

      const onDelivered = (payload) => {
        setMessages((current) => current.map((m) => (
          String(m._id) === String(payload.messageId) ? { ...m, deliveredAt: m.deliveredAt || new Date().toISOString() } : m
        )));
      };

      sock.on('connect', onConnect);
      sock.on('disconnect', onDisconnect);
      sock.io?.on?.('reconnect_attempt', onReconnectAttempt);
      sock.on('chat:message', onMessage);
      sock.on('chat:typing', onTyping);
      sock.on('chat:read', onRead);
      sock.on('chat:delivered', onDelivered);

      return () => {
        sock.off('connect', onConnect);
        sock.off('disconnect', onDisconnect);
        sock.io?.off?.('reconnect_attempt', onReconnectAttempt);
        sock.off('chat:message', onMessage);
        sock.off('chat:typing', onTyping);
        sock.off('chat:read', onRead);
        sock.off('chat:delivered', onDelivered);
      };
    };

    let cleanup = () => {};

    const start = async () => {
      if (!socket) {
        const token = getSessionToken();
        if (!token) return;
        const { io } = await import('socket.io-client');
        if (cancelled) return;
        const backendUrl = import.meta.env.VITE_API_URL?.replace(/\/$/, '')
          || (import.meta.env.DEV ? window.location.origin : 'https://udyogconnect.onrender.com');
        socket = io(backendUrl, {
          auth: { token },
          transports: ['websocket', 'polling'],
          reconnectionAttempts: 10,
          reconnectionDelay: 1500,
        });
        owned = true;
        socketRef.current = socket;
      }
      cleanup = bind(socket) || (() => {});
    };

    start();

    return () => {
      cancelled = true;
      cleanup();
      if (owned && socket) socket.disconnect();
    };
  }, [externalSocket, user?._id, user?.id, refreshList]);

  // Join secure conversation room when selection changes
  useEffect(() => {
    const sock = socketRef.current;
    if (!sock || !selectedId) return;
    sock.emit('chat:join', { conversationId: selectedId }, (ack) => {
      if (ack && ack.ok === false) {
        setError(ack.message || 'Unable to join chat room');
      }
    });
    return () => {
      sock.emit('chat:leave', { conversationId: selectedId });
    };
  }, [selectedId, connection]);

  const emitTyping = (isTyping) => {
    const sock = socketRef.current;
    if (!sock || !selectedId) return;
    sock.emit('chat:typing', { conversationId: selectedId, isTyping });
  };

  const onDraftChange = (value) => {
    setDraft(value);
    emitTyping(true);
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => emitTyping(false), 1200);
  };

  const openConversation = (id) => {
    setSelectedId(id);
    setMobileShowChat(true);
    setPeerTyping(false);
  };

  const sendMessage = async (extra = {}) => {
    if (!selectedId) return;
    if (!draft.trim() && !attachment && !extra.productId && !extra.orderId) return;
    if (!guard.begin()) return;
    setSending(true);
    emitTyping(false);
    const clientMessageId = `cmsg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    try {
      const form = new FormData();
      form.append('message', draft.trim());
      form.append('clientMessageId', clientMessageId);
      if (extra.productId) {
        form.append('messageType', 'product');
        form.append('productId', extra.productId);
      } else if (extra.orderId) {
        form.append('messageType', 'order');
        form.append('orderId', extra.orderId);
      } else if (attachment) {
        form.append('attachment', attachment);
      } else {
        form.append('messageType', 'text');
      }

      const { data } = await api.post(`/api/conversations/${selectedId}/messages`, form, {
        headers: {
          'Content-Type': 'multipart/form-data',
          ...createIdempotencyHeader(clientMessageId),
        },
      });

      const saved = data.message;
      setMessages((current) => (
        current.some((m) => String(m._id) === String(saved._id) || m.clientMessageId === clientMessageId)
          ? current
          : [...current, saved]
      ));
      setDraft('');
      setAttachment(null);
      setShowProductPicker(false);
      refreshList();
    } catch (err) {
      Swal.fire({ icon: 'error', text: err.response?.data?.message || 'Failed to send message.' });
    } finally {
      setSending(false);
      guard.finish();
    }
  };

  const archiveConversation = async () => {
    if (!selectedId) return;
    await api.patch(`/api/conversations/${selectedId}/archive`, { archive: true });
    setSelectedId(null);
    setMobileShowChat(false);
    refreshList();
  };

  const blockConversation = async () => {
    if (!selectedId) return;
    const confirm = await Swal.fire({
      icon: 'warning',
      title: 'Block conversation?',
      text: 'No new messages can be sent after blocking.',
      showCancelButton: true,
      confirmButtonColor: '#0b1a30',
    });
    if (!confirm.isConfirmed) return;
    await api.post(`/api/conversations/${selectedId}/block`);
    refreshList();
  };

  const reportConversation = async () => {
    if (!selectedId) return;
    const { value: reason } = await Swal.fire({
      title: 'Report conversation',
      input: 'textarea',
      inputPlaceholder: 'Why are you reporting this conversation?',
      showCancelButton: true,
      confirmButtonColor: '#0b1a30',
    });
    if (!reason?.trim()) return;
    await api.post(`/api/conversations/${selectedId}/report`, { reason: reason.trim() });
    Swal.fire({ icon: 'success', title: 'Report submitted', timer: 1200, showConfirmButton: false });
  };

  const loadOlder = () => {
    if (!hasMore || !messages.length) return;
    loadMessages(selectedId, { before: messages[0].createdAt, append: true });
  };

  const openProductPicker = async () => {
    if (!isCustomer) {
      try {
        const { data } = await api.get('/api/products');
        const bizId = selected?.businessId;
        setShareProducts((Array.isArray(data) ? data : []).filter((p) => String(p.businessId) === String(bizId)).slice(0, 40));
        setShowProductPicker(true);
      } catch {
        Swal.fire({ icon: 'error', text: 'Could not load products.' });
      }
    }
  };

  const onScrollMessages = (event) => {
    if (event.target.scrollTop < 40 && hasMore && !loadingMessages) {
      loadOlder();
    }
  };

  return (
    <div className={`msg-hub ${embedded ? 'embedded' : ''} ${mobileShowChat ? 'show-chat' : ''}`}>
      <aside className="msg-sidebar">
        <div className="msg-side-head">
          <h2><MessageCircle size={18} /> Messages</h2>
          <span className={`msg-conn ${connection}`}>
            {connection === 'connected' ? <Wifi size={14} /> : <WifiOff size={14} />}
            {connection === 'connected' ? 'Connected' : connection === 'reconnecting' ? 'Reconnecting…' : 'Offline'}
          </span>
        </div>
        <div className="msg-search">
          <Search size={15} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') refreshList(query); }}
            placeholder={isCustomer ? 'Search businesses…' : 'Search customers…'}
          />
        </div>
        <div className="msg-list" ref={listRef}>
          {loadingList ? (
            <div className="msg-empty"><Loader2 className="spin" size={18} /> Loading conversations…</div>
          ) : error && !conversations.length ? (
            <div className="msg-empty">
              {error}
              <button type="button" onClick={() => refreshList()}>Retry</button>
            </div>
          ) : conversations.length === 0 ? (
            <div className="msg-empty">No conversations yet</div>
          ) : (
            conversations.map((c) => {
              const title = isCustomer ? c.business?.name : c.customer?.name;
              const avatar = isCustomer ? c.business?.imageUrl : c.customer?.profilePicture;
              const online = isCustomer ? c.business?.online : c.customer?.online;
              return (
                <button
                  key={c._id}
                  type="button"
                  className={`msg-row ${String(c._id) === String(selectedId) ? 'active' : ''}`}
                  onClick={() => openConversation(c._id)}
                >
                  <span className="msg-avatar">
                    {avatar ? <img src={avatar} alt="" /> : (title || '?').charAt(0)}
                    <i className={online ? 'on' : ''} />
                  </span>
                  <span className="msg-row-copy">
                    <strong>{title || 'Conversation'}</strong>
                    <small>{c.lastMessage || 'No messages yet'}</small>
                  </span>
                  <span className="msg-row-meta">
                    <small>{timeLabel(c.lastMessageAt)}</small>
                    {c.unreadCount > 0 ? <b>{c.unreadCount}</b> : null}
                  </span>
                </button>
              );
            })
          )}
        </div>
        {unreadTotal > 0 ? <div className="msg-unread-total">{unreadTotal} unread</div> : null}
      </aside>

      <section className="msg-thread">
        {!selected ? (
          <div className="msg-empty large">
            <MessageCircle size={36} />
            <p>Select a conversation to start chatting</p>
          </div>
        ) : (
          <>
            <header className="msg-thread-head">
              <button type="button" className="msg-back" onClick={() => setMobileShowChat(false)}>←</button>
              <span className="msg-avatar lg">
                {peer?.imageUrl || peer?.profilePicture
                  ? <img src={peer.imageUrl || peer.profilePicture} alt="" />
                  : (peer?.name || '?').charAt(0)}
                <i className={peer?.online ? 'on' : ''} />
              </span>
              <div className="msg-peer">
                <strong>
                  {peer?.name || 'Chat'}
                  {peer?.verified ? <BadgeCheck size={16} color="#60a5fa" fill="#2563eb" /> : null}
                </strong>
                <small>
                  {peer?.online ? '🟢 Online' : `⚪ ${lastSeenLabel(peer?.lastSeen)}`}
                  {peer?.category ? ` · ${peer.category}` : ''}
                </small>
              </div>
              <div className="msg-actions">
                <button type="button" title="Archive" onClick={archiveConversation}><Archive size={16} /></button>
                <button type="button" title="Block" onClick={blockConversation}><Ban size={16} /></button>
                <button type="button" title="Report" onClick={reportConversation}><Flag size={16} /></button>
              </div>
            </header>

            <div className="msg-messages" onScroll={onScrollMessages}>
              {hasMore ? (
                <button type="button" className="msg-load-more" onClick={loadOlder} disabled={loadingMessages}>
                  {loadingMessages ? 'Loading…' : 'Load older messages'}
                </button>
              ) : null}
              {loadingMessages && !messages.length ? (
                <div className="msg-empty"><Loader2 className="spin" size={18} /> Loading messages…</div>
              ) : messages.length === 0 ? (
                <div className="msg-empty">No messages yet. Say hello!</div>
              ) : (
                messages.map((m) => {
                  const mine = String(m.senderId) === String(user?._id || user?.id);
                  return (
                    <div key={m._id} className={`msg-bubble ${mine ? 'mine' : 'theirs'}`}>
                      {m.messageType === 'image' && m.attachmentUrl ? (
                        <a href={m.attachmentUrl} target="_blank" rel="noreferrer">
                          <img src={m.attachmentUrl} alt="" className="msg-image" />
                        </a>
                      ) : null}
                      {m.messageType === 'file' && m.attachmentUrl ? (
                        <a className="msg-file" href={m.attachmentUrl} target="_blank" rel="noreferrer">
                          <Paperclip size={14} /> Attachment
                        </a>
                      ) : null}
                      {m.messageType === 'product' ? (
                        <div className="msg-card">
                          <Package size={16} />
                          <div>
                            <strong>{m.message || 'Product'}</strong>
                            {m.productId ? (
                              <a href={`/?product=${m.productId}`}>View Product</a>
                            ) : null}
                          </div>
                        </div>
                      ) : null}
                      {m.messageType === 'order' ? (
                        <div className="msg-card">
                          <ShoppingBag size={16} />
                          <div>
                            <strong>{m.message || 'Order'}</strong>
                            <span>Order reference shared securely</span>
                          </div>
                        </div>
                      ) : null}
                      {(m.messageType === 'text' || !m.messageType) && m.message ? <p>{m.message}</p> : null}
                      {m.messageType === 'image' && m.message ? <p>{m.message}</p> : null}
                      <footer>
                        <small>{timeLabel(m.createdAt)}</small>
                        <Receipt message={m} mine={mine} />
                      </footer>
                    </div>
                  );
                })
              )}
              {peerTyping ? (
                <div className="msg-typing">
                  {isCustomer ? 'Business is typing…' : 'Customer is typing…'}
                </div>
              ) : null}
              <div ref={bottomRef} />
            </div>

            {showProductPicker ? (
              <div className="msg-product-picker">
                <div className="msg-product-picker-head">
                  <strong>Share a product</strong>
                  <button type="button" onClick={() => setShowProductPicker(false)}><X size={16} /></button>
                </div>
                <div className="msg-product-grid">
                  {shareProducts.map((p) => (
                    <button key={p._id} type="button" onClick={() => sendMessage({ productId: p._id })}>
                      {p.imageUrl ? <img src={p.imageUrl} alt="" /> : <Package size={18} />}
                      <span>{p.name}</span>
                      <small>NPR {Number(p.price || 0).toLocaleString('en-NP')}</small>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {attachment ? (
              <div className="msg-attach-preview">
                <span>{attachment.name}</span>
                <button type="button" onClick={() => setAttachment(null)}><X size={14} /></button>
              </div>
            ) : null}

            <form
              className="msg-composer"
              onSubmit={(e) => {
                e.preventDefault();
                sendMessage();
              }}
            >
              <label className="msg-icon-btn" title="Attach file">
                <Paperclip size={18} />
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  hidden
                  onChange={(e) => setAttachment(e.target.files?.[0] || null)}
                />
              </label>
              <label className="msg-icon-btn" title="Image">
                <ImageIcon size={18} />
                <input
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => setAttachment(e.target.files?.[0] || null)}
                />
              </label>
              {!isCustomer ? (
                <button type="button" className="msg-icon-btn" title="Share product" onClick={openProductPicker}>
                  <Package size={18} />
                </button>
              ) : null}
              <input
                value={draft}
                onChange={(e) => onDraftChange(e.target.value)}
                placeholder="Type a message…"
                disabled={selected.status === 'blocked'}
              />
              <button type="submit" className="msg-send" disabled={sending || selected.status === 'blocked'}>
                {sending ? <Loader2 className="spin" size={16} /> : <Send size={16} />}
                Send
              </button>
            </form>
          </>
        )}
      </section>
    </div>
  );
}
