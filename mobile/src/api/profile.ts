import { File } from 'expo-file-system';

import { api } from './client';
import { getToken } from './auth';
import type { ProfileData } from '@/types';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

export const getProfileData = () => api.get<ProfileData>('/api/mobile/profile');

export const saveProfile = (body: Record<string, unknown>) =>
  api.put<{ success: boolean }>('/api/profile', body);

// Same WinterCG-fetch FormData workaround as uploadBaseResume (see resumes.ts).
export async function uploadAvatar(photo: { uri: string; name: string; mimeType?: string | null }): Promise<void> {
  const token = await getToken();
  const form = new FormData();
  form.append('file', new File(photo.uri) as unknown as Blob, photo.name);
  const res = await fetch(`${BASE_URL}/api/profile/avatar`, {
    method: 'POST',
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: form,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error ?? 'No se pudo subir la foto.');
  }
}

export const AVATAR_URL = `${BASE_URL}/api/profile/avatar`;
