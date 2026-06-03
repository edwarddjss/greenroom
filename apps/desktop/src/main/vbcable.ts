import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { dirname, join } from 'node:path';
import type { VbCableInstallResult } from '@greenroom/shared';
import { dataDir, vbcableInstaller } from './paths';

const DOWNLOAD_URL = 'https://download.vb-audio.com/Download_CABLE/VBCABLE_Driver_Pack45.zip';

function runPowerShell(script: string, timeoutMs = 120_000): Promise<{ code: number | null; stderr: string }> {
  return new Promise((resolve) => {
    let stderr = '';
    let settled = false;
    const child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], {
      windowsHide: true,
    });
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      resolve({ code: null, stderr: 'The installer timed out.' });
    }, timeoutMs);
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code: -1, stderr: err.message });
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code, stderr });
    });
  });
}

function psQuote(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

async function download(url: string, dest: string): Promise<void> {
  if (fs.existsSync(dest) && fs.statSync(dest).size > 100_000) return;
  fs.mkdirSync(dirname(dest), { recursive: true });
  const tmp = `${dest}.part`;
  fs.rmSync(tmp, { force: true });
  const response = await fetch(url);
  if (!response.ok || !response.body) throw new Error(`VB-Cable download failed: HTTP ${response.status}`);
  const out = fs.createWriteStream(tmp);
  const reader = response.body.getReader();
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
    fs.renameSync(tmp, dest);
  } catch (err) {
    out.destroy();
    fs.rmSync(tmp, { force: true });
    throw err;
  }
}

function findInstaller(root: string): string | null {
  if (!fs.existsSync(root)) return null;
  const preferred = process.arch === 'arm64' ? /VBCABLE_Setup.*arm64.*\.exe$/i : /VBCABLE_Setup_x64\.exe$/i;
  const fallback = /VBCABLE_Setup.*\.exe$/i;
  const matches: string[] = [];
  const visit = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (fallback.test(entry.name)) matches.push(path);
    }
  };
  visit(root);
  return matches.find((path) => preferred.test(path)) ?? matches[0] ?? null;
}

export async function installVbCable(): Promise<VbCableInstallResult> {
  if (process.platform !== 'win32') {
    return { ok: false, launched: false, rebootRequired: false, message: 'VB-Cable installation is only supported on Windows.' };
  }

  try {
    let installer = vbcableInstaller();
    if (!installer || !fs.existsSync(installer)) {
      const root = join(dataDir(), 'installers', 'vbcable');
      const zip = join(root, 'VBCABLE_Driver_Pack45.zip');
      const extracted = join(root, 'driver');
      await download(DOWNLOAD_URL, zip);
      fs.rmSync(extracted, { recursive: true, force: true });
      fs.mkdirSync(extracted, { recursive: true });
      const extract = await runPowerShell(
        `Expand-Archive -LiteralPath ${psQuote(zip)} -DestinationPath ${psQuote(extracted)} -Force`,
        60_000,
      );
      if (extract.code !== 0) throw new Error(extract.stderr.trim() || 'Could not extract the VB-Cable installer.');
      installer = findInstaller(extracted);
    }

    if (!installer) throw new Error('The VB-Cable installer was not found after downloading it.');
    const signature = await runPowerShell(
      `$signature = Get-AuthenticodeSignature -LiteralPath ${psQuote(installer)}; if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'BUREL VINCENT') { exit 2 }`,
      30_000,
    );
    if (signature.code !== 0) throw new Error('The downloaded VB-Cable installer signature could not be verified.');
    const launched = await runPowerShell(
      `$process = Start-Process -FilePath ${psQuote(installer)} -Verb RunAs -Wait -PassThru; if ($process.ExitCode -eq 0 -or $process.ExitCode -eq 3010) { exit 0 } else { exit $process.ExitCode }`,
      10 * 60_000,
    );
    if (launched.code !== 0) {
      throw new Error(launched.stderr.trim() || 'The VB-Cable installer was cancelled or did not finish successfully.');
    }
    return {
      ok: true,
      launched: true,
      rebootRequired: true,
      message: 'VB-Cable installer finished. Restart Windows, then reopen greenroom to continue.',
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : 'VB-Cable installation failed.';
    return { ok: false, launched: false, rebootRequired: false, message: error, error };
  }
}
