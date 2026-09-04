import { contextBridge, ipcRenderer } from 'electron';
import type { ReaderDesktopApi } from '../shared/contracts';
import { IPC_CHANNELS } from '../shared/contracts';

const readerApi = Object.freeze<ReaderDesktopApi>({
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
