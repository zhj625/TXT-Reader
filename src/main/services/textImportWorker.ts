import { Worker } from 'node:worker_threads';
import { ReaderError } from '../../shared/errors';

export interface ProcessedText {
  content: string;
  id: string;
  characterLength: number;
  encoding: 'utf8' | 'gb18030';
}

interface WorkerSuccess {
  ok: true;
  value: ProcessedText;
}

interface WorkerFailure {
  ok: false;
  code: 'EMPTY_FILE' | 'UNSUPPORTED_OR_INVALID_TEXT';
  message: string;
}

const WORKER_SOURCE = String.raw`
const { parentPort } = require('node:worker_threads');
const { createHash } = require('node:crypto');
function normalizeText(text) {
  return text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
}

function assertReadableText(text) {
  if (text.trim().length === 0) {
    const error = new Error('这个文件没有可阅读的文字。');
    error.code = 'EMPTY_FILE';
    throw error;
  }

  let controls = 0;
  let replacements = 0;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code === 0xfffd) replacements += 1;
    if ((code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0c) || code === 0x7f) {
      controls += 1;
    }
  }

  if (controls / text.length > 0.005 || replacements / text.length > 0.001) {
    const error = new Error('文本包含过多无效字符。');
    error.code = 'UNSUPPORTED_OR_INVALID_TEXT';
    throw error;
  }
}

function decode(bytes, iconv) {
  const hasUtf8Bom = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  try {
    const content = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return { content, encoding: 'utf8' };
  } catch (error) {
    if (hasUtf8Bom) throw error;
    return { content: iconv.decode(Buffer.from(bytes), 'gb18030'), encoding: 'gb18030' };
  }
}

parentPort.once('message', ({ bytes, iconvModulePath }) => {
  try {
    const iconv = require(iconvModulePath);
    const decoded = decode(new Uint8Array(bytes), iconv);
    const content = normalizeText(decoded.content);
    assertReadableText(content);
    parentPort.postMessage({
      ok: true,
      value: {
        content,
        id: createHash('sha256').update(content, 'utf8').digest('hex'),
        characterLength: content.length,
        encoding: decoded.encoding,
      },
    });
  } catch (error) {
    parentPort.postMessage({
      ok: false,
      code: error.code === 'EMPTY_FILE' ? 'EMPTY_FILE' : 'UNSUPPORTED_OR_INVALID_TEXT',
      message: error.message,
    });
  }
});
`;

export function processTextBytesInWorker(
  bytes: Uint8Array,
  iconvModulePath = 'iconv-lite',
): Promise<ProcessedText> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(WORKER_SOURCE, { eval: true });
    const transferable = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer;
    let settled = false;

    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      callback();
      void worker.terminate();
    };

    worker.once('message', (result: WorkerSuccess | WorkerFailure) => {
      if (result.ok) {
        finish(() => resolve(result.value));
      } else {
        finish(() => reject(new ReaderError(result.code, result.message)));
      }
    });
    worker.once('error', (error) => {
      finish(() => reject(new ReaderError('UNKNOWN_ERROR', '文本处理工作线程异常退出。', { cause: error })));
    });
    worker.once('exit', (code) => {
      if (!settled && code !== 0) {
        finish(() => reject(new ReaderError('UNKNOWN_ERROR', '文本处理工作线程异常退出。')));
      }
    });
    worker.postMessage({ bytes: transferable, iconvModulePath }, [transferable]);
  });
}
