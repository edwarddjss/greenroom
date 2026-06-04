import { app, type BrowserWindow } from 'electron';
import { autoUpdater } from 'electron-updater';
import { IPC_EVENT, type UpdateStatus } from '@greenroom/shared';

const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;
const INITIAL_CHECK_DELAY_MS = 8_000;

function readableUpdateError(error: Error): string {
  if (/net::|network|enotfound|eai_|econn|timed out/i.test(error.message)) {
    return 'Greenroom could not reach the update server. Check your connection and try again.';
  }
  return 'Greenroom could not check for updates. Try again later.';
}

class UpdaterManager {
  private status: UpdateStatus = {
    phase: 'idle',
    currentVersion: app.getVersion(),
    supported: app.isPackaged,
  };
  private getWin: (() => BrowserWindow | null) | null = null;
  private initialized = false;
  private userInitiated = false;

  initialize(getWin: () => BrowserWindow | null): void {
    if (this.initialized) return;
    this.initialized = true;
    this.getWin = getWin;
    if (!app.isPackaged) return;

    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.on('checking-for-update', () => {
      this.setStatus({ phase: 'checking' });
    });
    autoUpdater.on('update-available', (info) => {
      this.setStatus({ phase: 'available', version: info.version });
    });
    autoUpdater.on('update-not-available', () => {
      this.setStatus({ phase: 'idle', lastCheckedAt: Date.now() });
      this.userInitiated = false;
    });
    autoUpdater.on('download-progress', (progress) => {
      this.setStatus({ phase: 'downloading', percent: progress.percent });
    });
    autoUpdater.on('update-downloaded', (info) => {
      this.setStatus({ phase: 'downloaded', version: info.version, lastCheckedAt: Date.now() });
      this.userInitiated = false;
    });
    autoUpdater.on('error', (error) => {
      this.setStatus({
        phase: 'error',
        error: readableUpdateError(error),
        userInitiated: this.userInitiated,
        lastCheckedAt: Date.now(),
      });
      this.userInitiated = false;
    });

    setTimeout(() => void this.check(false), INITIAL_CHECK_DELAY_MS);
    setInterval(() => void this.check(false), CHECK_INTERVAL_MS);
  }

  getStatus(): UpdateStatus {
    return { ...this.status };
  }

  async check(userInitiated = true): Promise<UpdateStatus> {
    if (!app.isPackaged) return this.getStatus();
    if (this.status.phase === 'checking' || this.status.phase === 'downloading') return this.getStatus();
    this.userInitiated = userInitiated;
    try {
      await autoUpdater.checkForUpdates();
    } catch (error) {
      this.setStatus({
        phase: 'error',
        error: readableUpdateError(error instanceof Error ? error : new Error(String(error))),
        userInitiated,
        lastCheckedAt: Date.now(),
      });
      this.userInitiated = false;
    }
    return this.getStatus();
  }

  installNow(): void {
    if (this.status.phase === 'downloaded') autoUpdater.quitAndInstall(true, true);
  }

  private setStatus(update: Partial<UpdateStatus> & Pick<UpdateStatus, 'phase'>): void {
    this.status = {
      currentVersion: this.status.currentVersion,
      supported: this.status.supported,
      ...update,
    };
    this.getWin?.()?.webContents.send(IPC_EVENT.updaterStatus, this.getStatus());
  }
}

export const updaterManager = new UpdaterManager();
