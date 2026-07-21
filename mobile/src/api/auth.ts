import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'applica_token';
const ONBOARDED_KEY = 'applica_onboarded';
const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

export async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

async function setToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function clearToken(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

export async function hasSeenOnboarding(): Promise<boolean> {
  return (await SecureStore.getItemAsync(ONBOARDED_KEY)) === 'true';
}

export async function markOnboardingSeen(): Promise<void> {
  await SecureStore.setItemAsync(ONBOARDED_KEY, 'true');
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error ?? 'Algo salió mal. Inténtalo de nuevo.');
  return data as T;
}

export type LoginUser = { id: string; email: string; name: string };
export type MeUser = LoginUser & { searchTuningEnabled: boolean };

export async function login(email: string, password: string): Promise<LoginUser> {
  const body = await post<{ token: string; user: LoginUser }>('/api/mobile/login', { email, password });
  await setToken(body.token);
  return body.user;
}

// Re-hidrata el usuario (con flags calculados en el servidor, ej.
// searchTuningEnabled) a partir del token ya persistido - necesario porque
// login()/register() no traen esos flags y un reinicio en frío de la app no
// vuelve a llamar a ninguno de los dos.
export async function fetchMe(): Promise<MeUser> {
  const { api } = await import('./client');
  return api.get<MeUser>('/api/mobile/me');
}

export async function register(input: {
  name: string; email: string; password: string; securityQuestion: string; securityAnswer: string;
}): Promise<void> {
  const body = await post<{ token: string; userId: string }>('/api/auth/register', input);
  await setToken(body.token);
}

export async function logout(): Promise<void> {
  await clearToken();
}

export async function fetchSecurityQuestion(email: string): Promise<string> {
  const body = await post<{ question: string }>('/api/auth/forgot-password/question', { email });
  return body.question;
}

export async function resetPasswordWithAnswer(input: { email: string; answer: string; newPassword: string }): Promise<void> {
  const body = await post<{ token: string }>('/api/auth/forgot-password/reset', input);
  await setToken(body.token);
}
