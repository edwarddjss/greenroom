import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import {
  IPC,
  IPC_EVENT,
  type GreenroomIpcApi,
  type EngineSnapshot,
  type LogLine,
  type PrereqReport,
  type ModelDownloadProgress,
  type UpdateStatus,
} from '@greenroom/shared';

function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_e: IpcRendererEvent, payload: T): void => cb(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

const api: GreenroomIpcApi = {
  engineStart: () => ipcRenderer.invoke(IPC.engineStart),
  engineStop: () => ipcRenderer.invoke(IPC.engineStop),
  engineRestart: () => ipcRenderer.invoke(IPC.engineRestart),
  engineGetSnapshot: () => ipcRenderer.invoke(IPC.engineGetSnapshot),
  prereqsScan: () => ipcRenderer.invoke(IPC.prereqsScan),
  vbcableInstall: () => ipcRenderer.invoke(IPC.vbcableInstall),
  credsSave: (creds) => ipcRenderer.invoke(IPC.credsSave, creds),
  credsStatus: () => ipcRenderer.invoke(IPC.credsStatus),
  credsReveal: () => ipcRenderer.invoke(IPC.credsReveal),
  discordInviteUrl: () => ipcRenderer.invoke(IPC.discordInviteUrl),
  validateDiscord: (token, clientId) => ipcRenderer.invoke(IPC.validateDiscord, token, clientId),
  validateSpotify: (clientId, secret) => ipcRenderer.invoke(IPC.validateSpotify, clientId, secret),
  commandsRegister: () => ipcRenderer.invoke(IPC.commandsRegister),
  tunnelStart: () => ipcRenderer.invoke(IPC.tunnelStart),
  tunnelStop: () => ipcRenderer.invoke(IPC.tunnelStop),
  tunnelStatus: () => ipcRenderer.invoke(IPC.tunnelStatus),
  windowMinimize: () => ipcRenderer.invoke(IPC.windowMinimize),
  windowMaximize: () => ipcRenderer.invoke(IPC.windowMaximize),
  windowClose: () => ipcRenderer.invoke(IPC.windowClose),
  modelEnsure: () => ipcRenderer.invoke(IPC.modelEnsure),
  diagnosticsExport: () => ipcRenderer.invoke(IPC.diagnosticsExport),
  diagnosticsIssue: () => ipcRenderer.invoke(IPC.diagnosticsIssue),
  diagnosticsOpen: (path: string) => ipcRenderer.invoke(IPC.diagnosticsOpen, path),
  updaterGetStatus: () => ipcRenderer.invoke(IPC.updaterGetStatus),
  updaterCheck: () => ipcRenderer.invoke(IPC.updaterCheck),
  updaterInstall: () => ipcRenderer.invoke(IPC.updaterInstall),
  onEngineState: (cb) => subscribe<EngineSnapshot>(IPC_EVENT.engineState, cb),
  onEngineLog: (cb) => subscribe<LogLine[]>(IPC_EVENT.engineLog, cb),
  onPrereqs: (cb) => subscribe<PrereqReport>(IPC_EVENT.prereqs, cb),
  onModelProgress: (cb) => subscribe<ModelDownloadProgress>(IPC_EVENT.modelProgress, cb),
  onUpdaterStatus: (cb) => subscribe<UpdateStatus>(IPC_EVENT.updaterStatus, cb),
};

contextBridge.exposeInMainWorld('greenroom', api);
