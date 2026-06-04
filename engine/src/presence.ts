import type { PlaybackState } from './types.js';

const MAX_ACTIVITY_LENGTH = 128;

export function playbackActivityName(state: PlaybackState): string | null {
  if (!state.isPlaying || !state.track) return null;
  const name = `${state.track.name} — ${state.track.artists}`;
  return name.length <= MAX_ACTIVITY_LENGTH ? name : `${name.slice(0, MAX_ACTIVITY_LENGTH - 1).trimEnd()}…`;
}
