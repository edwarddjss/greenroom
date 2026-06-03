import { spawn } from 'node:child_process';
import net from 'node:net';
import { EMPTY_PREREQS, type PrereqReport, type PrereqState } from '@greenroom/shared';
import { ffmpegPath } from './paths';

const VBCABLE_DEVICE = 'CABLE Output (VB-Audio Virtual Cable)';
const PORT = 8888;

interface RunResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

function run(cmd: string, args: string[], timeoutMs = 8000): Promise<RunResult> {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    const child = spawn(cmd, args, { windowsHide: true });
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        child.kill();
        resolve({ code: null, stdout, stderr });
      }
    }, timeoutMs);
    child.stdout?.on('data', (d: Buffer) => (stdout += d.toString()));
    child.stderr?.on('data', (d: Buffer) => (stderr += d.toString()));
    child.on('error', () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve({ code: -1, stdout, stderr });
      }
    });
    child.on('close', (code) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve({ code, stdout, stderr });
      }
    });
  });
}

async function checkFfmpeg(): Promise<PrereqState> {
  const res = await run(ffmpegPath(), ['-hide_banner', '-version']);
  if (res.code === 0 && /ffmpeg version/i.test(res.stdout)) {
    const version = res.stdout.split('\n')[0]?.trim();
    return { status: 'ok', confidence: 'verified', detail: version ?? 'FFmpeg detected' };
  }
  return { status: 'missing', confidence: 'verified', detail: 'FFmpeg not found on PATH.' };
}

async function checkVbCable(): Promise<PrereqState> {
  if (process.platform !== 'win32') {
    return { status: 'unknown', confidence: 'not-verifiable', detail: 'VB-Cable detection only runs on Windows.' };
  }
  // FFmpeg lists DirectShow devices on stderr and exits non-zero; that's expected.
  const res = await run(ffmpegPath(), ['-hide_banner', '-list_devices', 'true', '-f', 'dshow', '-i', 'dummy']);
  const haystack = `${res.stderr}\n${res.stdout}`;
  if (haystack.includes(VBCABLE_DEVICE)) {
    return { status: 'ok', confidence: 'verified', detail: VBCABLE_DEVICE };
  }
  if (/CABLE Output/i.test(haystack)) {
    return { status: 'ok', confidence: 'verified', detail: 'VB-Cable variant detected (non-default name).' };
  }
  return { status: 'missing', confidence: 'verified', detail: 'VB-Audio Virtual Cable not detected.' };
}

async function checkSpotify(): Promise<PrereqState> {
  if (process.platform !== 'win32') {
    return { status: 'unknown', confidence: 'not-verifiable', detail: 'Spotify process check only runs on Windows.' };
  }
  const res = await run('tasklist', ['/FI', 'IMAGENAME eq Spotify.exe', '/NH']);
  if (/Spotify\.exe/i.test(res.stdout)) {
    return { status: 'ok', confidence: 'verified', detail: 'Spotify desktop app is running.' };
  }
  return { status: 'missing', confidence: 'user-confirmed', detail: 'Spotify desktop app not detected.' };
}

function checkPort(): Promise<PrereqState> {
  return new Promise((resolve) => {
    const tester = net
      .createServer()
      .once('error', (err: NodeJS.ErrnoException) => {
        resolve({ status: 'busy', confidence: 'verified', detail: `Port ${PORT} in use (${err.code ?? 'EADDRINUSE'}).` });
      })
      .once('listening', () => tester.close(() => resolve({ status: 'ok', confidence: 'verified', detail: `Port ${PORT} is free.` })))
      .listen(PORT, '127.0.0.1');
  });
}

export async function scanPrereqs(): Promise<PrereqReport> {
  const [ffmpeg, vbcable, spotify, port] = await Promise.all([checkFfmpeg(), checkVbCable(), checkSpotify(), checkPort()]);
  return { ...EMPTY_PREREQS, ffmpeg, vbcable, spotify, port };
}
