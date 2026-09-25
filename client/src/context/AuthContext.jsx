import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import api from '../utils/api';
import { normalizeUser } from '../utils/authFlow';
import { clearSessionAuth, getSessionToken, getSessionUser, setSessionAuth, updateSessionUser } from '../utils/sessionAuth';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const dispatch = useDispatch();
  const user = useSelector((state) => state.user);
  const [sessionNotice, setSessionNotice] = useState('');
  const hasTokenAtBoot = Boolean(getSessionToken());
  const [authReady, setAuthReady] = useState(Boolean(user) || !hasTokenAtBoot);
  const bootedRef = useRef(false);

  useEffect(() => {
    if (bootedRef.current) return undefined;
    bootedRef.current = true;

    const token = getSessionToken();
    const storedUser = getSessionUser();

    if (storedUser) {
      dispatch({ type: 'SET_USER', payload: normalizeUser(storedUser) });
    }

    if (!token) {
      setAuthReady(true);
      return undefined;
    }

    // UI can render immediately from the hydrated session; refresh profile in the background.
    setAuthReady(true);

    let cancelled = false;
    api.get('/api/auth/profile')
      .then((response) => {
        if (cancelled) return;
        const freshUser = normalizeUser(response.data);
        updateSessionUser(freshUser);
        dispatch({ type: 'SET_USER', payload: freshUser });
      })
      .catch(() => {
        // Keep the locally hydrated session if the profile refresh fails.
      });

    return () => {
      cancelled = true;
    };
  }, [dispatch]);

  useEffect(() => {
    const handleUnauthorized = (event) => {
      clearSessionAuth();
      dispatch({ type: 'SET_USER', payload: null });
      setSessionNotice(event.detail?.message || 'Your session has expired. Please log in again.');
      setAuthReady(true);
    };

    window.addEventListener('api-unauthorized', handleUnauthorized);
    return () => window.removeEventListener('api-unauthorized', handleUnauthorized);
  }, [dispatch]);

  const value = useMemo(() => ({
    user,
    authReady,
    sessionNotice,
    clearSessionNotice: () => setSessionNotice(''),
    establishSession: (data) => {
      const normalizedUser = normalizeUser(data.user);
      setSessionAuth(data.token, normalizedUser);
      dispatch({ type: 'SET_USER', payload: normalizedUser });
      setSessionNotice('');
      setAuthReady(true);
      return normalizedUser;
    },
    endSession: () => {
      clearSessionAuth();
      dispatch({ type: 'SET_USER', payload: null });
      setAuthReady(true);
    },
    persistUser: (nextUser) => {
      const normalizedUser = normalizeUser(nextUser);
      updateSessionUser(normalizedUser);
      dispatch({ type: 'SET_USER', payload: normalizedUser });
      return normalizedUser;
    },
  }), [authReady, dispatch, sessionNotice, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider.');
  }
  return context;
}
