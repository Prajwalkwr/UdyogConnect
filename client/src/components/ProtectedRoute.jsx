import React from 'react';
import RoleRoute from './RoleRoute';

export default function ProtectedRoute({ user, authReady = true, children }) {
  return (
    <RoleRoute user={user} allow={['customer', 'seller', 'admin']} authReady={authReady}>
      {children}
    </RoleRoute>
  );
}
