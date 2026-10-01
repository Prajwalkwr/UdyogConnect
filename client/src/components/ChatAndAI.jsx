import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FiMessageSquare, FiX, FiSend, FiImage, FiUser, FiExternalLink, FiPackage, FiShoppingBag, FiPaperclip } from 'react-icons/fi';
import api from '../utils/api';
import { getSessionToken } from '../utils/sessionAuth';
import { createSubmissionGuard, createIdempotencyHeader } from '../utils/submitProtection';

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

const previewOf = (message, fallback) => (
  message.messageType === 'image' ? '📷 Image'
    : message.messageType === 'file' ? '📎 Attachment'
      : (message.message || fallback)
);

// Floating quick view of the same conversations shown in the dashboard Messages page.
export default function ChatAndAI({ user, lang, socket: externalSocket = null, unreadCount = 0, onUnreadChange, onOpenMessages, hidden = false }) {
  const [isOpen, setIsOpen] = useState(false);
  const [conversations, setConversations] = useState([]);
  const [loadingList, setLoadingList] = useState(false);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [draft, setDraft] = useState('');
  const [attachment, setAttachment] = useState(null);
  const [sending, setSending] = useState(false);

  const scrollRef = useRef(null);
  const socketRef = useRef(null);
  const selectedRef = useRef(selectedId);
  const isOpenRef = useRef(isOpen);
  const guard = useMemo(() => createSubmissionGuard(), []);
  selectedRef.current = selectedId;
  isOpenRef.current = isOpen;

  const userId = String(user?._id || user?.id || '');
  const isCustomer = user?.role === 'customer';
  const canChat = user?.role === 'customer' || user?.role === 'seller';
  const translate = (enText, neText) => (lang === 'en' || !neText ? enText : neText);

  const selected = conversations.find((c) => String(c._id) === String(selectedId)) || null;
  const peerOf = (conversation) => (isCustomer ? conversation?.business : conversation?.customer);
  const peer = peerOf(selected);

  const syncUnread = useCallback(() => {
    api.get('/api/conversations/unread-count')
      .then((res) => onUnreadChange?.(Number(res.data?.unreadTotal || 0)))
      .catch(() => {});
  }, [onUnreadChange]);

  const refreshList = useCallback(async () => {
    setLoadingList(true);
    setError('');
    try {
      const { data } = await api.get('/api/conversations');
      setConversations(data.conversations || []);
      onUnreadChange?.(Number(data.unreadTotal || 0));
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to load conversations');
    } finally {
      setLoadingList(false);
    }
  }, [onUnreadChange]);

  useEffect(() => {
    setSelectedId(null);
    setConversations([]);
    setMessages([]);
    setDraft('');
    setAttachment(null);
  }, [userId]);

  useEffect(() => {
    if (isOpen && canChat) refreshList();
  }, [isOpen, canChat, refreshList]);

  // Reloads on reopen too, so messages that arrived while the panel was closed are shown.
  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      return undefined;
    }
    if (!isOpen) return undefined;
    let active = true;
    setLoadingMessages(true);
    setError('');
    api.get(`/api/conversations/${selectedId}/messages`, { params: { limit: 40 } })
      .then(async ({ data }) => {
        if (!active) return;
        setMessages(data.messages || []);
        await api.patch(`/api/conversations/${selectedId}/read`);
        setConversations((rows) => rows.map((row) => (String(row._id) === String(selectedId) ? { ...row, unreadCount: 0 } : row)));
        syncUnread();
      })
      .catch((err) => {
        if (!active) return;
        setError(err.response?.data?.message || 'Unable to load messages');
        if (err.response?.status === 403) setSelectedId(null);
      })
      .finally(() => active && setLoadingMessages(false));
    return () => { active = false; };
  }, [selectedId, isOpen, syncUnread]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.length, isOpen, selectedId]);

  // Live updates: reuse the app socket when available, otherwise open one while the panel is open.
  useEffect(() => {
    if (!isOpen || !canChat) return undefined;
    let owned = null;
    let cancelled = false;
    let unbind = () => {};

    const onMessage = (msg) => {
      const conversationId = String(msg.conversationId || '');
      const mine = String(msg.senderId) === userId;
      const viewing = isOpenRef.current && String(selectedRef.current) === conversationId;
      setConversations((rows) => {
        if (!rows.some((row) => String(row._id) === conversationId)) {
          refreshList();
          return rows;
        }
        return rows
          .map((row) => (String(row._id) !== conversationId ? row : {
            ...row,
            lastMessage: previewOf(msg, row.lastMessage),
            lastMessageAt: msg.createdAt,
            unreadCount: Number(row.unreadCount || 0) + (!mine && !viewing ? 1 : 0),
          }))
          .sort((a, b) => new Date(b.lastMessageAt || 0) - new Date(a.lastMessageAt || 0));
      });
      if (viewing) {
        setMessages((current) => (
          current.some((m) => String(m._id) === String(msg._id) || (msg.clientMessageId && m.clientMessageId === msg.clientMessageId))
            ? current
            : [...current, msg]
        ));
        if (!mine) api.patch(`/api/conversations/${conversationId}/read`).then(syncUnread).catch(() => {});
      }
    };

    const bind = (sock) => {
      socketRef.current = sock;
      sock.on('chat:message', onMessage);
      return () => sock.off('chat:message', onMessage);
    };

    if (externalSocket) {
      unbind = bind(externalSocket);
    } else {
      const token = getSessionToken();
      if (token) {
        import('socket.io-client').then(({ io }) => {
          if (cancelled) return;
          const backendUrl = import.meta.env.VITE_API_URL?.replace(/\/$/, '')
            || (import.meta.env.DEV ? window.location.origin : 'https://udyogconnect.onrender.com');
          owned = io(backendUrl, { auth: { token }, transports: ['websocket', 'polling'] });
          unbind = bind(owned);
        }).catch(() => {});
      }
    }

    return () => {
      cancelled = true;
      unbind();
      if (owned) owned.disconnect();
      socketRef.current = null;
    };
  }, [isOpen, canChat, externalSocket, userId, refreshList, syncUnread]);

  useEffect(() => {
    const sock = socketRef.current;
    if (!sock || !selectedId || !isOpen) return undefined;
    sock.emit('chat:join', { conversationId: selectedId }, () => {});
    return () => sock.emit('chat:leave', { conversationId: selectedId });
  }, [selectedId, isOpen]);

  const handleSend = async (event) => {
    event.preventDefault();
    if (!selectedId || (!draft.trim() && !attachment)) return;
    if (!guard.begin()) return;
    setSending(true);
    const clientMessageId = `cmsg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    try {
      const form = new FormData();
      form.append('message', draft.trim());
      form.append('clientMessageId', clientMessageId);
      if (attachment) form.append('attachment', attachment);
      else form.append('messageType', 'text');

      const { data } = await api.post(`/api/conversations/${selectedId}/messages`, form, {
        headers: { 'Content-Type': 'multipart/form-data', ...createIdempotencyHeader(clientMessageId) },
      });
      const saved = data.message;
      setMessages((current) => (
        current.some((m) => String(m._id) === String(saved._id) || m.clientMessageId === clientMessageId) ? current : [...current, saved]
      ));
      setConversations((rows) => rows
        .map((row) => (String(row._id) === String(selectedId) ? { ...row, lastMessage: previewOf(saved, row.lastMessage), lastMessageAt: saved.createdAt } : row))
        .sort((a, b) => new Date(b.lastMessageAt || 0) - new Date(a.lastMessageAt || 0)));
      setDraft('');
      setAttachment(null);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to send message.');
    } finally {
      setSending(false);
      guard.finish();
    }
  };

  if (hidden || user?.role === 'admin') return null;

  const blocked = selected?.status === 'blocked';

  return (
    <div className={`fixed bottom-6 right-6 ${isOpen ? 'z-50' : 'z-45'} flex flex-col items-end`}>
      {isOpen && (
        <div className="mb-4 h-[min(480px,calc(100vh-7rem))] w-[min(350px,calc(100vw-3rem))] sm:w-[380px] flex flex-col rounded-[28px] border border-slate-800 bg-slate-950/95 shadow-2xl backdrop-blur-md animate-slide-up">
          <div className="flex items-center justify-between border-b border-slate-850 px-4 py-3 bg-slate-900 rounded-t-[28px]">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-400 text-slate-950 font-black">
                U
              </div>
              <span className="text-xs font-extrabold text-white">UdyogConnect Chat</span>
            </div>
            <div className="flex items-center gap-3">
              {canChat && onOpenMessages && (
                <button
                  type="button"
                  onClick={() => { setIsOpen(false); onOpenMessages(selectedId); }}
                  className="text-slate-400 hover:text-white"
                  title="Open in Messages"
                  aria-label="Open in Messages"
                >
                  <FiExternalLink className="h-4 w-4" />
                </button>
              )}
              <button type="button" onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-white" aria-label="Close chat">
                <FiX className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div className="border-b border-slate-900 bg-slate-950 px-4 py-2">
            <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              <FiUser className="text-amber-400" /> Messages
            </span>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
            {!canChat ? (
              <div className="py-10 text-center text-xs text-slate-500">
                {translate('Sign in to see your messages.', 'सन्देश हेर्न साइन इन गर्नुहोस्।')}
              </div>
            ) : !selected ? (
              <div className="space-y-2 py-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-450">{translate('Select Active Chat', 'कुराकानी चयन गर्नुहोस्')}</span>
                {loadingList && !conversations.length ? (
                  <div className="py-10 text-center text-xs text-slate-500">Loading conversations…</div>
                ) : error && !conversations.length ? (
                  <div className="py-10 text-center text-xs text-rose-400">
                    {error}{' '}
                    <button type="button" onClick={refreshList} className="text-amber-400 underline">Retry</button>
                  </div>
                ) : conversations.length === 0 ? (
                  <div className="py-10 text-center text-xs text-slate-500">
                    {isCustomer ? 'No conversations yet. Use "Message" on a business profile to start one.' : 'No conversations yet.'}
                  </div>
                ) : (
                  conversations.map((c) => {
                    const other = peerOf(c);
                    const avatar = other?.imageUrl || other?.profilePicture;
                    return (
                      <button
                        key={c._id}
                        type="button"
                        onClick={() => setSelectedId(c._id)}
                        className="flex w-full items-center gap-3 rounded-2xl border border-slate-850 bg-slate-900/40 p-3 text-left hover:bg-slate-900/80 cursor-pointer transition"
                      >
                        <span className="relative h-8 w-8 shrink-0 rounded-full bg-slate-800 flex items-center justify-center font-bold text-xs text-slate-200 overflow-hidden">
                          {avatar ? <img src={avatar} alt="" className="h-full w-full object-cover" /> : (other?.name || '?').charAt(0)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center justify-between gap-2">
                            <h5 className="truncate text-xs font-bold text-slate-200">{other?.name || 'Conversation'}</h5>
                            <span className="shrink-0 text-[9px] text-slate-500">{timeLabel(c.lastMessageAt)}</span>
                          </span>
                          <span className="flex items-center justify-between gap-2">
                            <span className="truncate text-[11px] text-slate-400">{c.lastMessage || 'No messages yet'}</span>
                            {c.unreadCount > 0 && (
                              <b className="shrink-0 rounded-full bg-amber-400 px-1.5 text-[9px] font-black text-slate-950">{c.unreadCount}</b>
                            )}
                          </span>
                          <span className={`text-[9px] font-semibold uppercase tracking-wider ${other?.online ? 'text-emerald-400' : 'text-slate-500'}`}>
                            {other?.online ? 'Online' : 'Offline'}
                          </span>
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            ) : (
              <div className="flex flex-col h-full">
                <div className="flex items-center gap-2 border-b border-slate-900 pb-2 mb-2">
                  <button type="button" onClick={() => setSelectedId(null)} className="text-xs text-amber-400">← Back</button>
                  <span className="text-xs font-extrabold text-white truncate max-w-[200px]">
                    {peer?.name || 'Chat'} {peer?.online ? '(Online)' : '(Offline)'}
                  </span>
                </div>

                <div className="flex-1 space-y-3 pr-1">
                  {loadingMessages && !messages.length ? (
                    <div className="py-10 text-center text-xs text-slate-500">Loading messages…</div>
                  ) : messages.length === 0 ? (
                    <div className="py-10 text-center text-xs text-slate-500">Send a message to start conversation.</div>
                  ) : (
                    messages.map((m) => {
                      const isMe = String(m.senderId) === userId;
                      return (
                        <div key={m._id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                          <div
                            className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-xs leading-relaxed ${
                              isMe
                                ? 'bg-amber-400 text-slate-950 rounded-br-none font-medium'
                                : 'bg-slate-900 text-slate-200 rounded-bl-none border border-slate-800'
                            }`}
                          >
                            {m.messageType === 'image' && m.attachmentUrl && (
                              <a href={m.attachmentUrl} target="_blank" rel="noreferrer" className="mb-1 block max-w-[150px] overflow-hidden rounded-lg">
                                <img src={m.attachmentUrl} alt="chat attachment" className="w-full object-cover" />
                              </a>
                            )}
                            {m.messageType === 'file' && m.attachmentUrl && (
                              <a href={m.attachmentUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 underline">
                                <FiPaperclip /> Attachment
                              </a>
                            )}
                            {m.messageType === 'product' && (
                              <p className="flex items-center gap-1.5 text-left font-semibold"><FiPackage /> {m.message || 'Product'}</p>
                            )}
                            {m.messageType === 'order' && (
                              <p className="flex items-center gap-1.5 text-left font-semibold"><FiShoppingBag /> {m.message || 'Order'}</p>
                            )}
                            {(!m.messageType || m.messageType === 'text' || m.messageType === 'image') && m.message && (
                              <p className="text-left">{m.message}</p>
                            )}
                          </div>
                          <span className="text-[8px] text-slate-500 mt-1 px-1">
                            {timeLabel(m.createdAt)}{isMe ? (m.isRead ? ' · Seen' : '') : ''}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-slate-850 p-3 bg-slate-950 rounded-b-[28px]">
            {selected && (
              <form onSubmit={handleSend} className="space-y-2 font-sans">
                {error && <p className="text-[10px] text-rose-400">{error}</p>}
                {attachment && (
                  <div className="flex items-center justify-between bg-slate-900/60 p-1.5 rounded-lg text-xs">
                    <span className="text-[10px] text-amber-300 truncate max-w-[200px]">{attachment.name || 'Attachment ready'}</span>
                    <button type="button" onClick={() => setAttachment(null)} className="text-rose-400 cursor-pointer">Remove</button>
                  </div>
                )}
                <div className="flex gap-2 items-center">
                  <label className="cursor-pointer text-slate-400 hover:text-white" title="Attach image">
                    <FiImage className="h-5 w-5" />
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      onChange={(e) => setAttachment(e.target.files?.[0] || null)}
                      className="hidden"
                    />
                  </label>
                  <input
                    type="text"
                    placeholder={blocked ? 'This conversation is blocked' : 'Type a message...'}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    disabled={blocked}
                    className="flex-1 rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-white outline-none focus:border-amber-400"
                  />
                  <button type="submit" disabled={sending || blocked} className="rounded-xl bg-amber-400 p-2 text-slate-950 cursor-pointer hover:scale-105 active:scale-95 transition disabled:cursor-not-allowed disabled:opacity-40" aria-label="Send">
                    <FiSend className="h-4.5 w-4.5" />
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="relative flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-r from-amber-400 to-amber-500 text-slate-950 shadow-xl shadow-amber-500/20 transition hover:scale-105 active:scale-95 cursor-pointer"
        aria-label={isOpen ? 'Close messages' : 'Open messages'}
      >
        {isOpen ? <FiX className="h-6 w-6" /> : <FiMessageSquare className="h-6 w-6" />}
        {!isOpen && canChat && unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-black text-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>
    </div>
  );
}
