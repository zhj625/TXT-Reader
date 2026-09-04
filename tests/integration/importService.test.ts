import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import iconv from 'iconv-lite';
import { ImportService } from '../../src/main/services/importService';
import { LibraryRepository } from '../../src/main/storage/libraryRepository';

describe('ImportService', () => {
  let testPath: string;
  let userDataPath: string;

  beforeEach(async () => {
    testPath = await mkdtemp(path.join(os.tmpdir(), 'moodu-import-'));
    userDataPath = path.join(testPath, 'user-data');
  });

  afterEach(async () => {
    await rm(testPath, { recursive: true, force: true });
  });

  it('imports a GB18030 file, creates an internal UTF-8 copy and detects duplicates', async () => {
    const sourcePath = path.join(testPath, '江湖.txt');
    await writeFile(sourcePath, iconv.encode('第一章\r\n江湖夜雨十年灯。', 'gb18030'));
    const repository = new LibraryRepository(userDataPath);
    await repository.initialize();
    const service = new ImportService(repository, {
      pickFile: async () => sourcePath,
      now: () => new Date('2026-09-03T08:00:00.000Z'),
    });

    const imported = await service.importBook();
    expect(imported.status).toBe('success');
    if (imported.status !== 'success') throw new Error('expected a successful import');
    expect(imported.book.title).toBe('江湖');
    expect((await repository.loadBook(imported.book.id)).content).toBe('第一章\n江湖夜雨十年灯。');
    expect(await service.importBook()).toMatchObject({ status: 'duplicate', bookId: imported.book.id });
  });

  it('returns clear statuses for cancellation, empty, oversized and unsupported files', async () => {
    const repository = new LibraryRepository(userDataPath);
    await repository.initialize();
    const cancelled = new ImportService(repository, { pickFile: async () => null });
    expect(await cancelled.importBook()).toEqual({ status: 'cancelled' });

    const emptyPath = path.join(testPath, 'empty.txt');
    await writeFile(emptyPath, '');
    const empty = new ImportService(repository, { pickFile: async () => emptyPath });
    expect(await empty.importBook()).toMatchObject({ status: 'error', code: 'EMPTY_FILE' });

    const largePath = path.join(testPath, 'large.txt');
    await writeFile(largePath, '1234567890');
    const large = new ImportService(repository, { pickFile: async () => largePath, maxFileBytes: 5 });
    expect(await large.importBook()).toMatchObject({ status: 'error', code: 'FILE_TOO_LARGE' });

    const markdownPath = path.join(testPath, 'notes.md');
    await writeFile(markdownPath, 'not txt');
    const unsupported = new ImportService(repository, { pickFile: async () => markdownPath });
    expect(await unsupported.importBook()).toMatchObject({
      status: 'error',
      code: 'UNSUPPORTED_OR_INVALID_TEXT',
    });
  });
});
