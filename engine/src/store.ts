import fs from 'node:fs';
import crypto from 'node:crypto';

/**
 * Tiny JSON store with optional AES-256-GCM at-rest encryption. The Spotify
 * profile store holds refresh tokens, so when the supervisor supplies a key
 * (from Electron safeStorage) the file is encrypted; without a key it falls
 * back to plaintext JSON for local dev.
 */
interface EncryptedEnvelope {
  v: 1;
  iv: string;
  tag: string;
  data: string;
}

function isEnvelope(value: unknown): value is EncryptedEnvelope {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { v?: unknown }).v === 1 &&
    typeof (value as { iv?: unknown }).iv === 'string' &&
    typeof (value as { tag?: unknown }).tag === 'string' &&
    typeof (value as { data?: unknown }).data === 'string'
  );
}

function decodeKey(key: string): Buffer {
  const buf = Buffer.from(key, 'base64');
  if (buf.length !== 32) {
    throw new Error('GREENROOM_STORE_KEY must be a base64-encoded 32-byte key.');
  }
  return buf;
}

export function loadJson<T>(filePath: string, key: string | null, fallback: T): T {
  if (!fs.existsSync(filePath)) return fallback;
  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed: unknown = JSON.parse(raw);

  if (isEnvelope(parsed)) {
    if (!key) throw new Error(`${filePath} is encrypted but no GREENROOM_STORE_KEY was provided.`);
    const decipher = crypto.createDecipheriv('aes-256-gcm', decodeKey(key), Buffer.from(parsed.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(parsed.tag, 'base64'));
    const plain = Buffer.concat([decipher.update(Buffer.from(parsed.data, 'base64')), decipher.final()]).toString('utf8');
    return JSON.parse(plain) as T;
  }

  return parsed as T;
}

export function saveJson<T>(filePath: string, key: string | null, value: T): void {
  const plain = JSON.stringify(value, null, 2);
  if (!key) {
    fs.writeFileSync(filePath, plain, 'utf8');
    return;
  }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', decodeKey(key), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const envelope: EncryptedEnvelope = {
    v: 1,
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: data.toString('base64'),
  };
  fs.writeFileSync(filePath, JSON.stringify(envelope), 'utf8');
}
