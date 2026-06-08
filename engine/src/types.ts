import { z } from 'zod';

/** A linked Spotify account, keyed by Discord user id in the profile store. */
export interface SpotifyProfile {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number;
  /** Per-user capture device override; null means use the global default. */
  audioDevice: string | null;
}

export type ProfileStore = Record<string, SpotifyProfile>;

/** Live DSP state applied to the FFmpeg capture chain. */
export interface AudioEffects {
  bassboost: boolean;
  /** atempo multiplier; 1.0 = normal, 1.25 = sped up, 0.8 = slowed. */
  speed: number;
}

/** A resolved friend alias -> Spotify account, learned conversationally. */
export interface AliasEntry {
  spotifyUserId: string;
  spotifyDisplayName: string;
}

export interface PendingLearn {
  aliasName: string;
  targetQuery: string;
  timestamp: number;
}

export interface MemoryState {
  aliases: Record<string, AliasEntry>;
  pending: Record<string, PendingLearn>;
}

/** Minimal shape of a Spotify Connect device we care about. */
export interface SpotifyDevice {
  id: string | null;
  name: string;
  type: string;
  is_active: boolean;
}

export interface PlaybackTrack {
  name: string;
  artists: string;
  album: string;
  url: string;
  albumArtUrl?: string;
  durationMs?: number;
}

export interface PlaybackState {
  isPlaying: boolean;
  track: PlaybackTrack | null;
  progressMs?: number;
  device?: { name: string; type: string; volume: number; id: string | null } | null;
  error?: string;
}

export interface PlayResult {
  success: boolean;
  matchName?: string;
  matchType?: string;
  deviceName?: string;
  message?: string;
  queuedCount?: number;
  skippedCount?: number;
}

/** Intents the NLU router can produce. */
export const IntentName = z.enum([
  'PLAY',
  'STOP',
  'EFFECT_BASS',
  'EFFECT_SPEEDUP',
  'EFFECT_SLOWED',
  'EFFECT_CLEAR',
  'QUEUE',
  'CLEAR_QUEUE',
  'STATUS',
  'LOGIN',
  'FRIEND_PLAY',
  'GREET',
]);
export type IntentName = z.infer<typeof IntentName>;

/** Validated shape of a parsed intent (from Gemini or the rule-based fallback). */
export const ParsedIntent = z.object({
  intent: IntentName,
  query: z.string().optional(),
  friend: z.string().optional(),
  target: z.string().optional(),
  response: z.string().optional(),
});
export type ParsedIntent = z.infer<typeof ParsedIntent>;

/** Gemini's generateContent response, narrowed to the parts we read. */
export const GeminiResponse = z.object({
  candidates: z
    .array(
      z.object({
        content: z.object({
          parts: z.array(z.object({ text: z.string().optional() })).optional(),
        }).optional(),
      }),
    )
    .optional(),
});
export type GeminiResponse = z.infer<typeof GeminiResponse>;
