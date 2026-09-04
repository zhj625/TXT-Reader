export type FontSize = 'small' | 'medium' | 'large';

export interface ReaderSettings {
  fontSize: FontSize;
}

export interface ReadingProgress {
  charOffset: number;
  percentage: number;
  updatedAt: string | null;
}

export interface BookRecord {
  id: string;
  title: string;
  sourceFileName: string;
  byteLength: number;
  characterLength: number;
  importedAt: string;
  lastReadAt: string | null;
  progress: ReadingProgress;
}

export interface LibraryFile {
  schemaVersion: 1;
  books: BookRecord[];
  settings: ReaderSettings;
}

export type BookSummary = BookRecord;

export interface BookContent {
  id: string;
  title: string;
  content: string;
  characterLength: number;
  progress: ReadingProgress;
}

export type ReaderErrorCode =
  | 'EMPTY_FILE'
  | 'FILE_TOO_LARGE'
  | 'UNSUPPORTED_OR_INVALID_TEXT'
  | 'DUPLICATE_BOOK'
  | 'BOOK_NOT_FOUND'
  | 'STORAGE_UNAVAILABLE'
  | 'INVALID_INPUT'
  | 'UNKNOWN_ERROR';

export type ImportBookResult =
  | { status: 'cancelled' }
  | { status: 'success'; book: BookSummary }
  | { status: 'duplicate'; bookId: string; title: string }
  | { status: 'error'; code: ReaderErrorCode; message: string };

export interface SaveProgressInput {
  bookId: string;
  charOffset: number;
}

export interface ReaderDesktopApi {
  listBooks(): Promise<BookSummary[]>;
  importBook(): Promise<ImportBookResult>;
  loadBook(bookId: string): Promise<BookContent>;
  removeBook(bookId: string): Promise<void>;
  saveProgress(input: SaveProgressInput): Promise<void>;
  getSettings(): Promise<ReaderSettings>;
  updateSettings(input: Partial<ReaderSettings>): Promise<ReaderSettings>;
}

export const IPC_CHANNELS = {
  listBooks: 'books:list',
  importBook: 'books:import',
  loadBook: 'books:load',
  removeBook: 'books:remove',
  saveProgress: 'progress:save',
  getSettings: 'settings:get',
  updateSettings: 'settings:update',
} as const;
