/**
 * Structured health events. The Electron supervisor parses these line-delimited
 * JSON markers from the engine's stdout to drive its lifecycle state machine,
 * instead of grepping human-readable log strings (which carry ANSI + emoji).
 */
export const HEALTH_MARKER = '@@GREENROOM_HEALTH@@';

export type HealthEvent =
  | 'auth_server_listening'
  | 'discord_ready'
  | 'ffmpeg_ready'
  | 'voice_ready'
  | 'spotify_profiles_loaded'
  | 'spotify_auth_saved'
  | 'engine_error';

export interface HealthPayload {
  event: HealthEvent;
  ts: string;
  data?: Record<string, unknown>;
}

export function emitHealth(event: HealthEvent, data?: Record<string, unknown>): void {
  const payload: HealthPayload = { event, ts: new Date().toISOString() };
  if (data !== undefined) payload.data = data;
  // One JSON object per line, prefixed with the marker for deterministic parsing.
  process.stdout.write(`${HEALTH_MARKER} ${JSON.stringify(payload)}\n`);
}
