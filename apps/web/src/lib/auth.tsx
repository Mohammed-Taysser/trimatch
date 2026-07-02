import { AuthUser, LoginResponse, LoginResponseSchema } from '@trimatch/shared';
import { createContext, ReactNode, useCallback, useContext, useMemo, useState } from 'react';
import { apiFetch } from './api';

const STORAGE_KEY = 'trimatch.auth';

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

function readStored(): LoginResponse | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? LoginResponseSchema.parse(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<LoginResponse | null>(readStored);

  const login = useCallback(async (email: string, password: string) => {
    const response = await apiFetch('/api/v1/auth/login', {
      method: 'POST',
      body: { email, password },
      schema: LoginResponseSchema,
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(response));
    setSession(response);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setSession(null);
  }, []);

  const value = useMemo<AuthState>(
    () => ({ token: session?.accessToken ?? null, user: session?.user ?? null, login, logout }),
    [session, login, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
