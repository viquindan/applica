import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import {
  fetchSecurityQuestion,
  getToken,
  hasSeenOnboarding,
  login as apiLogin,
  logout as apiLogout,
  markOnboardingSeen,
  register as apiRegister,
  resetPasswordWithAnswer,
  type LoginUser,
} from '@/api/auth';

type AuthState = {
  status: 'loading' | 'signedOut' | 'signedIn';
  user: LoginUser | null;
  onboarded: boolean;
  finishOnboarding: () => void;
  login: (email: string, password: string) => Promise<void>;
  register: (input: { name: string; email: string; password: string; securityQuestion: string; securityAnswer: string }) => Promise<void>;
  forgotPasswordQuestion: (email: string) => Promise<string>;
  resetPassword: (input: { email: string; answer: string; newPassword: string }) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthState['status']>('loading');
  const [user, setUser] = useState<LoginUser | null>(null);
  const [onboarded, setOnboarded] = useState(false);

  useEffect(() => {
    Promise.all([getToken(), hasSeenOnboarding()]).then(([token, seen]) => {
      setOnboarded(seen);
      setStatus(token ? 'signedIn' : 'signedOut');
    });
  }, []);

  const finishOnboarding = useCallback(() => {
    markOnboardingSeen();
    setOnboarded(true);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const loggedInUser = await apiLogin(email, password);
    setUser(loggedInUser);
    setStatus('signedIn');
  }, []);

  const register = useCallback(async (input: { name: string; email: string; password: string; securityQuestion: string; securityAnswer: string }) => {
    await apiRegister(input);
    setUser({ id: '', email: input.email, name: input.name });
    setStatus('signedIn');
  }, []);

  const forgotPasswordQuestion = useCallback((email: string) => fetchSecurityQuestion(email), []);

  const resetPassword = useCallback(async (input: { email: string; answer: string; newPassword: string }) => {
    await resetPasswordWithAnswer(input);
    setStatus('signedIn');
  }, []);

  const logout = useCallback(async () => {
    await apiLogout();
    setUser(null);
    setStatus('signedOut');
  }, []);

  return (
    <AuthContext.Provider value={{ status, user, onboarded, finishOnboarding, login, register, forgotPasswordQuestion, resetPassword, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
