import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api, getToken, setToken } from './api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!getToken()) {
      setReady(true);
      return undefined;
    }
    let cancelled = false;
    api('/api/auth/me')
      .then((me) => {
        if (!cancelled) setUser(me);
      })
      .catch(() => {
        setToken(null);
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo(() => ({
    user,
    ready,
    async login(email, password) {
      const data = await api('/api/auth/login', {
        method: 'POST',
        body: { email, password },
      });
      setToken(data.token);
      setUser(data.user);
    },
    logout() {
      setToken(null);
      setUser(null);
    },
  }), [user, ready]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}

export function canManage(user) {
  return Boolean(user) && (user.role === 'admin' || user.role === 'manager');
}
