import { z } from 'zod';

/** Credentials the onboarding wizard collects and the vault stores. */
export const EngineCredentials = z.object({
  discordToken: z.string().min(1),
  discordClientId: z.string().regex(/^\d{17,20}$/, 'Discord application IDs are 17-20 digit snowflakes'),
  discordGuildId: z.string().regex(/^\d{17,20}$/).optional(),
  spotifyClientId: z.string().min(1),
  spotifyClientSecret: z.string().min(1),
  publicAuthBaseUrl: z.string().url().optional(),
});
export type EngineCredentials = z.infer<typeof EngineCredentials>;

/** Fixed engine env for the default localhost-only setup. */
export const FIXED_ENGINE_ENV = {
  PORT: '8888',
  AUDIO_PLATFORM: 'windows',
  AUDIO_DEVICE: 'CABLE Output (VB-Audio Virtual Cable)',
} as const;

export interface EngineRuntimeOptions {
  dataDir: string;
  ffmpegPath: string;
  /** Base64 32-byte key enabling at-rest encryption of the profile store. */
  storeKey?: string;
  nluModelPath?: string;
  audioDevice?: string;
  spotifyOutputDevice?: string;
  spotifyRestoreDevice?: string;
}

/** Build the process env injected into the forked engine child. No .env on disk. */
export function toEngineEnv(creds: EngineCredentials, opts: EngineRuntimeOptions): Record<string, string> {
  const publicAuthBaseUrl = creds.publicAuthBaseUrl?.replace(/\/+$/, '');
  const redirectUri = publicAuthBaseUrl ? `${publicAuthBaseUrl}/callback` : 'http://localhost:8888/callback';
  const env: Record<string, string> = {
    ...FIXED_ENGINE_ENV,
    DISCORD_TOKEN: creds.discordToken,
    DISCORD_CLIENT_ID: creds.discordClientId,
    SPOTIFY_CLIENT_ID: creds.spotifyClientId,
    SPOTIFY_CLIENT_SECRET: creds.spotifyClientSecret,
    SPOTIFY_REDIRECT_URI: redirectUri,
    GREENROOM_DATA_DIR: opts.dataDir,
    FFMPEG_PATH: opts.ffmpegPath,
  };
  if (creds.discordGuildId) env.DISCORD_GUILD_ID = creds.discordGuildId;
  if (publicAuthBaseUrl) env.GREENROOM_PUBLIC_AUTH_BASE_URL = publicAuthBaseUrl;
  if (opts.storeKey) env.GREENROOM_STORE_KEY = opts.storeKey;
  if (opts.nluModelPath) env.GREENROOM_NLU_MODEL = opts.nluModelPath;
  if (opts.audioDevice) env.AUDIO_DEVICE = opts.audioDevice;
  if (opts.spotifyOutputDevice) env.GREENROOM_SPOTIFY_OUTPUT_DEVICE = opts.spotifyOutputDevice;
  if (opts.spotifyRestoreDevice) env.GREENROOM_SPOTIFY_RESTORE_DEVICE = opts.spotifyRestoreDevice;
  return env;
}

/** Build the Discord OAuth2 bot invite URL from the application id. */
export function botInviteUrl(clientId: string): string {
  // Send Messages, Embed Links, Connect, Speak, Use Voice Activity.
  const permissions = '36703232';
  const params = new URLSearchParams({
    client_id: clientId,
    scope: 'bot applications.commands',
    permissions,
  });
  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}
