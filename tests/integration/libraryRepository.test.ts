import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { BookRecord } from '../../src/shared/contracts';
import { atomicWriteText } from '../../src/main/storage/atomicWrite';
import { LibraryRepository } from '../../src/main/storage/libraryRepository';

function makeBook(idCharacter: string, overrides: Partial<BookRecord> = {}): BookRecord {
  return {
    id: idCharacter.repeat(64),
    title: `书籍 ${idCharacter}`,
    sourceFileName: `book-${idCharacter}.txt`,
    byteLength: 100,
    characterLength: 100,
    importedAt: '2026-09-01T00:00:00.000Z',
    lastReadAt: null,
    progress: { charOffset: 0, percentage: 0, updatedAt: null },
    ...overrides,
  };
}

describe('LibraryRepository', () => {
  let userDataPath: string;

  beforeEach(async () => {
    userDataPath = await mkdtemp(path.join(os.tmpdir(), 'moodu-library-'));
  });

  afterEach(async () => {
    await rm(userDataPath, { recursive: true, force: true });
  });

  it('persists imported content, settings and progress across restarts', async () => {
    const repository = new LibraryRepository(userDataPath, { progressWriteDelayMs: 10 });
    await repository.initialize();
    const record = makeBook('a');
    await repository.addBook(record, '文'.repeat(100));
    repository.saveProgress(record.id, 42);
    await repository.updateSettings('large');
    await repository.flush();

    const restarted = new LibraryRepository(userDataPath);
    await restarted.initialize();
    const loaded = await restarted.loadBook(record.id);

    expect(loaded.content).toBe('文'.repeat(100));
    expect(loaded.progress).toMatchObject({ charOffset: 42, percentage: 42 });
    expect(restarted.getSettings()).toEqual({ fontSize: 'large' });
    expect(restarted.listBooks()[0].lastReadAt).not.toBeNull();
  });

  it('sorts books by the most recent reading or import time', async () => {
    const repository = new LibraryRepository(userDataPath);
    await repository.initialize();
    await repository.addBook(makeBook('a'), 'a'.repeat(100));
    await repository.addBook(makeBook('b', { importedAt: '2026-09-02T00:00:00.000Z' }), 'b'.repeat(100));

    expect(repository.listBooks().map((book) => book.id)).toEqual(['b'.repeat(64), 'a'.repeat(64)]);
    repository.saveProgress('a'.repeat(64), 1);
    expect(repository.listBooks()[0].id).toBe('a'.repeat(64));
  });

  it('removes only the managed copy and leaves an original TXT untouched', async () => {
    const repository = new LibraryRepository(userDataPath);
    await repository.initialize();
    const originalPath = path.join(userDataPath, 'original.txt');
    await writeFile(originalPath, 'original', 'utf8');
    const record = makeBook('c');
    await repository.addBook(record, 'c'.repeat(100));

    await repository.removeBook(record.id);

    expect(await readFile(originalPath, 'utf8')).toBe('original');
    await expect(access(path.join(userDataPath, 'books', `${record.id}.txt`))).rejects.toThrow();
    expect(repository.listBooks()).toEqual([]);
  });

  it('keeps the previous metadata readable if an atomic update fails', async () => {
    let failWrites = false;
    const repository = new LibraryRepository(userDataPath, {
      writer: async (targetPath, content) => {
        if (failWrites) throw new Error('injected write failure');
        await atomicWriteText(targetPath, content);
      },
    });
    await repository.initialize();
    failWrites = true;

    await expect(repository.updateSettings('large')).rejects.toThrow();

    const restarted = new LibraryRepository(userDataPath);
    await restarted.initialize();
    expect(restarted.getSettings()).toEqual({ fontSize: 'medium' });
  });
});
