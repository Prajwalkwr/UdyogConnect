import React, { useState, useEffect, useRef } from 'react';
import { FiMessageSquare, FiX, FiSend, FiImage, FiUser } from 'react-icons/fi';
import { io as socketIO } from 'socket.io-client';
import api from '../utils/api';

export default function ChatAndAI({ user, lang }) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('dm');

  // DM Chat State
  const [contacts, setContacts] = useState([]);
  const [onlineUserIds, setOnlineUserIds] = useState(new Set());
  const [selectedContact, setSelectedContact] = useState(null);
  const [dmMessage, setDmMessage] = useState('');
  const [dmHistory, setDmHistory] = useState([]);
  const [dmImage, setDmImage] = useState(null);

  const scrollRef = useRef(null);

  const translate = (enText, neText) => {
    return lang === 'en' ? enText : neText;
  };

  useEffect(() => {
    setSelectedContact(null);
    setDmHistory([]);
    setDmMessage('');
    setDmImage(null);
  }, [user?._id, user?.id]);

  useEffect(() => {
    if (!user) {
      setContacts([]);
      setOnlineUserIds(new Set());
      return undefined;
    }

    let mounted = true;
    api.get('/api/users').then((res) => {
      if (mounted) {
        const allowedRoles = user.role === 'customer' ? ['seller'] : user.role === 'seller' ? ['customer'] : [];
        setContacts((Array.isArray(res.data) ? res.data : []).filter((contact) => (
          String(contact._id || contact.id) !== String(user._id) && allowedRoles.includes(contact.role)
        )));
      }
    }).catch(() => {});
    api.get('/api/chat/presence').then((res) => {
      if (mounted) setOnlineUserIds(new Set((res.data?.onlineUserIds || []).map(String)));
    }).catch(() => {});

    const token = localStorage.getItem('token');
    const backendUrl = import.meta.env.VITE_API_URL?.replace(/\/$/, '')
      || (import.meta.env.DEV ? window.location.origin : 'https://udyogconnect.onrender.com');
    const socket = socketIO(backendUrl, {
      auth: { token },
      transports: ['websocket', 'polling'],
    });
    socket.on('presence_snapshot', (ids) => mounted && setOnlineUserIds(new Set(ids.map(String))));
    socket.on('presence_update', ({ userId, online }) => {
      if (!mounted) return;
      setOnlineUserIds((previous) => {
        const next = new Set(previous);
        if (online) next.add(String(userId)); else next.delete(String(userId));
        return next;
      });
    });
    socket.on('new_message', (message) => {
      if (!mounted || !selectedContact || (String(message.senderId) !== String(selectedContact.id) && String(message.receiverId) !== String(selectedContact.id))) return;
      setDmHistory((previous) => previous.some((item) => item._id === message._id) ? previous : [...previous, message]);
    });
    return () => {
      mounted = false;
      socket.disconnect();
    };
  }, [user, selectedContact]);

  // Scroll body container to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [dmHistory, isOpen, activeTab]);

  // Fetch DM history when contact changes
  useEffect(() => {
    if (selectedContact && user) {
      fetchDmHistory(selectedContact.id);
    }
  }, [selectedContact, user]);

  const fetchDmHistory = (contactId) => {
    api
      .get(`/api/chat/${contactId}`)
      .then((res) => setDmHistory(res.data))
      .catch((err) => console.log('Chat logs offline'));
  };

  const handleSendDm = async (e) => {
    e.preventDefault();
    if (!dmMessage.trim() && !dmImage) return;
    try {
      const formData = new FormData();
      formData.append('receiverId', selectedContact.id);
      formData.append('message', dmMessage);
      if (dmImage) {
        formData.append('image', dmImage);
      }

      const response = await api.post('/api/chat', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      setDmHistory((prev) => [...prev, response.data]);
      setDmMessage('');
      setDmImage(null);
    } catch (err) {
      console.log('Send failed');
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-45 flex flex-col items-end">
      {/* 1. Chat Dialog Window */}
      {isOpen && (
        <div className="mb-4 h-[min(480px,calc(100vh-1.5rem))] w-[min(350px,calc(100vw-1rem))] sm:w-[380px] flex flex-col rounded-[28px] border border-slate-800 bg-slate-950/95 shadow-2xl backdrop-blur-md animate-slide-up">
          {/* Header Panel */}
          <div className="flex items-center justify-between border-b border-slate-850 px-4 py-3 bg-slate-900 rounded-t-[28px]">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-400 text-slate-950 font-black">
                U
              </div>
              <span className="text-xs font-extrabold text-white">UdyogConnect Chat</span>
            </div>
            <button onClick={() => setIsOpen(false)} className="text-slate-450 hover:text-white">
              <FiX className="h-5 w-5" />
            </button>
          </div>

          <div className="border-b border-slate-900 bg-slate-950 px-4 py-2">
            <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              <FiUser className="text-amber-400" /> Direct Messages
            </span>
          </div>

          {/* Body panel container */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
            {/* Direct message channel */}
            {activeTab === 'dm' && user && (
              <div className="h-full flex flex-col justify-between">
                {!selectedContact ? (
                  /* Contacts list */
                  <div className="space-y-2 py-4">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-450">{translate('Select Active Chat', 'कुराकानी चयन गर्नुहोस्')}</span>
                    {contacts.map((c) => (
                      <div
                        key={c.id}
                        onClick={() => setSelectedContact(c)}
                        className="flex items-center gap-3 rounded-2xl border border-slate-850 bg-slate-900/40 p-3 hover:bg-slate-900/80 cursor-pointer transition"
                      >
                        <div className="h-7 w-7 rounded-full bg-slate-800 flex items-center justify-center font-bold text-xs text-slate-200">
                          {c.name.charAt(0)}
                        </div>
                        <div className="text-left">
                          <h5 className="text-xs font-bold text-slate-200">{c.name}</h5>
                          <span className={`text-[9px] font-semibold uppercase tracking-wider ${onlineUserIds.has(String(c.id || c._id)) ? 'text-emerald-400' : 'text-slate-500'}`}>{onlineUserIds.has(String(c.id || c._id)) ? 'Online' : 'Offline'} · {c.role}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  /* Active message history thread */
                  <div className="flex flex-col h-full justify-between">
                    {/* Header back button */}
                    <div className="flex items-center gap-2 border-b border-slate-900 pb-2 mb-2">
                      <button onClick={() => setSelectedContact(null)} className="text-xs text-amber-400">← Back</button>
                      <span className="text-xs font-extrabold text-white truncate max-w-[200px]">{selectedContact.name} {selectedContact.role === 'seller' && (onlineUserIds.has(String(selectedContact.id)) ? '(Online)' : '(Offline)')}</span>
                    </div>

                    {/* Messages thread */}
                    <div className="flex-1 space-y-3 overflow-y-auto max-h-[260px] pr-1">
                      {dmHistory.length === 0 ? (
                        <div className="py-10 text-center text-xs text-slate-500">
                          Send a message to start conversation.
                        </div>
                      ) : (
                        dmHistory.map((m) => {
                          const isMe = m.senderId === user._id;
                          return (
                            <div key={m._id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                              <div
                                className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-xs leading-relaxed ${
                                  isMe
                                    ? 'bg-amber-400 text-slate-950 rounded-br-none font-medium'
                                    : 'bg-slate-900 text-slate-200 rounded-bl-none border border-slate-800'
                                }`}
                              >
                                {m.message && <p className="text-left">{m.message}</p>}
                                {m.mediaUrl && (
                                  <div className="mt-1 max-w-[150px] overflow-hidden rounded-lg">
                                    <img src={m.mediaUrl} alt="chat attachment" className="w-full object-cover" />
                                  </div>
                                )}
                              </div>
                              <span className="text-[8px] text-slate-500 mt-1 px-1">
                                {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

          </div>

          {/* Message Input Form footer */}
          <div className="border-t border-slate-850 p-3 bg-slate-950 rounded-b-[28px]">
            {selectedContact && (
                <form onSubmit={handleSendDm} className="space-y-2 font-sans">
                  {dmImage && (
                    <div className="flex items-center justify-between bg-slate-900/60 p-1.5 rounded-lg text-xs">
                      <span className="text-[10px] text-amber-300 truncate max-w-[200px]">Attachment ready</span>
                      <button type="button" onClick={() => setDmImage(null)} className="text-rose-400 cursor-pointer">Remove</button>
                    </div>
                  )}
                  <div className="flex gap-2 items-center">
                    <label className="cursor-pointer text-slate-450 hover:text-white" title="Attach image / photo proof">
                      <FiImage className="h-5 w-5" />
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => setDmImage(e.target.files[0])}
                        className="hidden"
                      />
                    </label>
                    <input
                      type="text"
                      placeholder={selectedContact.role === 'seller' && !onlineUserIds.has(String(selectedContact.id)) ? 'Seller is offline' : 'Type a message...'}
                      value={dmMessage}
                      onChange={(e) => setDmMessage(e.target.value)}
                      disabled={selectedContact.role === 'seller' && !onlineUserIds.has(String(selectedContact.id))}
                      className="flex-1 rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-white outline-none focus:border-amber-400"
                    />
                    <button type="submit" disabled={selectedContact.role === 'seller' && !onlineUserIds.has(String(selectedContact.id))} className="rounded-xl bg-amber-400 p-2 text-slate-950 cursor-pointer hover:scale-105 active:scale-95 transition disabled:cursor-not-allowed disabled:opacity-40">
                      <FiSend className="h-4.5 w-4.5" />
                    </button>
                  </div>
                </form>
            )}
          </div>
        </div>
      )}

      {/* 2. Floating FAB Toggle button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-r from-amber-400 to-amber-500 text-slate-950 shadow-xl shadow-amber-500/20 transition hover:scale-105 active:scale-95 cursor-pointer"
      >
        {isOpen ? <FiX className="h-6 w-6" /> : <FiMessageSquare className="h-6 w-6" />}
      </button>
    </div>
  );
}
