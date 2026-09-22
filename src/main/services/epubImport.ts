import path from 'node:path';
import { createHash } from 'node:crypto';
import { fromBuffer, type Entry, type ZipFile } from 'yauzl';
import { DOMParser, type Node, type Element } from '@xmldom/xmldom';
import type { BookChapter } from '../../shared/contracts';
import { ReaderError } from '../../shared/errors';

const MAX_EXPANDED_BYTES = 100 * 1024 * 1024;
const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
const invalid = () => new ReaderError('INVALID_EPUB');

async function openArchive(bytes: Buffer): Promise<{ zip: ZipFile; entries: Map<string, Entry> }> {
  const zip = await new Promise<ZipFile>((resolve, reject) => {
    fromBuffer(bytes, { lazyEntries: true, autoClose: false, strictFileNames: true }, (error, result) => {
      if (error) reject(error);
      else resolve(result!);
    });
  });
  try {
    const entries = await new Promise<Map<string, Entry>>((resolve, reject) => {
      const result = new Map<string, Entry>();
      let expanded = 0;
      zip.on('error', reject);
      zip.on('entry', (entry: Entry) => {
        expanded += entry.uncompressedSize;
        if (expanded > MAX_EXPANDED_BYTES || result.size >= 10000) {
          reject(new ReaderError('FILE_TOO_LARGE', 'EPUB 解压后的内容过大，暂时无法导入。'));
          return;
        }
        if (result.has(entry.fileName)) { reject(invalid()); return; }
        result.set(entry.fileName, entry);
        zip.readEntry();
      });
      zip.once('end', () => resolve(result));
      zip.readEntry();
    });
    return { zip, entries };
  } catch (error) {
    zip.close();
    throw error;
  }
}

function archivePath(base: string, href: string): string {
  const decoded = decodeURIComponent(href.split('#')[0]);
  if (!decoded || (decoded.includes('\\') || decoded.includes(String.fromCharCode(0))) || /^([a-z][a-z\d+.-]*:|\/)/i.test(decoded)) throw invalid();
  const resolved = path.posix.normalize(path.posix.join(base, decoded));
  if (resolved === '..' || resolved.startsWith('../')) throw invalid();
  return resolved;
}

function elements(root: Element, name: string): Element[] {
  return Array.from(root.getElementsByTagNameNS('*', name));
}

function parseXml(text: string): Element {
  // Never accept entity declarations or load external resources from a book.
  if (/<!ENTITY/i.test(text)) throw invalid();
  const document = new DOMParser({ onError: (level) => { if (level !== 'warning') throw invalid(); } })
    .parseFromString(text, 'application/xhtml+xml');
  if (!document.documentElement) throw invalid();
  return document.documentElement;
}

function cleanLabel(value: string | null | undefined): string | undefined {
  const label = value?.replace(/\s+/g, ' ').trim();
  return label ? label.slice(0, 160) : undefined;
}

function firstHeading(body: Element): string | undefined {
  for (const name of ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']) {
    const label = cleanLabel(elements(body, name)[0]?.textContent);
    if (label) return label;
  }
  return undefined;
}

async function readNavigationTitles(
  packagePath: string,
  manifest: Map<string | null, Element>,
  spine: Element,
  read: (name: string) => Promise<string>,
): Promise<Map<string, string>> {
  const titles = new Map<string, string>();
  const packageBase = path.posix.dirname(packagePath);
  const addTitle = (base: string, href: string | null, label: string | undefined) => {
    if (!href || !label) return;
    try {
      const target = archivePath(base, href);
      if (!titles.has(target)) titles.set(target, label);
    } catch {
      // A broken navigation entry should not make otherwise readable chapters unavailable.
    }
  };

  const navItem = Array.from(manifest.values()).find((item) =>
    (item.getAttribute('properties') ?? '').split(/\s+/).includes('nav'));
  if (navItem) {
    try {
      const navPath = archivePath(packageBase, navItem.getAttribute('href') ?? '');
      const navigation = parseXml(await read(navPath));
      for (const link of elements(navigation, 'a')) {
        addTitle(path.posix.dirname(navPath), link.getAttribute('href'), cleanLabel(link.textContent));
      }
    } catch {
      // Fall back to NCX or visible chapter headings.
    }
  }

  const ncxItem = manifest.get(spine.getAttribute('toc'))
    ?? Array.from(manifest.values()).find((item) =>
      item.getAttribute('media-type') === 'application/x-dtbncx+xml');
  if (ncxItem) {
    try {
      const ncxPath = archivePath(packageBase, ncxItem.getAttribute('href') ?? '');
      const navigation = parseXml(await read(ncxPath));
      for (const point of elements(navigation, 'navPoint')) {
        const label = cleanLabel(elements(elements(point, 'navLabel')[0], 'text')[0]?.textContent);
        addTitle(
          path.posix.dirname(ncxPath),
          elements(point, 'content')[0]?.getAttribute('src') ?? null,
          label,
        );
      }
    } catch {
      // Fall back to visible chapter headings.
    }
  }

  return titles;
}

function bodyText(body: Element): string {
  const output: string[] = [];
  const blocks = new Set(['p', 'div', 'section', 'article', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote', 'pre', 'tr']);
  const ignored = new Set(['script', 'style', 'head', 'svg', 'math', 'noscript']);
  // Iterative traversal also handles unusually deeply nested XHTML.
  const stack: Array<Node | string> = [body];
  while (stack.length) {
    const node = stack.pop()!;
    if (typeof node === 'string') { output.push(node); continue; }
    if (node.nodeType === 3 || node.nodeType === 4) {
      output.push((node.nodeValue ?? '').replace(/\s+/g, ' '));
      continue;
    }
    if (node.nodeType !== 1) continue;
    const element = node as Element;
    const tag = element.localName?.toLowerCase() ?? '';
    if (ignored.has(tag) || element.hasAttribute('hidden') || element.getAttribute('aria-hidden') === 'true') continue;
    if (tag === 'br' || tag === 'hr') { output.push('\n'); continue; }
    if (blocks.has(tag)) { output.push('\n'); stack.push('\n'); }
    if (tag === 'td' || tag === 'th') stack.push(' ');
    for (let index = node.childNodes.length - 1; index >= 0; index -= 1) stack.push(node.childNodes.item(index)!);
  }
  return output.join('').split('\n').map((line) => line.trim()).filter(Boolean).join('\n\n');
}

export async function processEpubBytes(bytes: Buffer) {
  let archive: Awaited<ReturnType<typeof openArchive>> | undefined;
  try {
    archive = await openArchive(bytes);
    const { zip, entries } = archive;
    let readBytes = 0;
    const read = async (name: string): Promise<string> => {
      const entry = entries.get(name);
      if (!entry || entry.isEncrypted()) throw invalid();
      if (entry.uncompressedSize > MAX_DOCUMENT_BYTES) throw new ReaderError('FILE_TOO_LARGE', 'EPUB 单章内容过大，暂时无法导入。');
      const stream = await new Promise<import('node:stream').Readable>((resolve, reject) => {
        zip.openReadStream(entry, (error, result) => error ? reject(error) : resolve(result!));
      });
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of stream) {
        size += chunk.length;
        readBytes += chunk.length;
        if (size > MAX_DOCUMENT_BYTES || readBytes > MAX_EXPANDED_BYTES) {
          stream.destroy();
          throw new ReaderError('FILE_TOO_LARGE', 'EPUB 解压后的内容过大，暂时无法导入。');
        }
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);
      const utf16 = buffer[0] === 0xff && buffer[1] === 0xfe ? 'utf-16le'
        : buffer[0] === 0xfe && buffer[1] === 0xff ? 'utf-16be' : 'utf-8';
      return new TextDecoder(utf16, { fatal: true }).decode(buffer);
    };
    if ((await read('mimetype')).trim() !== 'application/epub+zip') throw invalid();
    const container = parseXml(await read('META-INF/container.xml'));
    const rootfile = elements(container, 'rootfile').find((item) => item.getAttribute('media-type') === 'application/oebps-package+xml');
    const packagePath = archivePath('', rootfile?.getAttribute('full-path') ?? '');
    const packageRoot = parseXml(await read(packagePath));
    if (packageRoot.localName !== 'package') throw invalid();
    const metadata = elements(packageRoot, 'metadata')[0];
    const title = metadata ? elements(metadata, 'title')[0]?.textContent?.trim() : undefined;
    const author = metadata
      ? elements(metadata, 'creator').map((item) => cleanLabel(item.textContent)).filter(Boolean).join('、') || undefined
      : undefined;
    const manifest = new Map(elements(packageRoot, 'item').map((item) => [item.getAttribute('id'), item]));
    const spine = elements(packageRoot, 'spine')[0];
    if (!spine) throw invalid();
    const navigationTitles = await readNavigationTitles(packagePath, manifest, spine, read);
    const chapterAnchors: BookChapter[] = [];
    let content = '';
    for (const reference of elements(spine, 'itemref')) {
      if (reference.getAttribute('linear') === 'no') continue;
      const item = manifest.get(reference.getAttribute('idref'));
      if (!item || item.getAttribute('media-type') !== 'application/xhtml+xml') throw invalid();
      const chapterPath = archivePath(path.posix.dirname(packagePath), item.getAttribute('href') ?? '');
      const document = parseXml(await read(chapterPath));
      const body = elements(document, 'body')[0];
      if (!body) throw invalid();
      const text = bodyText(body);
      if (text) {
        if (content) content += '\n\n';
        const charOffset = content.length;
        content += text;
        chapterAnchors.push({
          title: navigationTitles.get(chapterPath) ?? firstHeading(body) ?? `第 ${chapterAnchors.length + 1} 章`,
          charOffset,
        });
      }
    }
    if (!content.trim()) throw new ReaderError('EMPTY_FILE');
    return {
      content,
      title,
      author,
      chapters: chapterAnchors,
      characterLength: content.length,
      id: createHash('sha256').update(content, 'utf8').digest('hex'),
    };
  } catch (error) {
    if (error instanceof ReaderError) throw error;
    throw new ReaderError('INVALID_EPUB', undefined, { cause: error });
  } finally {
    archive?.zip.close();
  }
}
