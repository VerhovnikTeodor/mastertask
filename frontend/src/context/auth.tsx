import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, setUnauthorizedHandler } from '../lib/api';
import { keys, useMe } from '../api/hooks';
import type { User } from '../lib/types';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (data: { email: string; password: string; firstName: string; lastName: string }) => Promise<User>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function applyTheme(theme: 'light' | 'dark' | 'system' = 'system') {
  try {
    localStorage.setItem('mt-theme', theme);
  } catch {
    // Zasebni način brskalnika – tema velja samo za to sejo.
  }
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const me = useMe();
  const user = me.data ?? null;

  /** Podatki prejšnje seje se ne smejo prikazati novemu uporabniku; poizvedba "me" ostane, da jo opazovalci ne izgubijo. */
  const switchSession = useCallback(
    (next: User | null) => {
      qc.setQueryData(keys.me, next);
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== keys.me[0] });
    },
    [qc],
  );

  useEffect(() => {
    setUnauthorizedHandler(() => {
      if (qc.getQueryData(keys.me)) switchSession(null);
    });
  }, [qc, switchSession]);

  useEffect(() => {
    if (!user) return;
    applyTheme(user.preferences.theme ?? 'system');
    document.documentElement.dataset.density = user.preferences.density ?? 'comfortable';
  }, [user]);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      const theme = (localStorage.getItem('mt-theme') as 'light' | 'dark' | 'system' | null) ?? 'system';
      if (theme === 'system') applyTheme('system');
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const { user: u } = await api.post<{ user: User }>('/auth/login', { email, password });
      switchSession(u);
      return u;
    },
    [switchSession],
  );

  const register = useCallback(
    async (data: { email: string; password: string; firstName: string; lastName: string }) => {
      const { user: u } = await api.post<{ user: User }>('/auth/register', data);
      switchSession(u);
      return u;
    },
    [switchSession],
  );

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      switchSession(null);
    }
  }, [switchSession]);

  const value = useMemo(
    () => ({ user, loading: me.isPending, login, register, logout }),
    [user, me.isPending, login, register, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth mora biti znotraj AuthProvider');
  return ctx;
}

/** Povezava do projekta upošteva privzeti pogled iz nastavitev (tabla ali seznam). */
export function useProjectHref() {
  const { user } = useAuth();
  const list = user?.preferences.defaultTaskView === 'list';
  return useCallback((projectId: string) => `/projects/${projectId}${list ? '/list' : ''}`, [list]);
}

export function useCurrentUser() {
  const { user } = useAuth();
  if (!user) throw new Error('Uporabnik ni prijavljen');
  return user;
}
