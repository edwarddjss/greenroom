import test from 'node:test';
import assert from 'node:assert/strict';

import {
  extractSpotifyReference,
  normalizeSpotifySearchQuery,
} from '../spotify-utils.js';

test('normalizeSpotifySearchQuery removes conversational filler and collapses whitespace', () => {
  const result = normalizeSpotifySearchQuery('  play some type shit uk garage please  ');
  assert.equal(result, 'uk garage');
});

test('extractSpotifyReference resolves Spotify track URLs', () => {
  const result = extractSpotifyReference('https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC?si=abc123');

  assert.deepEqual(result, {
    type: 'track',
    id: '4uLU6hMCjMI75M1A2tKUQC',
    uri: 'spotify:track:4uLU6hMCjMI75M1A2tKUQC',
  });
});

test('extractSpotifyReference resolves Spotify URIs', () => {
  const result = extractSpotifyReference('spotify:track:4uLU6hMCjMI75M1A2tKUQC');

  assert.deepEqual(result, {
    type: 'track',
    id: '4uLU6hMCjMI75M1A2tKUQC',
    uri: 'spotify:track:4uLU6hMCjMI75M1A2tKUQC',
  });
});
