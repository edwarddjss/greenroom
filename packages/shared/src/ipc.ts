import type { EngineCredentials } from './env.js';

/** Supervisor lifecycle states (mirrors the engine state machine in the spec). */
export type EngineState = 'idle' | 'preflight' | 'starting' | 'running' | 'degraded' | 'stopping' | 'crashed';

/** Structured health events emitted by the engine over stdout. */
export type HealthEventName =
  | 'auth_server_listening'
  | 'discord_ready'
  | 'ffmpeg_ready'
  | 'voice_ready'
  | 'spotify_profiles_loaded'
  | 'spotify_auth_saved'
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
}

/** The full preload-exposed API surface. No secret values are ever returned. */
export interface GreenroomIpcApi {
  engineStart(): Promise<EngineSnapshot>;
  engineStop(): Promise<EngineSnapshot>;
  engineRestart(): Promise<EngineSnapshot>;
  engineGetSnapshot(): Promise<EngineSnapshot>;
  prereqsScan(): Promise<PrereqReport>;
  vbcableInstall(): Promise<{ launched: boolean }>;
  credsSave(creds: Partial<EngineCredentials>): Promise<{ ok: boolean }>;
  credsStatus(): Promise<CredsStatus>;
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
  onEngineState(cb: (snapshot: EngineSnapshot) => void): () => void;
  onEngineLog(cb: (lines: LogLine[]) => void): () => void;
  onPrereqs(cb: (report: PrereqReport) => void): () => void;
  onModelProgress(cb: (progress: ModelDownloadProgress) => void): () => void;
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
} as const;

/** main -> renderer push channels (events). */
export const IPC_EVENT = {
  engineState: 'event:engineState',
  engineLog: 'event:engineLog',
  prereqs: 'event:prereqs',
  modelProgress: 'event:modelProgress',
} as const;

export const EMPTY_PREREQS: PrereqReport = {
  ffmpeg: { status: 'unknown', confidence: 'unknown' },
  vbcable: { status: 'unknown', confidence: 'unknown' },
  spotify: { status: 'unknown', confidence: 'unknown' },
  port: { status: 'unknown', confidence: 'unknown' },
};
