import { restoreSpotifyOutput, routeSpotifyToCapture } from '@greenroom/engine/windows-audio-router';
import { dataDir } from './paths';
import { loadAudioSettings } from './vault';

const DEFAULT_CAPTURE_DEVICE = 'CABLE Output (VB-Audio Virtual Cable)';

export async function routeSpotifyOutputFromDesktop(): Promise<void> {
  const audio = loadAudioSettings();
  const result = await routeSpotifyToCapture(audio.captureDevice || DEFAULT_CAPTURE_DEVICE, {
    dataDir: dataDir(),
    ...(audio.routeDevice ? { routeDeviceName: audio.routeDevice } : {}),
  });
  if (result.ok) {
    if (!result.skipped) console.log(`[AudioRouting] ${result.message}`);
  } else {
    console.warn(`[AudioRouting] Could not route Spotify audio from desktop: ${result.message}`);
  }
}

export async function restoreSpotifyOutputFromDesktop(): Promise<void> {
  const audio = loadAudioSettings();
  const result = await restoreSpotifyOutput(audio.captureDevice || DEFAULT_CAPTURE_DEVICE, {
    dataDir: dataDir(),
    ...(audio.restoreDevice ? { restoreDeviceName: audio.restoreDevice } : {}),
  });
  if (result.ok) {
    if (!result.skipped) console.log(`[AudioRouting] ${result.message}`);
  } else {
    console.warn(`[AudioRouting] Could not restore Spotify audio from desktop: ${result.message}`);
  }
}
