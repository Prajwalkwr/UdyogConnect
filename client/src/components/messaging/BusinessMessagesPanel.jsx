import React, { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import MessagingHub from './MessagingHub';
import './MessagingHub.css';

export default function BusinessMessagesPanel({ user, socket, onUnreadChange }) {
  const [params] = useSearchParams();
  const initialConversationId = useMemo(() => params.get('c') || null, [params]);

  return (
    <MessagingHub
      user={user}
      mode="business"
      embedded
      initialConversationId={initialConversationId}
      socket={socket}
      onUnreadChange={onUnreadChange}
    />
  );
}
