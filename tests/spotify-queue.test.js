import test from 'node:test';
import assert from 'node:assert/strict';

import { spotify } from '../spotify.js';

test('queueTrack queues a searched track onto the active device', async () => {
  const originalRequest = spotify.request;
  const originalFindTargetDevice = spotify.findTargetDevice;

  const calls = [];
  spotify.findTargetDevice = async () => ({ id: 'device-1', name: 'Desktop' });
  spotify.request = async (discordUserId, endpoint, method, body) => {
    calls.push({ discordUserId, endpoint, method, body });

    if (endpoint.startsWith('/search')) {
      return {
        tracks: {
          items: [
            {
              uri: 'spotify:track:abc123',
              name: 'Test Song',
              artists: [{ name: 'Artist' }],
            },
          ],
        },
      };
    }

    return null;
  };

  try {
    const result = await spotify.queueTrack('user-1', 'please queue uk garage');

    assert.equal(result.success, true);
    assert.equal(result.matchName, 'Test Song by Artist');
    assert.equal(result.matchType, 'track');
    assert.equal(result.deviceName, 'Desktop');
    assert.equal(calls[0].endpoint.startsWith('/search?q=uk%20garage&type=track&limit=1'), true);
    assert.equal(calls[1].endpoint, '/me/player/queue?uri=spotify%3Atrack%3Aabc123&device_id=device-1');
    assert.equal(calls[1].method, 'POST');
  } finally {
    spotify.request = originalRequest;
    spotify.findTargetDevice = originalFindTargetDevice;
  }
});

test('queueTrack accepts direct Spotify track links', async () => {
  const originalRequest = spotify.request;
  const originalFindTargetDevice = spotify.findTargetDevice;

  const calls = [];
  spotify.findTargetDevice = async () => ({ id: 'device-2', name: 'Laptop' });
  spotify.request = async (discordUserId, endpoint, method, body) => {
    calls.push({ discordUserId, endpoint, method, body });
    return null;
  };

  try {
    const result = await spotify.queueTrack('user-2', 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC?si=abc123');

    assert.equal(result.success, true);
    assert.equal(result.matchName, 'Spotify Link (track)');
    assert.equal(calls[0].endpoint, '/me/player/queue?uri=spotify%3Atrack%3A4uLU6hMCjMI75M1A2tKUQC&device_id=device-2');
    assert.equal(calls.length, 1);
  } finally {
    spotify.request = originalRequest;
    spotify.findTargetDevice = originalFindTargetDevice;
  }
});
