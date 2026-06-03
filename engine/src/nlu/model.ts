import fs from 'node:fs';
import path from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import fetch from 'node-fetch';
import { config } from '../config.js';

export interface ModelDownloadProgress {
  receivedBytes: number;
  totalBytes: number | null;
}

export function isModelPresent(): boolean {
  return fs.existsSync(config.nluModelPath);
}

/**
 * Download the embedded NLU model to the data dir if absent. The Electron
 * onboarding flow calls this with a progress callback; the engine itself only
 * loads the model when it is already present.
 */
export async function downloadModel(onProgress?: (p: ModelDownloadProgress) => void): Promise<void> {
  if (isModelPresent()) return;
  fs.mkdirSync(path.dirname(config.nluModelPath), { recursive: true });
  const tmpPath = `${config.nluModelPath}.part`;

  const res = await fetch(config.nluModelUrl);
  if (!res.ok || !res.body) throw new Error(`Model download failed: HTTP ${res.status}`);
  const totalBytes = Number(res.headers.get('content-length') ?? '') || null;

  let receivedBytes = 0;
  const counter = new Transform({
    transform(chunk: Buffer, _enc, callback) {
      receivedBytes += chunk.length;
      onProgress?.({ receivedBytes, totalBytes });
      callback(null, chunk);
    },
  });

  await pipeline(res.body as NodeJS.ReadableStream, counter, fs.createWriteStream(tmpPath));
  fs.renameSync(tmpPath, config.nluModelPath);
}
