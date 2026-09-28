import React, { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import MessagingHub from './MessagingHub';
import './MessagingHub.css';

export default function CustomerMessagesPage({ user, socket, onUnreadChange }) {
  const [params] = useSearchParams();
  const initialConversationId = useMemo(() => params.get('c') || null, [params]);

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', padding: '8px 0 24px' }}>
      <MessagingHub
        user={user}
        mode="customer"
        initialConversationId={initialConversationId}
        socket={socket}
        onUnreadChange={onUnreadChange}
      />
    </div>
  );
}
