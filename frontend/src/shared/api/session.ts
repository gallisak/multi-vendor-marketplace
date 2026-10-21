import type { AuthResponse } from './types';

type Listener = (auth: AuthResponse | null) => void;

let current: AuthResponse | null = null;
let refreshing: Promise<AuthResponse | null> | null = null;
const listeners = new Set<Listener>();

export const session = {
  get auth() {
    return current;
  },
  get token() {
    return current?.accessToken ?? null;
  },
  set(auth: AuthResponse | null) {
    current = auth;
    listeners.forEach((listener) => listener(auth));
  },
  subscribe(listener: Listener) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

async function requestRefresh(): Promise<AuthResponse | null> {
  try {
    const response = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' });
    return response.ok ? ((await response.json()) as AuthResponse) : null;
  } catch {
    return null;
  }
}

export function refreshSession(): Promise<AuthResponse | null> {
  refreshing ??= requestRefresh()
    .then((auth) => {
      session.set(auth);
      return auth;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}
