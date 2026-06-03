import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import fs from 'node:fs';
import { dirname, join } from 'node:path';
import type { TunnelStatus } from '@greenroom/shared';
import { dataDir } from './paths';
import { clearCredFields, loadCreds, saveCreds } from './vault';

const TUNNEL_RE = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i;
const TARGET = 'http://127.0.0.1:8888';

function isQuickTunnelUrl(url: string | undefined): boolean {
  return Boolean(url && TUNNEL_RE.test(url));
}

function cloudflaredUrl(): string {
  if (process.platform === 'win32') {
    return process.arch === 'arm64'
      ? 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-arm64.exe'
      : 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe';
  }
  if (process.platform === 'darwin') {
    return process.arch === 'arm64'
      ? 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-arm64.tgz'
      : 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-amd64.tgz';
  }
  return process.arch === 'arm64'
    ? 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64'
    : 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64';
}

function cloudflaredPath(): string {
  const name = process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared';
  return join(dataDir(), 'bin', name);
}

async function ensureCloudflared(): Promise<string> {
  const bin = cloudflaredPath();
  if (fs.existsSync(bin)) return bin;
  if (process.platform === 'darwin') {
    throw new Error('Automatic cloudflared install is not implemented for macOS archives yet.');
  }

  fs.mkdirSync(dirname(bin), { recursive: true });
  const res = await fetch(cloudflaredUrl());
  if (!res.ok || !res.body) throw new Error(`Could not download cloudflared: HTTP ${res.status}`);
  const tmp = `${bin}.part`;
  fs.rmSync(tmp, { force: true });
  const out = fs.createWriteStream(tmp);
  const reader = res.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!out.write(Buffer.from(value))) {
        await new Promise<void>((resolve, reject) => {
          out.once('drain', resolve);
          out.once('error', reject);
        });
      }
    }
    await new Promise<void>((resolve, reject) => out.end((err?: Error | null) => (err ? reject(err) : resolve())));
    fs.renameSync(tmp, bin);
    if (process.platform !== 'win32') fs.chmodSync(bin, 0o755);
    return bin;
  } catch (err) {
    out.destroy();
    fs.rmSync(tmp, { force: true });
    throw err;
  }
}

class TunnelManager {
  private child: ChildProcessWithoutNullStreams | null = null;
  private status: TunnelStatus = { running: false };
  private pending: Promise<TunnelStatus> | null = null;

  getStatus(): TunnelStatus {
    const saved = loadCreds().publicAuthBaseUrl?.replace(/\/+$/, '');
    if (this.status.running) return { ...this.status };
    if (isQuickTunnelUrl(saved)) return { running: false, error: 'The previous temporary tunnel is no longer running. Start a new tunnel and update Spotify with the new redirect URI.' };
    return saved ? { running: false, url: saved, callbackUrl: `${saved}/callback` } : { ...this.status };
  }

  async start(): Promise<TunnelStatus> {
    if (this.status.running && this.status.url) return { ...this.status };
    if (this.pending) return this.pending;
    this.pending = this.startInternal().finally(() => {
      this.pending = null;
    });
    return this.pending;
  }

  stop(): TunnelStatus {
    if (this.child) {
      this.child.kill();
      this.child = null;
    }
    const saved = loadCreds().publicAuthBaseUrl?.replace(/\/+$/, '');
    if (isQuickTunnelUrl(saved)) {
      clearCredFields(['publicAuthBaseUrl']);
      this.status = { running: false };
      return { ...this.status };
    }
    this.status = saved ? { running: false, url: saved, callbackUrl: `${saved}/callback` } : { running: false };
    return { ...this.status };
  }

  discardSavedQuickTunnel(): void {
    const saved = loadCreds().publicAuthBaseUrl?.replace(/\/+$/, '');
    if (isQuickTunnelUrl(saved)) {
      clearCredFields(['publicAuthBaseUrl']);
    }
    if (!this.status.running) this.status = { running: false };
  }

  private async startInternal(): Promise<TunnelStatus> {
    const bin = await ensureCloudflared();
    return await new Promise<TunnelStatus>((resolve) => {
      let resolved = false;
      let logs = '';
      const child = spawn(bin, ['tunnel', '--url', TARGET, '--no-autoupdate'], { windowsHide: true });
      this.child = child;
      this.status = { running: true };

      const finish = (next: TunnelStatus): void => {
        this.status = next;
        if (!resolved) {
          resolved = true;
          resolve({ ...next });
        }
      };

      const ingest = (chunk: Buffer): void => {
        const text = chunk.toString('utf8');
        logs += text;
        const match = text.match(TUNNEL_RE) ?? logs.match(TUNNEL_RE);
        if (!match?.[0]) return;
        const url = match[0].replace(/\/+$/, '');
        saveCreds({ publicAuthBaseUrl: url });
        finish({ running: true, url, callbackUrl: `${url}/callback` });
      };

      child.stdout.on('data', ingest);
      child.stderr.on('data', ingest);
      child.on('exit', (code) => {
        this.child = null;
        const error = code === 0 ? undefined : `cloudflared exited with code ${code ?? 'unknown'}.`;
        const saved = loadCreds().publicAuthBaseUrl?.replace(/\/+$/, '');
        if (isQuickTunnelUrl(saved)) clearCredFields(['publicAuthBaseUrl']);
        const durable = saved && !isQuickTunnelUrl(saved) ? saved : undefined;
        const next: TunnelStatus = durable ? { running: false, url: durable, callbackUrl: `${durable}/callback` } : { running: false };
        if (error) next.error = error;
        finish(next);
      });

      setTimeout(() => {
        if (!resolved) {
          finish({ running: true, error: 'Tunnel is starting, but no public URL was printed yet.' });
        }
      }, 15_000);
    });
  }
}

export const tunnelManager = new TunnelManager();
