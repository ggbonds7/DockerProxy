import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { ApiRequestError, apiFetch, notifySuccess, requestJson } from '../lib/api';
import type { UserProfile } from '../types';

type AuthStatus = 'checking' | 'authenticated' | 'anonymous';

type AuthContextValue = {
  status: AuthStatus;
  user: UserProfile | null;
  login: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  refreshAuth: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [status, setStatus] = useState<AuthStatus>('checking');
  const [user, setUser] = useState<UserProfile | null>(null);

  const refreshAuth = useCallback(async () => {
    try {
      const result = await requestJson<{ loggedIn: boolean; user?: { username?: string } }>('/api/auth/me', {
        source: '登录状态',
        suppressGlobalError: true,
      });

      if (result.loggedIn) {
        setStatus('authenticated');
        setUser({
          username: result.user?.username || 'admin',
        });
      } else {
        setStatus('anonymous');
        setUser(null);
      }
    } catch {
      setStatus('anonymous');
      setUser(null);
    }
  }, []);

  useEffect(() => {
    void refreshAuth();

    const handleUnauthorized = () => {
      localStorage.removeItem('token');
      setStatus('anonymous');
      setUser(null);
    };

    window.addEventListener('auth-unauthorized', handleUnauthorized);
    return () => window.removeEventListener('auth-unauthorized', handleUnauthorized);
  }, [refreshAuth]);

  const login = useCallback(async (username: string, password: string) => {
    try {
      const result = await requestJson<{ success: boolean; token: string }>('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
        source: '登录',
        suppressGlobalError: true,
      });

      localStorage.setItem('token', result.token);
      await refreshAuth();
      notifySuccess('登录成功', '登录');
      return { success: true };
    } catch (error) {
      if (error instanceof ApiRequestError) {
        return {
          success: false,
          error: error.normalized.message,
        };
      }

      return {
        success: false,
        error: '登录请求失败',
      };
    }
  }, [refreshAuth]);

  const logout = useCallback(async () => {
    try {
      await apiFetch('/api/auth/logout', {
        method: 'POST',
        source: '账户',
        suppressGlobalError: true,
      });
    } finally {
      localStorage.removeItem('token');
      setStatus('anonymous');
      setUser(null);
      notifySuccess('已退出登录', '账户');
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      login,
      logout,
      refreshAuth,
    }),
    [login, logout, refreshAuth, status, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider');
  }

  return context;
}
