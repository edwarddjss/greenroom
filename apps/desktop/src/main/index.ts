import { app, BrowserWindow, shell } from 'electron';
import { join } from 'node:path';
import { createSupervisor, registerIpc } from './ipc';
import type { Supervisor } from './supervisor';
import { initVault } from './vault';
import { tunnelManager } from './tunnel';
import { updaterManager } from './updater';

let win: BrowserWindow | null = null;
let supervisor: Supervisor | null = null;

const getWin = (): BrowserWindow | null => win;

function createWindow(): void {
  win = new BrowserWindow({
    width: 1024,
    height: 720,
    minWidth: 880,
    minHeight: 600,
    frame: false,
    show: false,
    backgroundColor: '#0B0B0F',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: false,
    },
  });

  win.on('ready-to-show', () => win?.show());
  win.on('closed', () => {
    win = null;
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(async () => {
  await initVault();
  tunnelManager.discardSavedQuickTunnel();
  supervisor = createSupervisor(getWin);
  registerIpc(supervisor, getWin);
  createWindow();
  updaterManager.initialize(getWin);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}).catch((err: unknown) => {
  console.error('[main] Failed to start:', err);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  tunnelManager.stop();
  // Never leave an orphaned engine holding :8888.
  supervisor?.stop();
});
