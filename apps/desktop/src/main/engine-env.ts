import { toEngineEnv, type EngineCredentials } from '@greenroom/shared';
import { dataDir, ffmpegPath, modelPath } from './paths';
import { getStoreKey } from './vault';

/**
 * Build the env for a forked engine/register child. We MUST inherit the parent
 * env (PATH, and on Windows SystemRoot/SystemDrive — without them getaddrinfo
 * fails with EAI_FAIL) and then layer our injected credentials/config on top.
 * ELECTRON_RUN_AS_NODE is stripped so the child behaves as plain Node.
 */
export function buildEngineEnv(creds: EngineCredentials): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) env[key] = value;
  }
  Object.assign(
    env,
    toEngineEnv(creds, {
      dataDir: dataDir(),
      ffmpegPath: ffmpegPath(),
      storeKey: getStoreKey(),
      nluModelPath: modelPath(),
    }),
  );
  delete env.ELECTRON_RUN_AS_NODE;
  return env;
}
