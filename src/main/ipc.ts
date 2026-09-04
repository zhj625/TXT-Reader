import type { IpcMain, IpcMainInvokeEvent, WebContents } from 'electron';
import type { FontSize, ReaderSettings, SaveProgressInput } from '../shared/contracts';
import { IPC_CHANNELS } from '../shared/contracts';
import { ReaderError, toReaderError } from '../shared/errors';
import type { ImportService } from './services/importService';
import type { LibraryRepository } from './storage/libraryRepository';

const BOOK_ID_PATTERN = /^[a-f0-9]{64}$/;
const FONT_SIZES = new Set<FontSize>(['small', 'medium', 'large']);

export function validateBookId(value: unknown): string {
  if (typeof value !== 'string' || !BOOK_ID_PATTERN.test(value)) {
    throw new ReaderError('INVALID_INPUT');
  }
  return value;
}

export function validateProgressInput(value: unknown): SaveProgressInput {
  if (!value || typeof value !== 'object') throw new ReaderError('INVALID_INPUT');
  const input = value as Partial<SaveProgressInput>;
  if (
    typeof input.bookId !== 'string' ||
    !BOOK_ID_PATTERN.test(input.bookId) ||
    typeof input.charOffset !== 'number' ||
    !Number.isSafeInteger(input.charOffset)
  ) {
    throw new ReaderError('INVALID_INPUT');
  }
  return { bookId: input.bookId, charOffset: input.charOffset };
}

export function validateSettingsInput(value: unknown): Partial<ReaderSettings> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ReaderError('INVALID_INPUT');
  }
  const keys = Object.keys(value);
  if (keys.length !== 1 || keys[0] !== 'fontSize') {
    throw new ReaderError('INVALID_INPUT');
  }
  const fontSize = (value as Partial<ReaderSettings>).fontSize;
  if (!fontSize || !FONT_SIZES.has(fontSize)) {
    throw new ReaderError('INVALID_INPUT');
  }
  return { fontSize };
}

interface RegisterIpcOptions {
  ipcMain: IpcMain;
  repository: LibraryRepository;
  importService: ImportService;
  getTrustedWebContents: () => WebContents | null;
}

export function registerIpcHandlers({
  ipcMain,
  repository,
  importService,
  getTrustedWebContents,
}: RegisterIpcOptions): void {
  const assertTrustedSender = (event: IpcMainInvokeEvent) => {
    const trusted = getTrustedWebContents();
    if (!trusted || event.sender !== trusted || event.senderFrame !== trusted.mainFrame) {
      throw new ReaderError('INVALID_INPUT', '拒绝了来自未知页面的请求。');
    }
  };

  const handle = <TArgs extends unknown[], TResult>(
    channel: string,
    action: (...args: TArgs) => TResult | Promise<TResult>,
  ) => {
    ipcMain.removeHandler(channel);
    ipcMain.handle(channel, async (event, ...args: TArgs) => {
      assertTrustedSender(event);
      try {
        return await action(...args);
      } catch (error) {
        const readerError = toReaderError(error);
        console.error('IPC operation failed', channel, readerError.code);
        throw new Error(`${readerError.code}:${readerError.message}`);
      }
    });
  };

  handle(IPC_CHANNELS.listBooks, () => repository.listBooks());
  handle(IPC_CHANNELS.importBook, () => importService.importBook());
  handle(IPC_CHANNELS.loadBook, (bookId: unknown) => repository.loadBook(validateBookId(bookId)));
  handle(IPC_CHANNELS.removeBook, (bookId: unknown) => repository.removeBook(validateBookId(bookId)));
  handle(IPC_CHANNELS.saveProgress, (input: unknown) => {
    const validated = validateProgressInput(input);
    repository.saveProgress(validated.bookId, validated.charOffset);
  });
  handle(IPC_CHANNELS.getSettings, () => repository.getSettings());
  handle(IPC_CHANNELS.updateSettings, async (input: unknown) => {
    const validated = validateSettingsInput(input);
    return repository.updateSettings(validated.fontSize!);
  });
}
