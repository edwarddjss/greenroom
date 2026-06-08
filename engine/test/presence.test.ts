import assert from 'node:assert/strict';
import test from 'node:test';
import { playbackActivityName } from '../src/presence.js';
import type { PlaybackState } from '../src/types.js';

test('playbackActivityName shows the current song and artist', () => {
  const state: PlaybackState = {
    isPlaying: true,
    track: { name: 'Hold Me Down', artists: 'borne', album: 'Hold Me Down', url: 'https://open.spotify.com/track/example' },
  };
  assert.equal(playbackActivityName(state), 'Hold Me Down - borne');
});

test('playbackActivityName clears when Spotify is paused', () => {
  const state: PlaybackState = {
    isPlaying: false,
    track: { name: 'Hold Me Down', artists: 'borne', album: 'Hold Me Down', url: 'https://open.spotify.com/track/example' },
  };
  assert.equal(playbackActivityName(state), null);
});

test('playbackActivityName stays within Discord activity limits', () => {
  const state: PlaybackState = {
    isPlaying: true,
    track: { name: 'A'.repeat(100), artists: 'B'.repeat(100), album: 'Album', url: 'https://open.spotify.com/track/example' },
  };
  assert.equal(playbackActivityName(state)?.length, 128);
});
