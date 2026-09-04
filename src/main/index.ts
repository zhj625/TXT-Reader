import path from 'node:path';
import { createRequire } from 'node:module';
import { app, BrowserWindow, dialog, ipcMain, Menu } from 'electron';
import { registerIpcHandlers } from './ipc';
import { ImportService } from './services/importService';
import { LibraryRepository } from './storage/libraryRepository';

if (process.env.READER_E2E === '1' && process.env.READER_E2E_USER_DATA) {
  app.setPath('userData', path.resolve(process.env.READER_E2E_USER_DATA));
  app.commandLine.appendSwitch('disable-gpu');
}

let mainWindow: BrowserWindow | null = null;
let repository: LibraryRepository | null = null;
let quittingAfterFlush = false;

function isAllowedNavigation(targetUrl: string): boolean {
  try {
    const parsed = new URL(targetUrl);
    if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
      return parsed.origin === new URL(MAIN_WINDOW_VITE_DEV_SERVER_URL).origin;
    }
    return parsed.protocol === 'file:';
  } catch {
    return false;
  }
}

async function pickTxtFile(): Promise<string | null> {
  if (process.env.READER_E2E === '1' && process.env.READER_E2E_IMPORT_PATH) {
    return path.resolve(process.env.READER_E2E_IMPORT_PATH);
  }

  const result = await dialog.showOpenDialog(mainWindow!, {
    title: '导入 TXT',
    buttonLabel: '导入并阅读',
    properties: ['openFile'],
    filters: [{ name: 'TXT 文本', extensions: ['txt'] }],
  });
  return result.canceled ? null : (result.filePaths[0] ?? null);
}

function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 760,
    minHeight: 560,
    show: false,
    backgroundColor: '#f4f0e8',
    title: '墨读',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      spellcheck: false,
    },
  });

  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, targetUrl) => {
    if (!isAllowedNavigation(targetUrl)) event.preventDefault();
  });
  window.once('ready-to-show', () => window.show());
  window.on('closed', () => {
    if (mainWindow === window) mainWindow = null;
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    void window.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    void window.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }

  return window;
}

async function bootstrap(): Promise<void> {
  repository = new LibraryRepository(app.getPath('userData'));
  await repository.initialize();

  const runtimeRequire = createRequire(__filename);
  const importService = new ImportService(repository, {
    pickFile: pickTxtFile,
    iconvModulePath: runtimeRequire.resolve('iconv-lite'),
  });

  if (process.env.READER_E2E === '1' && process.env.READER_E2E_AUTO_IMPORT === '1') {
    const result = await importService.importBook();
    await repository.flush();
    app.exit(result.status === 'success' || result.status === 'duplicate' ? 0 : 2);
    return;
  }

  mainWindow = createMainWindow();
  registerIpcHandlers({
    ipcMain,
    repository,
    importService,
    getTrustedWebContents: () => mainWindow?.webContents ?? null,
  });
}

void app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  try {
    await bootstrap();
  } catch (error) {
    console.error('Application startup failed', error);
    dialog.showErrorBox('无法启动墨读', '本地书库无法初始化，请检查磁盘空间或文件权限。');
    app.quit();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0 && repository) {
      mainWindow = createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', (event) => {
  if (quittingAfterFlush || !repository) return;
  event.preventDefault();
  quittingAfterFlush = true;
  void repository
    .flush()
    .catch((error) => console.error('Failed to flush library before quit', error))
    .finally(() => app.exit(0));
});
