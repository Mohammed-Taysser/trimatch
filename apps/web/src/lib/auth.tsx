import {
  AuthUser,
  LoginResponse,
  LoginResponseSchema,
  LoginResult,
  LoginResultSchema,
} from '@trimatch/shared';
import { createContext, ReactNode, useCallback, useContext, useMemo, useState } from 'react';
import { apiFetch } from './api';

const STORAGE_KEY = 'trimatch.auth';

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  // Set when the company mandates 2FA but this user hasn't enrolled (869e01b14).
  mustEnrollTwoFactor: boolean;
  // Password step: resolves to a session, or a challenge when 2FA is enabled.
  login: (email: string, password: string) => Promise<LoginResult>;
  // Second factor: exchange the challenge + a TOTP/recovery code for a session.
  completeTwoFactor: (challenge: string, code: string) => Promise<void>;
  // Reflect a 2FA enable/disable done on the security page without re-logging in.
  setTwoFactorEnabled: (enabled: boolean) => void;
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

function persist(session: LoginResponse): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<LoginResponse | null>(readStored);

  const login = useCallback(async (email: string, password: string): Promise<LoginResult> => {
    const result = await apiFetch('/api/v1/auth/login', {
      method: 'POST',
      body: { email, password },
      schema: LoginResultSchema,
    });
    // A challenge (2FA enabled) is not a session — the caller shows the code step.
    if ('accessToken' in result) {
      persist(result);
      setSession(result);
    }
    return result;
  }, []);

  const completeTwoFactor = useCallback(async (challenge: string, code: string): Promise<void> => {
    const result = await apiFetch('/api/v1/auth/2fa/verify', {
      method: 'POST',
      body: { challenge, code },
      schema: LoginResponseSchema,
    });
    persist(result);
    setSession(result);
  }, []);

  const setTwoFactorEnabled = useCallback((enabled: boolean) => {
    setSession((current) => {
      if (!current) return current;
      const next = { ...current, user: { ...current.user, twoFactorEnabled: enabled } };
      persist(next);
      return next;
    });
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setSession(null);
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      token: session?.accessToken ?? null,
      user: session?.user ?? null,
      mustEnrollTwoFactor: session?.mustEnrollTwoFactor ?? false,
      login,
      completeTwoFactor,
      setTwoFactorEnabled,
      logout,
    }),
    [session, login, completeTwoFactor, setTwoFactorEnabled, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
