import { app } from 'electron';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import fs from 'node:fs';

const require = createRequire(import.meta.url);

/** Writable data dir injected into the engine as GREENROOM_DATA_DIR. */
export function dataDir(): string {
  return app.getPath('userData');
}

/** Absolute path to the compiled engine entry the supervisor forks. */
export function engineEntry(): string {
  return require.resolve('@greenroom/engine');
}

export function modelPath(): string {
  return join(dataDir(), 'models', 'Qwen2.5-1.5B-Instruct-Q4_K_M.gguf');
}

/** Bundled FFmpeg in production (set via env at packaging); PATH in dev. */
export function ffmpegPath(): string {
  const override = process.env.GREENROOM_FFMPEG ?? process.env.SPOTICORD_FFMPEG ?? process.env.SONICORD_FFMPEG;
  if (override) return override;
  const bundled = join(process.resourcesPath, 'bin', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
  if (app.isPackaged && fs.existsSync(bundled)) return bundled;
  return 'ffmpeg';
}

/** Bundled VB-Cable installer path, shipped under resources in production. */
export function vbcableInstaller(): string | null {
  const override = process.env.GREENROOM_VBCABLE_INSTALLER ?? process.env.SPOTICORD_VBCABLE_INSTALLER ?? process.env.SONICORD_VBCABLE_INSTALLER;
  if (override) return override;
  const bundled = join(process.resourcesPath, 'drivers', 'VBCABLE_Setup_x64.exe');
  if (app.isPackaged && fs.existsSync(bundled)) return bundled;
  return null;
}
