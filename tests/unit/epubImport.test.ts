import { processEpubBytes } from '../../src/main/services/epubImport';
import { epubFiles, expectedEpubText, zipFiles } from '../fixtures/epub';

describe('EPUB import', () => {
  it.each(['2.0', '3.0'])('reads EPUB %s in spine order with metadata and decoded relative paths', async (version) => {
    const result = await processEpubBytes(zipFiles(epubFiles(version)));
    expect(result.title).toBe('山河 & 故人');
    expect(result.author).toBe('汤姆 · 霍加德');
    expect(result.content).toBe(expectedEpubText);
    expect(result.chapters).toEqual([
      { title: '壹 · 山河入梦', charOffset: 0 },
      { title: '贰 · 故人归来', charOffset: expectedEpubText.indexOf('第二章') },
    ]);
    expect(result.characterLength).toBe(expectedEpubText.length);
    expect(result.id).toMatch(/^[a-f0-9]{64}$/);
  });

  it('rejects a non-ZIP file', async () => {
    await expect(processEpubBytes(Buffer.from('not epub'))).rejects.toMatchObject({code:'INVALID_EPUB'});
  });

  it('falls back to visible headings when an EPUB has no navigation document', async () => {
    const files = epubFiles('3.0');
    delete files['OPS/nav.xhtml'];
    files['OPS/book.opf'] = files['OPS/book.opf']
      .replace('<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>', '');
    const result = await processEpubBytes(zipFiles(files));
    expect(result.chapters.map((chapter) => chapter.title)).toEqual(['第一章', '第二章']);
  });

  it.each(['mimetype', 'META-INF/container.xml', 'OPS/book.opf', 'OPS/Text/一.xhtml'])('rejects missing %s', async (name) => {
    const files = epubFiles();
    delete files[name];
    await expect(processEpubBytes(zipFiles(files))).rejects.toMatchObject({code:'INVALID_EPUB'});
  });

  it.each(['../../outside.xhtml', 'https://example.com/book.xhtml', '/absolute.xhtml', '%2e%2e/%2e%2e/outside.xhtml'])('rejects unsafe resource path %s', async (href) => {
    const files = epubFiles();
    files['OPS/book.opf'] = files['OPS/book.opf'].replace('Text/two.xhtml', href);
    await expect(processEpubBytes(zipFiles(files))).rejects.toMatchObject({code:'INVALID_EPUB'});
  });

  it('rejects malformed XML and entity declarations', async () => {
    for (const xml of ['<html><body><p></html>', '<!DOCTYPE html [<!ENTITY secret SYSTEM "file:///secret">]><html><body>&secret;</body></html>']) {
      const files = epubFiles();
      files['OPS/Text/一.xhtml'] = xml;
      await expect(processEpubBytes(zipFiles(files))).rejects.toMatchObject({code:'INVALID_EPUB'});
    }
  });

  it('rejects an empty or image-only book', async () => {
    const files = epubFiles();
    files['OPS/Text/一.xhtml'] = files['OPS/Text/two.xhtml'] = '<html><body><img src="cover.png"/></body></html>';
    await expect(processEpubBytes(zipFiles(files))).rejects.toMatchObject({code:'EMPTY_FILE'});
  });

  it('rejects oversized expanded documents before parsing', async () => {
    const files = epubFiles();
    files['OPS/Text/一.xhtml'] = 'x'.repeat(10 * 1024 * 1024 + 1);
    await expect(processEpubBytes(zipFiles(files))).rejects.toMatchObject({code:'FILE_TOO_LARGE'});
  });

  it('rejects encrypted ZIP entries', async () => {
    const bytes = zipFiles(epubFiles());
    const central = bytes.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    bytes.writeUInt16LE(bytes.readUInt16LE(central + 8) | 1, central + 8);
    await expect(processEpubBytes(bytes)).rejects.toMatchObject({code:'INVALID_EPUB'});
  });
});
