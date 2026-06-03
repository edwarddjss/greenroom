import test from 'node:test';
import assert from 'node:assert/strict';
import { spotify } from '../src/spotify.js';

test('queueTrack expands Spotify playlist links into queued tracks', async () => {
  const originalRequest = spotify.request;
  const originalFindTargetDevice = spotify.findTargetDevice;
  const calls: { endpoint: string; method?: string }[] = [];

  spotify.findTargetDevice = async () => ({ id: 'device-1', name: 'Desktop', type: 'Computer', is_active: true });
  spotify.request = async (_discordUserId, endpoint, method) => {
    calls.push({ endpoint, method });
    if (endpoint === '/playlists/playlist123?fields=name') return { name: 'Road Trip' };
    if (endpoint.startsWith('/playlists/playlist123/tracks')) {
      return {
        items: [
          { track: { uri: 'spotify:track:one', name: 'One', artists: [{ name: 'Artist' }] } },
          { track: { uri: 'spotify:track:two', name: 'Two', artists: [{ name: 'Artist' }] } },
        ],
        next: null,
      };
    }
    return null;
  };

  try {
    const result = await spotify.queueTrack('user-1', 'https://open.spotify.com/playlist/playlist123?si=abc');

    assert.equal(result.success, true);
    assert.equal(result.matchName, 'Road Trip');
    assert.equal(result.matchType, 'playlist');
    assert.equal(result.queuedCount, 2);
    assert.equal(calls.at(-2)?.endpoint, '/me/player/queue?uri=spotify%3Atrack%3Aone&device_id=device-1');
    assert.equal(calls.at(-1)?.endpoint, '/me/player/queue?uri=spotify%3Atrack%3Atwo&device_id=device-1');
  } finally {
    spotify.request = originalRequest;
    spotify.findTargetDevice = originalFindTargetDevice;
  }
});

test('clearQueue replaces playback with the current track', async () => {
  const originalRequest = spotify.request;
  const originalFindTargetDevice = spotify.findTargetDevice;
  const calls: { endpoint: string; method?: string; body?: unknown }[] = [];

  spotify.findTargetDevice = async () => ({ id: 'device-2', name: 'Laptop', type: 'Computer', is_active: true });
  spotify.request = async (_discordUserId, endpoint, method, body) => {
    calls.push({ endpoint, method, body });
    if (endpoint === '/me/player') {
      return {
        is_playing: true,
        progress_ms: 42000,
        item: {
          uri: 'spotify:track:current',
          name: 'Current',
          artists: [{ name: 'Artist' }],
          album: { name: 'Album' },
          external_urls: { spotify: 'https://open.spotify.com/track/current' },
        },
      };
    }
    return null;
  };

  try {
    const result = await spotify.clearQueue('user-2');

    assert.equal(result.success, true);
    assert.equal(calls[1].endpoint, '/me/player/play?device_id=device-2');
    assert.equal(calls[1].method, 'PUT');
    assert.deepEqual(calls[1].body, { uris: ['spotify:track:current'], position_ms: 42000 });
  } finally {
    spotify.request = originalRequest;
    spotify.findTargetDevice = originalFindTargetDevice;
  }
});
