import { File } from 'expo-file-system';

import { getToken } from './auth';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

export type PickedFile = { uri: string; name: string; mimeType?: string | null };

// Expo SDK 57's fetch is the WinterCG one: it rejects the legacy RN
// `{ uri, name, type }`-cast-as-Blob FormData trick with "Unsupported
// FormDataPart implementation" (found live on device). expo-file-system's
// File implements Blob, which this fetch's FormData does accept. Still can't
// go through api/client.ts's JSON-only wrapper.
export async function uploadBaseResume(file: PickedFile): Promise<{ success: boolean; searchQueued?: boolean }> {
  const token = await getToken();
  const form = new FormData();
  form.append('file', new File(file.uri) as unknown as Blob, file.name);

  const res = await fetch(`${BASE_URL}/api/resumes/base`, {
    method: 'POST',
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error ?? 'No se pudo subir el CV.');
  return data;
}

export async function deleteResume(id: string): Promise<void> {
  const token = await getToken();
  const res = await fetch(`${BASE_URL}/api/resumes/${id}`, {
    method: 'DELETE',
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error ?? 'No se pudo borrar el CV.');
  }
}

export async function activateResume(id: string): Promise<void> {
  const token = await getToken();
  const res = await fetch(`${BASE_URL}/api/resumes/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error ?? 'No se pudo activar el CV.');
  }
}
