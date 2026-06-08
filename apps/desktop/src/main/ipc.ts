import { app, clipboard, ipcMain, shell, utilityProcess, type BrowserWindow } from 'electron';
import fs from 'node:fs';
import { join, dirname } from 'node:path';
import {
  IPC,
  IPC_EVENT,
  EngineCredentials,
  botInviteUrl,
  type CommandRegisterResult,
  type EngineCredentials as Creds,
  type AudioDeviceSettings,
} from '@greenroom/shared';
import { Supervisor } from './supervisor';
import { scanPrereqs } from './prereqs';
import { validateDiscord, validateSpotify } from './validators';
import { loadCreds, saveCreds, credsStatus, saveAudioSettings } from './vault';
import { ensureModel, isModelPresent } from './model';
import { dataDir, engineEntry } from './paths';
import { buildEngineEnv } from './engine-env';
import { tunnelManager } from './tunnel';
import { installVbCable } from './vbcable';
import { updaterManager } from './updater';
import { getAudioDeviceReport } from './audio-devices';

type WinGetter = () => BrowserWindow | null;
const COMMAND_REGISTRATION_TIMEOUT_MS = 30_000;
const SUPPORT_EMAIL = 'edwardlongboat@gmail.com';

function commandRegistrationError(output: string, code: number | undefined): string {
  if (/\b401\b|unauthorized|invalid token/i.test(output)) {
    return 'Discord rejected the bot credentials. Go back and check the bot token and Application ID.';
  }
  if (/\b403\b|missing access|missing permissions/i.test(output)) {
    return 'Discord denied access. Check the bot permissions in the Discord Developer Portal, then try again.';
  }
  if (/eai_again|eai_fail|enotfound|econnreset|etimedout|network/i.test(output)) {
    return 'Greenroom could not reach Discord. Check your internet connection and try again.';
  }
  return `Discord could not register slash commands${code === undefined ? '' : ` (exit code ${code})`}. Try again.`;
}

export function createSupervisor(getWin: WinGetter): Supervisor {
  return new Supervisor({
    onState: (snapshot) => getWin()?.webContents.send(IPC_EVENT.engineState, snapshot),
    onLog: (lines) => getWin()?.webContents.send(IPC_EVENT.engineLog, lines),
  });
}

function registerCommands(): Promise<CommandRegisterResult> {
  const parsed = EngineCredentials.safeParse(loadCreds());
  if (!parsed.success) return Promise.resolve({ ok: false, scope: 'global', error: 'Credentials incomplete.' });
  const creds: Creds = parsed.data;
  const scope: 'guild' | 'global' = creds.discordGuildId ? 'guild' : 'global';
  const env = buildEngineEnv(creds);
  const registerPath = join(dirname(engineEntry()), 'register-commands.js');

  return new Promise((resolve) => {
    let settled = false;
    let output = '';
    let err = '';
    const child = utilityProcess.fork(registerPath, [], { stdio: 'pipe', env });
    const finish = (result: CommandRegisterResult): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(result);
    };
    const timeout = setTimeout(() => {
      child.kill();
      finish({
        ok: false,
        scope,
        error: 'Discord did not respond within 30 seconds. Check your connection and try again.',
      });
    }, COMMAND_REGISTRATION_TIMEOUT_MS);
    child.stdout?.on('data', (d: Buffer) => (output += d.toString()));
    child.stderr?.on('data', (d: Buffer) => (err += d.toString()));
    child.on('exit', (code) => {
      if (code === 0) finish({ ok: true, scope });
      else finish({ ok: false, scope, error: commandRegistrationError(`${err}\n${output}`, code) });
    });
  });
}

async function exportDiagnostics(): Promise<{ path: string }> {
  const report = await createDiagnosticsReport();
  const dir = join(dataDir(), 'diagnostics');
  fs.mkdirSync(dir, { recursive: true });
  const file = join(dir, `greenroom-diagnostics-${Date.now()}.json`);
  fs.writeFileSync(file, JSON.stringify(report, null, 2));
  return { path: file };
}

async function createDiagnosticsReport(): Promise<Record<string, unknown>> {
  const prereqs = await scanPrereqs();
  return {
    ts: new Date().toISOString(),
    platform: process.platform,
    arch: process.arch,
    versions: { app: app.getVersion(), electron: process.versions.electron, node: process.versions.node },
    modelPresent: isModelPresent(),
    prereqs,
    creds: credsStatus(),
    audio: (await getAudioDeviceReport()).settings,
  };
}

async function openSupportIssue(): Promise<{ ok: boolean; error?: string }> {
  const report = JSON.stringify(await createDiagnosticsReport(), null, 2);
  clipboard.writeText(report);
  const bodyWithReport = [
    'Hi, I need help with Greenroom.',
    '',
    'What happened:',
    '',
    '',
    'What I expected:',
    '',
    '',
    'App report:',
    report,
  ].join('\n');
  const bodyWithoutReport = [
    'Hi, I need help with Greenroom.',
    '',
    'What happened:',
    '',
    '',
    'What I expected:',
    '',
    '',
    'The app report was copied to my clipboard.',
  ].join('\n');
  const emailUrl = (body: string): string =>
    `mailto:${SUPPORT_EMAIL}?${new URLSearchParams({
      subject: 'Greenroom support request',
      body,
    }).toString()}`;
  const fullUrl = emailUrl(bodyWithReport);
  const url = fullUrl.length < 7000 ? fullUrl : emailUrl(bodyWithoutReport);
  await shell.openExternal(url);
  return { ok: true };
}

async function ensurePublicAuthTunnel(): Promise<void> {
  const parsed = EngineCredentials.safeParse(loadCreds());
  if (!parsed.success) return;

  const current = tunnelManager.getStatus();
  if (current.running && current.url) return;
  if (current.url && !current.error) return;

  const started = await tunnelManager.start();
  if (!started.url) {
    console.warn(`[Tunnel] Could not start public Spotify redirect tunnel: ${started.error ?? 'No public URL was returned.'}`);
  }
}

export function registerIpc(supervisor: Supervisor, getWin: WinGetter): void {
  ipcMain.handle(IPC.engineStart, async () => {
    await ensurePublicAuthTunnel();
    return supervisor.start();
  });
  ipcMain.handle(IPC.engineStop, () => supervisor.stop());
  ipcMain.handle(IPC.engineRestart, async () => {
    await ensurePublicAuthTunnel();
    return supervisor.restart();
  });
  ipcMain.handle(IPC.engineGetSnapshot, () => supervisor.snapshot());

  ipcMain.handle(IPC.prereqsScan, async () => {
    const report = await scanPrereqs();
    supervisor.setPrereqs(report);
    getWin()?.webContents.send(IPC_EVENT.prereqs, report);
    return report;
  });

  ipcMain.handle(IPC.vbcableInstall, async () => {
    const result = await installVbCable();
    const report = await scanPrereqs();
    supervisor.setPrereqs(report);
    getWin()?.webContents.send(IPC_EVENT.prereqs, report);
    return result;
  });
  ipcMain.handle(IPC.credsSave, (_e, creds: Partial<Creds>) => {
    saveCreds(creds);
    return { ok: true };
  });
  ipcMain.handle(IPC.credsStatus, () => credsStatus());
  ipcMain.handle(IPC.credsReveal, () => loadCreds());
  ipcMain.handle(IPC.discordInviteUrl, () => {
    const clientId = loadCreds().discordClientId;
    return clientId && /^\d{17,20}$/.test(clientId) ? botInviteUrl(clientId) : null;
  });
  ipcMain.handle(IPC.validateDiscord, (_e, token: string, clientId: string) => validateDiscord(token, clientId));
  ipcMain.handle(IPC.validateSpotify, (_e, clientId: string, secret: string) => validateSpotify(clientId, secret));
  ipcMain.handle(IPC.commandsRegister, () => registerCommands());
  ipcMain.handle(IPC.tunnelStart, async () => {
    const status = await tunnelManager.start();
    const engineState = supervisor.snapshot().state;
    if (status.url && ['starting', 'running', 'degraded', 'crashed'].includes(engineState)) {
      void supervisor.restart();
    }
    return status;
  });
  ipcMain.handle(IPC.tunnelStop, () => tunnelManager.stop());
  ipcMain.handle(IPC.tunnelStatus, () => tunnelManager.getStatus());
  ipcMain.handle(IPC.windowMinimize, () => getWin()?.minimize());
  ipcMain.handle(IPC.windowMaximize, () => {
    const win = getWin();
    if (!win) return;
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  });
  ipcMain.handle(IPC.windowClose, () => getWin()?.close());
  ipcMain.handle(IPC.modelEnsure, () =>
    ensureModel((p) => getWin()?.webContents.send(IPC_EVENT.modelProgress, p)),
  );
  ipcMain.handle(IPC.diagnosticsExport, () => exportDiagnostics());
  ipcMain.handle(IPC.diagnosticsIssue, () => openSupportIssue());
  ipcMain.handle(IPC.diagnosticsOpen, async (_e, path: string) => {
    if (!path || !fs.existsSync(path)) return { ok: false, error: 'Diagnostics file is no longer available.' };
    shell.showItemInFolder(path);
    return { ok: true };
  });
  ipcMain.handle(IPC.updaterGetStatus, () => updaterManager.getStatus());
  ipcMain.handle(IPC.updaterCheck, () => updaterManager.check(true));
  ipcMain.handle(IPC.updaterInstall, () => updaterManager.installNow());
  ipcMain.handle(IPC.audioDevicesList, () => getAudioDeviceReport());
  ipcMain.handle(IPC.audioDevicesSave, async (_e, settings: Partial<AudioDeviceSettings>) => {
    saveAudioSettings(settings);
    return (await getAudioDeviceReport()).settings;
  });
}
