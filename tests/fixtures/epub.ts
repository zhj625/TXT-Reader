import { deflateRawSync } from 'node:zlib';

// Small deterministic ZIP writer for real EPUB fixtures (no filesystem extraction).
export function zipFiles(files: Record<string, string>): Buffer {
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const filename = Buffer.from(name);
    const bytes = Buffer.from(text);
    const method = name === 'mimetype' ? 0 : 8;
    const compressed = method === 0 ? bytes : deflateRawSync(bytes);
    let crc = 0xffffffff;
    for (const byte of bytes) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    crc = (crc ^ 0xffffffff) >>> 0;
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x800, 6);
    header.writeUInt16LE(method, 8);
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(compressed.length, 18);
    header.writeUInt32LE(bytes.length, 22);
    header.writeUInt16LE(filename.length, 26);
    local.push(header, filename, compressed);
    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50, 0);
    directory.writeUInt16LE(20, 4);
    header.copy(directory, 6, 4, 30);
    directory.writeUInt32LE(offset, 42);
    central.push(directory, filename);
    offset += header.length + filename.length + compressed.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(local.length / 3, 8);
  end.writeUInt16LE(local.length / 3, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directory, end]);
}

export function epubFiles(version = '3.0'): Record<string, string> {
  const isEpub3 = version === '3.0';
  const navigationManifest = isEpub3
    ? '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>'
    : '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>';
  const spineAttributes = isEpub3 ? '' : ' toc="ncx"';
  const files: Record<string, string> = {
    mimetype: 'application/epub+zip',
    'META-INF/container.xml': '<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OPS/book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
    'OPS/book.opf': '<package xmlns="http://www.idpf.org/2007/opf" version="' + version + '"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>山河 &amp; 故人</dc:title><dc:creator>汤姆 · 霍加德</dc:creator></metadata><manifest><item id="two" href="Text/two.xhtml" media-type="application/xhtml+xml"/><item id="one" href="Text/%E4%B8%80.xhtml" media-type="application/xhtml+xml"/><item id="extra" href="extra.xhtml" media-type="application/xhtml+xml"/>' + navigationManifest + '</manifest><spine' + spineAttributes + '><itemref idref="one"/><itemref idref="two"/><itemref idref="extra" linear="no"/></spine></package>',
    'OPS/Text/two.xhtml': '<html xmlns="http://www.w3.org/1999/xhtml"><body><h1>第二章</h1><p>故人归来。</p></body></html>',
    'OPS/Text/一.xhtml': '<html xmlns="http://www.w3.org/1999/xhtml"><head><title>不应显示</title></head><body><h1>第一章</h1><p>山河<em>入梦</em>，明月 &amp; 星辰。<br/>下一行。</p><script>不要执行</script><style>不要显示</style><p hidden="hidden">隐藏文字</p></body></html>',
  };
  if (isEpub3) {
    files['OPS/nav.xhtml'] = '<html xmlns="http://www.w3.org/1999/xhtml"><body><nav><ol><li><a href="Text/%E4%B8%80.xhtml">壹 · 山河入梦</a></li><li><a href="Text/two.xhtml">贰 · 故人归来</a></li></ol></nav></body></html>';
  } else {
    files['OPS/toc.ncx'] = '<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/"><navMap><navPoint><navLabel><text>壹 · 山河入梦</text></navLabel><content src="Text/%E4%B8%80.xhtml"/></navPoint><navPoint><navLabel><text>贰 · 故人归来</text></navLabel><content src="Text/two.xhtml"/></navPoint></navMap></ncx>';
  }
  return files;
}

export const expectedEpubText = '第一章\n\n山河入梦，明月 & 星辰。\n\n下一行。\n\n第二章\n\n故人归来。';
