import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

/**
 * Symmetric encryption for sensitive at-rest secrets (LinkedIn session cookies).
 * AES-256-GCM with a key derived from SESSION_ENCRYPTION_KEY. Format of the
 * stored string: base64(iv).base64(authTag).base64(ciphertext).
 *
 * Set SESSION_ENCRYPTION_KEY in .env.local to a long random string. We derive a
 * 32-byte key from it via scrypt, so any sufficiently long secret works.
 */

const STATIC_SALT = 'applica:linkedin:session:v1';

function getKey(): Buffer {
  const secret = process.env.SESSION_ENCRYPTION_KEY;
  if (!secret || secret.length < 16) {
    throw new Error('SESSION_ENCRYPTION_KEY is not set (need a long random string in .env.local).');
  }
  return scryptSync(secret, STATIC_SALT, 32);
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}.${tag.toString('base64')}.${ciphertext.toString('base64')}`;
}

export function decryptSecret(token: string): string {
  const [ivB64, tagB64, ctB64] = token.split('.');
  if (!ivB64 || !tagB64 || !ctB64) throw new Error('Malformed encrypted secret.');
  const decipher = createDecipheriv('aes-256-gcm', getKey(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()]).toString('utf8');
}

export function isSessionCryptoConfigured(): boolean {
  return !!process.env.SESSION_ENCRYPTION_KEY && process.env.SESSION_ENCRYPTION_KEY.length >= 16;
}
