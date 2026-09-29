import { contextBridge, ipcRenderer } from 'electron';
import type { ReaderDesktopApi } from '../shared/contracts';
import { IPC_CHANNELS } from '../shared/contracts';

const readerApi = Object.freeze<ReaderDesktopApi>({
  getFullScreen: () => ipcRenderer.invoke(IPC_CHANNELS.getFullScreen),
  setFullScreen: (fullScreen: boolean) => ipcRenderer.invoke(IPC_CHANNELS.setFullScreen, fullScreen),
  onFullScreenChange: (listener: (fullScreen: boolean) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, fullScreen: boolean) => listener(fullScreen);
    ipcRenderer.on(IPC_CHANNELS.fullScreenChanged, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.fullScreenChanged, handler);
  },
  isMaximized: () => ipcRenderer.invoke(IPC_CHANNELS.isMaximized),
  onMaximize: (listener: () => void) => {
    const handler = () => listener();
    ipcRenderer.on(IPC_CHANNELS.maximized, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.maximized, handler);
  },
  getUpdateState: () => ipcRenderer.invoke(IPC_CHANNELS.getUpdateState),
  checkForUpdates: () => ipcRenderer.invoke(IPC_CHANNELS.checkForUpdates),
  listBooks: () => ipcRenderer.invoke(IPC_CHANNELS.listBooks),
  importBook: () => ipcRenderer.invoke(IPC_CHANNELS.importBook),
  loadBook: (bookId: string) => ipcRenderer.invoke(IPC_CHANNELS.loadBook, bookId),
  removeBook: (bookId: string) => ipcRenderer.invoke(IPC_CHANNELS.removeBook, bookId),
  saveProgress: (input: Parameters<ReaderDesktopApi['saveProgress']>[0]) =>
    ipcRenderer.invoke(IPC_CHANNELS.saveProgress, input),
  getSettings: () => ipcRenderer.invoke(IPC_CHANNELS.getSettings),
  updateSettings: (input: Parameters<ReaderDesktopApi['updateSettings']>[0]) =>
    ipcRenderer.invoke(IPC_CHANNELS.updateSettings, input),
});

contextBridge.exposeInMainWorld('readerApi', readerApi);
