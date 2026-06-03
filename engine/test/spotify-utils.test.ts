import test from 'node:test';
import assert from 'node:assert/strict';
import { extractDirectPlayQuery, normalizeSpotifySearchQuery } from '../src/spotify-utils.js';

test('normalizeSpotifySearchQuery preserves title words like "me"', () => {
  assert.equal(normalizeSpotifySearchQuery('hold me down by borne'), 'hold me down by borne');
});

test('extractDirectPlayQuery preserves the exact direct song request', () => {
  assert.equal(extractDirectPlayQuery('play hold me down by borne'), 'hold me down by borne');
});
