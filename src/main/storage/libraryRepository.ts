import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type {
  BookContent,
  BookRecord,
  BookSummary,
  FontSize,
  LibraryFile,
  ReaderSettings,
} from '../../shared/contracts';
import { ReaderError } from '../../shared/errors';
import { calculatePercentage, clampCharOffset } from '../../shared/progress';
import { atomicWriteText, type AtomicTextWriter } from './atomicWrite';

const BOOK_ID_PATTERN = /^[a-f0-9]{64}$/;
const FONT_SIZES = new Set<FontSize>(['small', 'medium', 'large']);

const createDefaultLibrary = (): LibraryFile => ({
  schemaVersion: 1,
  books: [],
  settings: { fontSize: 'medium' },
});

function cloneLibrary(library: LibraryFile): LibraryFile {
  return structuredClone(library);
}

function isIsoDateOrNull(value: unknown): value is string | null {
  return value === null || (typeof value === 'string' && !Number.isNaN(Date.parse(value)));
}

function isBookRecord(value: unknown): value is BookRecord {
  if (!value || typeof value !== 'object') return false;
  const book = value as Partial<BookRecord>;
  const progress = book.progress as Partial<BookRecord['progress']> | undefined;

  return (
    typeof book.id === 'string' &&
    BOOK_ID_PATTERN.test(book.id) &&
    typeof book.title === 'string' &&
    book.title.length > 0 &&
    typeof book.sourceFileName === 'string' &&
    Number.isInteger(book.byteLength) &&
    (book.byteLength ?? -1) >= 0 &&
    Number.isInteger(book.characterLength) &&
    (book.characterLength ?? -1) >= 0 &&
    typeof book.importedAt === 'string' &&
    !Number.isNaN(Date.parse(book.importedAt)) &&
    isIsoDateOrNull(book.lastReadAt) &&
    Boolean(progress) &&
    Number.isInteger(progress?.charOffset) &&
    typeof progress?.percentage === 'number' &&
    isIsoDateOrNull(progress?.updatedAt)
  );
}

export function parseLibraryFile(raw: string): LibraryFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new ReaderError('STORAGE_UNAVAILABLE', '本地书库数据已损坏，暂时无法读取。', {
      cause: error,
    });
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new ReaderError('STORAGE_UNAVAILABLE', '本地书库数据格式无效。');
  }

  const candidate = parsed as Partial<LibraryFile>;
  if (
    candidate.schemaVersion !== 1 ||
    !Array.isArray(candidate.books) ||
    !candidate.books.every(isBookRecord) ||
    !candidate.settings ||
    !FONT_SIZES.has(candidate.settings.fontSize)
  ) {
    throw new ReaderError('STORAGE_UNAVAILABLE', '本地书库数据版本或格式无效。');
  }

  const normalized = cloneLibrary(candidate as LibraryFile);
  normalized.books = normalized.books.map((book) => {
    const charOffset = clampCharOffset(book.progress.charOffset, book.characterLength);
    return {
      ...book,
      progress: {
        ...book.progress,
        charOffset,
        percentage: calculatePercentage(charOffset, book.characterLength),
      },
    };
  });
  return normalized;
}

export interface LibraryRepositoryOptions {
  writer?: AtomicTextWriter;
  progressWriteDelayMs?: number;
}

export class LibraryRepository {
  private readonly libraryPath: string;
  private readonly booksPath: string;
  private readonly writer: AtomicTextWriter;
  private readonly progressWriteDelayMs: number;
  private library: LibraryFile = createDefaultLibrary();
  private initialized = false;
  private revision = 0;
  private persistedRevision = 0;
  private flushPromise: Promise<void> | null = null;
  private progressTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly userDataPath: string,
    options: LibraryRepositoryOptions = {},
  ) {
    this.libraryPath = path.join(userDataPath, 'library.json');
    this.booksPath = path.join(userDataPath, 'books');
    this.writer = options.writer ?? atomicWriteText;
    this.progressWriteDelayMs = options.progressWriteDelayMs ?? 900;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      await mkdir(this.booksPath, { recursive: true });
      try {
        this.library = parseLibraryFile(await readFile(this.libraryPath, 'utf8'));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        this.library = createDefaultLibrary();
        this.revision = 1;
        await this.flush();
      }

      this.initialized = true;
    } catch (error) {
      if (error instanceof ReaderError) throw error;
      throw new ReaderError('STORAGE_UNAVAILABLE', undefined, { cause: error });
    }
  }

  listBooks(): BookSummary[] {
    this.assertInitialized();
    return this.library.books
      .map((book) => structuredClone(book))
      .sort((left, right) => {
        const leftTime = Date.parse(left.lastReadAt ?? left.importedAt);
        const rightTime = Date.parse(right.lastReadAt ?? right.importedAt);
        return rightTime - leftTime;
      });
  }

  hasBook(bookId: string): boolean {
    this.assertInitialized();
    return this.library.books.some((book) => book.id === bookId);
  }

  getBookRecord(bookId: string): BookRecord | undefined {
    this.assertInitialized();
    this.assertValidBookId(bookId);
    const record = this.library.books.find((book) => book.id === bookId);
    return record ? structuredClone(record) : undefined;
  }

  async addBook(record: BookRecord, content: string): Promise<BookSummary> {
    this.assertInitialized();
    this.assertValidBookId(record.id);
    if (this.hasBook(record.id)) {
      throw new ReaderError('DUPLICATE_BOOK');
    }

    await this.flush();
    const targetPath = this.getManagedBookPath(record.id);
    const temporaryPath = `${targetPath}.${randomUUID()}.tmp`;

    try {
      await writeFile(temporaryPath, content, { encoding: 'utf8', flag: 'wx' });
      await rename(temporaryPath, targetPath);
      this.library.books.push(structuredClone(record));
      this.markDirty();
      try {
        await this.flush();
        return structuredClone(record);
      } catch (error) {
        this.library.books = this.library.books.filter((book) => book.id !== record.id);
        this.markDirty();
        await unlink(targetPath).catch(() => undefined);
        throw error;
      }
    } catch (error) {
      await unlink(temporaryPath).catch(() => undefined);
      if (error instanceof ReaderError) throw error;
      throw new ReaderError('STORAGE_UNAVAILABLE', undefined, { cause: error });
    }
  }

  async loadBook(bookId: string): Promise<BookContent> {
    this.assertInitialized();
    this.assertValidBookId(bookId);
    const record = this.library.books.find((book) => book.id === bookId);
    if (!record) throw new ReaderError('BOOK_NOT_FOUND');

    try {
      const content = await readFile(this.getManagedBookPath(bookId), 'utf8');
      return {
        id: record.id,
        title: record.title,
        content,
        characterLength: content.length,
        progress: structuredClone(record.progress),
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new ReaderError('BOOK_NOT_FOUND');
      }
      throw new ReaderError('STORAGE_UNAVAILABLE', undefined, { cause: error });
    }
  }

  saveProgress(bookId: string, charOffset: number): void {
    this.assertInitialized();
    this.assertValidBookId(bookId);
    const record = this.library.books.find((book) => book.id === bookId);
    if (!record) throw new ReaderError('BOOK_NOT_FOUND');

    const normalizedOffset = clampCharOffset(charOffset, record.characterLength);
    const now = new Date().toISOString();
    record.progress = {
      charOffset: normalizedOffset,
      percentage: calculatePercentage(normalizedOffset, record.characterLength),
      updatedAt: now,
    };
    record.lastReadAt = now;
    this.markDirty();
    this.scheduleProgressFlush();
  }

  getSettings(): ReaderSettings {
    this.assertInitialized();
    return structuredClone(this.library.settings);
  }

  async updateSettings(fontSize: FontSize): Promise<ReaderSettings> {
    this.assertInitialized();
    if (!FONT_SIZES.has(fontSize)) {
      throw new ReaderError('INVALID_INPUT');
    }

    if (this.library.settings.fontSize !== fontSize) {
      this.library.settings.fontSize = fontSize;
      this.markDirty();
      await this.flush();
    }
    return this.getSettings();
  }

  async removeBook(bookId: string): Promise<void> {
    this.assertInitialized();
    this.assertValidBookId(bookId);
    const recordIndex = this.library.books.findIndex((book) => book.id === bookId);
    if (recordIndex === -1) throw new ReaderError('BOOK_NOT_FOUND');

    await this.flush();
    const managedPath = this.getManagedBookPath(bookId);
    const tombstonePath = `${managedPath}.${randomUUID()}.removed`;
    let moved = false;

    try {
      await rename(managedPath, tombstonePath);
      moved = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw new ReaderError('STORAGE_UNAVAILABLE', undefined, { cause: error });
      }
    }

    const previousBooks = this.library.books;
    this.library.books = previousBooks.filter((book) => book.id !== bookId);
    this.markDirty();

    try {
      await this.flush();
      if (moved) await unlink(tombstonePath).catch(() => undefined);
    } catch (error) {
      this.library.books = previousBooks;
      this.markDirty();
      if (moved) await rename(tombstonePath, managedPath).catch(() => undefined);
      throw error;
    }
  }

  async flush(): Promise<void> {
    this.assertInitializedOrCreating();
    if (this.progressTimer) {
      clearTimeout(this.progressTimer);
      this.progressTimer = null;
    }
    if (this.persistedRevision === this.revision) return;
    if (this.flushPromise) return this.flushPromise;

    this.flushPromise = this.performFlush().finally(() => {
      this.flushPromise = null;
    });
    return this.flushPromise;
  }

  private async performFlush(): Promise<void> {
    while (this.persistedRevision < this.revision) {
      const targetRevision = this.revision;
      const serialized = `${JSON.stringify(this.library, null, 2)}\n`;
      try {
        await this.writer(this.libraryPath, serialized);
        this.persistedRevision = targetRevision;
      } catch (error) {
        throw error instanceof ReaderError
          ? error
          : new ReaderError('STORAGE_UNAVAILABLE', undefined, { cause: error });
      }
    }
  }

  private scheduleProgressFlush(): void {
    if (this.progressTimer) clearTimeout(this.progressTimer);
    this.progressTimer = setTimeout(() => {
      this.progressTimer = null;
      void this.flush().catch((error) => {
        console.error('Failed to persist reading progress', error);
      });
    }, this.progressWriteDelayMs);
    this.progressTimer.unref();
  }

  private markDirty(): void {
    this.revision += 1;
  }

  private getManagedBookPath(bookId: string): string {
    this.assertValidBookId(bookId);
    const targetPath = path.resolve(this.booksPath, `${bookId}.txt`);
    const relative = path.relative(this.booksPath, targetPath);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new ReaderError('INVALID_INPUT');
    }
    return targetPath;
  }

  private assertValidBookId(bookId: string): void {
    if (!BOOK_ID_PATTERN.test(bookId)) {
      throw new ReaderError('INVALID_INPUT');
    }
  }

  private assertInitialized(): void {
    if (!this.initialized) {
      throw new ReaderError('STORAGE_UNAVAILABLE', '本地书库尚未准备好。');
    }
  }

  private assertInitializedOrCreating(): void {
    if (!this.initialized && this.revision === 0) {
      throw new ReaderError('STORAGE_UNAVAILABLE', '本地书库尚未准备好。');
    }
  }
}
