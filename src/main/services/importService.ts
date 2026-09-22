import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import type { BookRecord, ImportBookResult } from '../../shared/contracts';
import { getErrorMessage, ReaderError, toReaderError } from '../../shared/errors';
import type { LibraryRepository } from '../storage/libraryRepository';
import { processTextBytesInWorker } from './textImportWorker';
import { processEpubBytes } from './epubImport';

export const DEFAULT_MAX_FILE_BYTES = 50 * 1024 * 1024;

export interface ImportServiceOptions {
  pickFile: () => Promise<string | null>;
  iconvModulePath?: string;
  maxFileBytes?: number;
  now?: () => Date;
}

export class ImportService {
  private readonly maxFileBytes: number;
  private readonly now: () => Date;

  constructor(
    private readonly repository: LibraryRepository,
    private readonly options: ImportServiceOptions,
  ) {
    this.maxFileBytes = options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;
    this.now = options.now ?? (() => new Date());
  }

  async importBook(): Promise<ImportBookResult> {
    try {
      const selectedPath = await this.options.pickFile();
      if (!selectedPath) return { status: 'cancelled' };

      const extension = path.extname(selectedPath).toLowerCase();
      if (!['.txt', '.epub'].includes(extension)) {
        throw new ReaderError('UNSUPPORTED_OR_INVALID_TEXT', '目前支持导入 .txt 和 .epub 文件。');
      }

      const fileStat = await stat(selectedPath);
      if (!fileStat.isFile()) {
        throw new ReaderError('UNSUPPORTED_OR_INVALID_TEXT', '选择的项目不是可读取的书籍文件。');
      }
      if (fileStat.size === 0) throw new ReaderError('EMPTY_FILE');
      if (fileStat.size > this.maxFileBytes) throw new ReaderError('FILE_TOO_LARGE');

      const bytes = await readFile(selectedPath);
      const processed = extension === '.epub'
        ? await processEpubBytes(bytes)
        : await processTextBytesInWorker(bytes, this.options.iconvModulePath);
      const processedAuthor = 'author' in processed ? processed.author ?? null : null;
      const existing = this.repository.getBookRecord(processed.id);
      if (existing) {
        const enriched = await this.repository.enrichBookMetadata(
          existing.id,
          processedAuthor,
          processed.chapters,
        );
        if (enriched) return { status: 'success', book: enriched };
        return { status: 'duplicate', bookId: existing.id, title: existing.title };
      }

      const importedAt = this.now().toISOString();
      const sourceFileName = path.basename(selectedPath);
      const title = ('title' in processed && processed.title)
        || path.basename(sourceFileName, path.extname(sourceFileName)).trim() || sourceFileName;
      const record: BookRecord = {
        id: processed.id,
        title,
        sourceFileName,
        byteLength: fileStat.size,
        characterLength: processed.characterLength,
        importedAt,
        lastReadAt: null,
        author: processedAuthor,
        chapters: processed.chapters,
        progress: {
          charOffset: 0,
          percentage: 0,
          updatedAt: null,
        },
      };

      const book = await this.repository.addBook(record, processed.content);
      return { status: 'success', book };
    } catch (error) {
      const readerError = toReaderError(error);
      console.error('Book import failed', readerError.code, error);
      return {
        status: 'error',
        code: readerError.code,
        message: readerError.message || getErrorMessage(readerError.code),
      };
    }
  }
}
