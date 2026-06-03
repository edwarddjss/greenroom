import { safeStorage } from 'electron';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import initSqlJs, { type Database } from 'sql.js';
import { EngineCredentials, type CredsStatus } from '@greenroom/shared';
import { dataDir } from './paths';

const require = createRequire(import.meta.url);

const dbFile = (): string => join(dataDir(), 'greenroom.sqlite');
const legacyDbFiles = (): string[] => [join(dataDir(), 'spoticord.sqlite'), join(dataDir(), 'sonicord.sqlite')];
const legacyCredsFile = (): string => join(dataDir(), 'creds.enc');
const legacyStoreKeyFile = (): string => join(dataDir(), 'storekey.enc');
const PartialCreds = EngineCredentials.partial();

let db: Database | null = null;

function encrypt(text: string): string {
  const buf = safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(text) : Buffer.from(text, 'utf8');
  return buf.toString('base64');
}

function decrypt(value: string): string {
  const buf = Buffer.from(value, 'base64');
  return safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(buf) : buf.toString('utf8');
}

function legacyDecrypt(buf: Buffer): string {
  return safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(buf) : buf.toString('utf8');
}

function persist(): void {
  if (!db) throw new Error('Credential database is not initialized.');
  fs.mkdirSync(dataDir(), { recursive: true });
  fs.writeFileSync(dbFile(), Buffer.from(db.export()));
}

function database(): Database {
  if (!db) throw new Error('Credential database is not initialized.');
  return db;
}

function getSecureValue(key: string): string | undefined {
  const result = database().exec('SELECT value FROM secure_values WHERE key = ? LIMIT 1', [key]);
  const raw = result[0]?.values[0]?.[0];
  if (typeof raw !== 'string') return undefined;
  try {
    return decrypt(raw);
  } catch {
    return undefined;
  }
}

function setSecureValue(key: string, value: string): void {
  database().run(
    `INSERT INTO secure_values (key, value, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [key, encrypt(value), Date.now()],
  );
}

function deleteSecureValue(key: string): void {
  database().run('DELETE FROM secure_values WHERE key = ?', [key]);
}

function migrateLegacyFiles(): void {
  if (database().exec('SELECT COUNT(*) FROM secure_values')[0]?.values[0]?.[0] !== 0) return;

  if (fs.existsSync(legacyCredsFile())) {
    try {
      const parsed = PartialCreds.safeParse(JSON.parse(legacyDecrypt(fs.readFileSync(legacyCredsFile()))));
      if (parsed.success) {
        for (const [key, value] of Object.entries(parsed.data)) {
          if (typeof value === 'string' && value.length > 0) setSecureValue(key, value);
        }
      }
    } catch {
      // Ignore corrupt legacy credentials; the user can re-enter them.
    }
  }

  if (fs.existsSync(legacyStoreKeyFile())) {
    try {
      const key = legacyDecrypt(fs.readFileSync(legacyStoreKeyFile()));
      if (key) setSecureValue('storeKey', key);
    } catch {
      // Regenerated lazily by getStoreKey.
    }
  }
  persist();
}

export async function initVault(): Promise<void> {
  if (db) return;
  const SQL = await initSqlJs({
    locateFile: (file) => (file === 'sql-wasm.wasm' ? require.resolve('sql.js/dist/sql-wasm.wasm') : file),
  });
  if (!fs.existsSync(dbFile())) {
    const legacyDb = legacyDbFiles().find((file) => fs.existsSync(file));
    if (legacyDb) fs.copyFileSync(legacyDb, dbFile());
  }
  const existing = fs.existsSync(dbFile()) ? fs.readFileSync(dbFile()) : null;
  db = existing ? new SQL.Database(existing) : new SQL.Database();
  db.run(`
    CREATE TABLE IF NOT EXISTS secure_values (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
  migrateLegacyFiles();
  persist();
}

export function loadCreds(): Partial<EngineCredentials> {
  const raw: Record<string, string> = {};
  for (const key of Object.keys(PartialCreds.shape)) {
    const value = getSecureValue(key);
    if (value) raw[key] = value;
  }
  const parsed = PartialCreds.safeParse(raw);
  return parsed.success ? (parsed.data as Partial<EngineCredentials>) : {};
}

export function saveCreds(partial: Partial<EngineCredentials>): void {
  const merged = { ...loadCreds(), ...partial };
  const parsed = PartialCreds.safeParse(merged);
  if (!parsed.success) throw new Error('Invalid credential payload.');
  for (const [key, value] of Object.entries(parsed.data)) {
    if (typeof value === 'string' && value.length > 0) setSecureValue(key, value);
  }
  persist();
}

export function clearCredFields(keys: (keyof EngineCredentials)[]): void {
  for (const key of keys) {
    deleteSecureValue(key);
  }
  persist();
}

export function credsStatus(): CredsStatus {
  const c = loadCreds();
  const field = (v: string | undefined): 'set' | 'empty' => (v && v.length > 0 ? 'set' : 'empty');
  return {
    hasDiscord: Boolean(c.discordToken && c.discordClientId),
    hasSpotify: Boolean(c.spotifyClientId && c.spotifyClientSecret),
    fields: {
      discordToken: field(c.discordToken),
      discordClientId: field(c.discordClientId),
      discordGuildId: field(c.discordGuildId),
      spotifyClientId: field(c.spotifyClientId),
      spotifyClientSecret: field(c.spotifyClientSecret),
      publicAuthBaseUrl: field(c.publicAuthBaseUrl),
    },
  };
}

/** Stable base64 32-byte key for the engine's at-rest profile-store encryption. */
export function getStoreKey(): string {
  const existing = getSecureValue('storeKey');
  if (existing) return existing;
  const key = crypto.randomBytes(32).toString('base64');
  setSecureValue('storeKey', key);
  persist();
  return key;
}
