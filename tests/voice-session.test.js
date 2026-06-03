import test from 'node:test';
import assert from 'node:assert/strict';

import { createVoiceSessionManager } from '../voice-session.js';

const makeManager = () => {
  const audioEngine = {
    start: () => ({ resource: { id: 'resource' }, readyPromise: Promise.resolve() }),
    stop: () => {},
    isActive: () => true,
  };

  const spotify = {
    getUserAudioDevice: () => null,
  };

  const config = {
    audioDevice: 'default-device',
  };

  return createVoiceSessionManager({ audioEngine, spotify, config });
};

test('voice session updates and clears effects through the normalized aliases', () => {
  const manager = makeManager();

  manager.updateEffects('bass');
  assert.equal(manager.activeEffects.bassboost, true);

  manager.updateEffects('speedup');
  assert.equal(manager.activeEffects.speed, 1.25);

  manager.updateEffects('clear');
  assert.deepEqual(manager.activeEffects, { bassboost: false, speed: 1.0 });
  assert.equal(manager.getEffectStatus(), 'Bass Boost: **OFF** | Speed: **Normal**');
});

test('voice session restarts capture if the voice connection is healthy but audio has stopped', async () => {
  const manager = makeManager();
  let startCaptureCalls = 0;

  manager.audioEngine.isActive = () => false;
  manager.startCapture = async () => {
    startCaptureCalls += 1;
    return { readyPromise: Promise.resolve() };
  };
  manager.voiceConnection = { state: { status: 'ready' } };
  manager.currentChannelId = 'channel-1';

  const member = { voice: { channel: { id: 'channel-1', name: 'Lounge' } } };
  const guild = { id: 'guild-1' };

  const result = await manager.ensureVoiceConnection(member, guild, 'user-1');

  assert.equal(result.name, 'Lounge');
  assert.equal(startCaptureCalls, 1);
});
