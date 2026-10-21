import { useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { AuthContext, type AuthState } from '@/entities/viewer';
import {
  api,
  type AuthResponse,
  refreshSession,
  type Role,
  session,
  type User,
} from '@/shared/api';

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(session.auth?.user ?? null);
  const [ready, setReady] = useState(false);

  useEffect(() => session.subscribe((auth) => setUser(auth?.user ?? null)), []);

  useEffect(() => {
    void refreshSession().finally(() => setReady(true));
  }, []);

  const signIn = useCallback(
    async (path: string, body: unknown) => {
      const auth = await api<AuthResponse>(path, { method: 'POST', body });
      session.set(auth);
      queryClient.clear();
      return auth.user;
    },
    [queryClient],
  );

  const value = useMemo<AuthState>(
    () => ({
      user,
      ready,
      login: (email, password) => signIn('/auth/login', { email, password }),
      register: (name, email, password) => signIn('/auth/register', { name, email, password }),
      async logout() {
        await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
        session.set(null);
        queryClient.clear();
      },
      async completeOAuth() {
        const auth = await refreshSession();
        queryClient.clear();
        return auth?.user ?? null;
      },
      hasRole: (...roles: Role[]) => user !== null && roles.includes(user.role),
    }),
    [user, ready, signIn, queryClient],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
