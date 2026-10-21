import { createContext, useContext } from 'react';
import type { Role, User } from '@/shared/api';

export interface AuthState {
  user: User | null;
  ready: boolean;
  login(email: string, password: string): Promise<User>;
  register(name: string, email: string, password: string): Promise<User>;
  logout(): Promise<void>;
  completeOAuth(): Promise<User | null>;
  hasRole(...roles: Role[]): boolean;
}

export const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return context;
}
