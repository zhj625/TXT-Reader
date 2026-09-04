import { createHash } from 'node:crypto';
import iconv from 'iconv-lite';
import { ReaderError } from '../../src/shared/errors';
import { processTextBytesInWorker } from '../../src/main/services/textImportWorker';

describe('TXT worker processing', () => {
  it('decodes UTF-8 BOM text, normalizes newlines and hashes normalized content', async () => {
    const bytes = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('第一行\r\n第二行', 'utf8')]);
    const result = await processTextBytesInWorker(bytes);

    expect(result.encoding).toBe('utf8');
    expect(result.content).toBe('第一行\n第二行');
    expect(result.id).toBe(createHash('sha256').update(result.content).digest('hex'));
    expect(result.characterLength).toBe(result.content.length);
  });

  it('falls back to GB18030 for common Chinese text', async () => {
    const bytes = iconv.encode('中文小说：山高水长。', 'gb18030');
    const result = await processTextBytesInWorker(bytes);

    expect(result.encoding).toBe('gb18030');
    expect(result.content).toBe('中文小说：山高水长。');
  });

  it('rejects whitespace-only and control-character-heavy files', async () => {
    await expect(processTextBytesInWorker(Buffer.from(' \r\n\t '))).rejects.toMatchObject({
      code: 'EMPTY_FILE',
    } satisfies Partial<ReaderError>);
    await expect(processTextBytesInWorker(Buffer.from([0, 1, 2, 3, 4, 5]))).rejects.toMatchObject({
      code: 'UNSUPPORTED_OR_INVALID_TEXT',
    } satisfies Partial<ReaderError>);
  });
});
