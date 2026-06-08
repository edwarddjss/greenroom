import type { EngineCredentials } from './env.js';

/** Supervisor lifecycle states (mirrors the engine state machine in the spec). */
export type EngineState = 'idle' | 'preflight' | 'starting' | 'running' | 'degraded' | 'stopping' | 'crashed';

/** Structured health events emitted by the engine over stdout. */
export type HealthEventName =
  | 'auth_server_listening'
  | 'discord_ready'
  | 'ffmpeg_ready'
  | 'voice_ready'
  | 'voice_stopped'
  | 'spotify_profiles_loaded'
  | 'spotify_auth_saved'
  | 'now_playing'
  | 'engine_error';

/**
 * Confidence of a prerequisite check. Some steps (per-app audio routing) cannot
 * be programmatically verified, so we model trust explicitly instead of faking a
 * binary pass/fail.
 */
export type Confidence = 'verified' | 'user-confirmed' | 'not-verifiable' | 'unknown';

export type PrereqKey = 'ffmpeg' | 'vbcable' | 'spotify' | 'port';
export type PrereqStatus = 'ok' | 'missing' | 'busy' | 'unknown';

export interface PrereqState {
  status: PrereqStatus;
  confidence: Confidence;
  detail?: string;
}
export type PrereqReport = Record<PrereqKey, PrereqState>;

export interface DiscordValidation {
  ok: boolean;
  botName?: string;
  avatarUrl?: string;
  error?: string;
}
export interface SpotifyValidation {
  ok: boolean;
  error?: string;
}
export interface CommandRegisterResult {
  ok: boolean;
  scope: 'guild' | 'global';
  error?: string;
}

export interface TunnelStatus {
  running: boolean;
  url?: string;
  callbackUrl?: string;
  error?: string;
}

export interface CredsStatus {
  hasDiscord: boolean;
  hasSpotify: boolean;
  fields: Record<keyof EngineCredentials, 'set' | 'empty'>;
}

export interface LogLine {
  ts: number;
  level: 'info' | 'warn' | 'error';
  text: string;
}

export interface ModelDownloadProgress {
  receivedBytes: number;
  totalBytes: number | null;
}

export interface VbCableInstallResult {
  ok: boolean;
  launched: boolean;
  rebootRequired: boolean;
  message: string;
  error?: string;
}

export interface UpdateStatus {
  phase: 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'error';
  currentVersion: string;
  supported: boolean;
  version?: string;
  percent?: number;
  error?: string;
  userInitiated?: boolean;
  lastCheckedAt?: number;
}

/** What the host's Spotify is currently playing, surfaced for the now-playing hero. */
export interface NowPlaying {
  title: string;
  artist: string;
  /** Album cover URL from Spotify (640px). Undefined if Spotify returned no art. */
  albumArtUrl?: string;
  isPlaying: boolean;
  /** Playback position + length so the renderer can interpolate a smooth progress bar between polls. */
  progressMs?: number;
  durationMs?: number;
  /** Epoch ms when this snapshot was taken — anchor for client-side progress interpolation. */
  sampledAt: number;
}

/** Full supervisor snapshot streamed to the renderer dashboard. */
export interface EngineSnapshot {
  state: EngineState;
  lastError?: string;
  prereqs: PrereqReport;
  spotifyLinked: boolean;
  captureActive: boolean;
  /** Last RMS capture amplitude (0-1), for the live audio meter. */
  audioLevel?: number;
  lastCommandError?: string;
  guildName?: string;
  channelName?: string;
  /** Current track on the host's Spotify, or null when nothing is playing. */
  nowPlaying?: NowPlaying | null;
}

/** The full preload-exposed API surface. No secret values are ever returned. */
export interface GreenroomIpcApi {
  engineStart(): Promise<EngineSnapshot>;
  engineStop(): Promise<EngineSnapshot>;
  engineRestart(): Promise<EngineSnapshot>;
  engineGetSnapshot(): Promise<EngineSnapshot>;
  prereqsScan(): Promise<PrereqReport>;
  vbcableInstall(): Promise<VbCableInstallResult>;
  credsSave(creds: Partial<EngineCredentials>): Promise<{ ok: boolean }>;
  credsStatus(): Promise<CredsStatus>;
  discordInviteUrl(): Promise<string | null>;
  validateDiscord(token: string, clientId: string): Promise<DiscordValidation>;
  validateSpotify(clientId: string, clientSecret: string): Promise<SpotifyValidation>;
  commandsRegister(): Promise<CommandRegisterResult>;
  tunnelStart(): Promise<TunnelStatus>;
  tunnelStop(): Promise<TunnelStatus>;
  tunnelStatus(): Promise<TunnelStatus>;
  windowMinimize(): Promise<void>;
  windowMaximize(): Promise<void>;
  windowClose(): Promise<void>;
  modelEnsure(): Promise<{ present: boolean }>;
  diagnosticsExport(): Promise<{ path: string }>;
  diagnosticsOpen(path: string): Promise<{ ok: boolean; error?: string }>;
  updaterGetStatus(): Promise<UpdateStatus>;
  updaterCheck(): Promise<UpdateStatus>;
  updaterInstall(): Promise<void>;
  onEngineState(cb: (snapshot: EngineSnapshot) => void): () => void;
  onEngineLog(cb: (lines: LogLine[]) => void): () => void;
  onPrereqs(cb: (report: PrereqReport) => void): () => void;
  onModelProgress(cb: (progress: ModelDownloadProgress) => void): () => void;
  onUpdaterStatus(cb: (status: UpdateStatus) => void): () => void;
}

/** ipcRenderer.invoke channel names (request/response). */
export const IPC = {
  engineStart: 'engine:start',
  engineStop: 'engine:stop',
  engineRestart: 'engine:restart',
  engineGetSnapshot: 'engine:getSnapshot',
  prereqsScan: 'prereqs:scan',
  vbcableInstall: 'vbcable:install',
  credsSave: 'creds:save',
  credsStatus: 'creds:status',
  discordInviteUrl: 'discord:inviteUrl',
  validateDiscord: 'validate:discord',
  validateSpotify: 'validate:spotify',
  commandsRegister: 'commands:register',
  tunnelStart: 'tunnel:start',
  tunnelStop: 'tunnel:stop',
  tunnelStatus: 'tunnel:status',
  windowMinimize: 'window:minimize',
  windowMaximize: 'window:maximize',
  windowClose: 'window:close',
  modelEnsure: 'model:ensure',
  diagnosticsExport: 'diagnostics:export',
  diagnosticsOpen: 'diagnostics:open',
  updaterGetStatus: 'updater:getStatus',
  updaterCheck: 'updater:check',
  updaterInstall: 'updater:install',
} as const;

/** main -> renderer push channels (events). */
export const IPC_EVENT = {
  engineState: 'event:engineState',
  engineLog: 'event:engineLog',
  prereqs: 'event:prereqs',
  modelProgress: 'event:modelProgress',
  updaterStatus: 'event:updaterStatus',
} as const;

export const EMPTY_PREREQS: PrereqReport = {
  ffmpeg: { status: 'unknown', confidence: 'unknown' },
  vbcable: { status: 'unknown', confidence: 'unknown' },
  spotify: { status: 'unknown', confidence: 'unknown' },
  port: { status: 'unknown', confidence: 'unknown' },
};
