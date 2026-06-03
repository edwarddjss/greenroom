import fs from 'node:fs';
import { dirname } from 'node:path';
import type { ModelDownloadProgress } from '@greenroom/shared';
import { modelPath } from './paths';

const MODEL_URL =
  process.env.GREENROOM_NLU_MODEL_URL ??
  process.env.SPOTICORD_NLU_MODEL_URL ??
  process.env.SONICORD_NLU_MODEL_URL ??
  'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf';

export function isModelPresent(): boolean {
  return fs.existsSync(modelPath());
}

let inFlight: Promise<{ present: boolean }> | null = null;

/** Download the embedded NLU model with progress, if not already present. */
export async function ensureModel(onProgress: (p: ModelDownloadProgress) => void): Promise<{ present: boolean }> {
  if (inFlight) return inFlight;
  inFlight = downloadModel(onProgress).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function downloadModel(onProgress: (p: ModelDownloadProgress) => void): Promise<{ present: boolean }> {
  const dest = modelPath();
  if (fs.existsSync(dest)) {
    const size = fs.statSync(dest).size;
    onProgress({ receivedBytes: size, totalBytes: size });
    return { present: true };
  }

  fs.mkdirSync(dirname(dest), { recursive: true });
  const tmp = `${dest}.part`;
  fs.rmSync(tmp, { force: true });

  const res = await fetch(MODEL_URL);
  if (!res.ok || !res.body) throw new Error(`Model download failed: HTTP ${res.status}`);
  const totalBytes =
    Number(res.headers.get('content-length') ?? '') || Number(res.headers.get('x-linked-size') ?? '') || null;

  const fileStream = fs.createWriteStream(tmp);
  const reader = res.body.getReader();
  let receivedBytes = 0;
  onProgress({ receivedBytes, totalBytes });

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      receivedBytes += value.length;
      if (!fileStream.write(Buffer.from(value))) {
        await new Promise<void>((resolve, reject) => {
          fileStream.once('drain', resolve);
          fileStream.once('error', reject);
        });
      }
      onProgress({ receivedBytes, totalBytes });
    }
    if (receivedBytes === 0) throw new Error('Model download failed: received an empty file.');
    await new Promise<void>((resolve, reject) => {
      fileStream.end((err?: Error | null) => (err ? reject(err) : resolve()));
    });
    fs.renameSync(tmp, dest);
  } catch (err) {
    fileStream.destroy();
    fs.rmSync(tmp, { force: true });
    throw err;
  }
  return { present: true };
}
