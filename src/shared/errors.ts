import type { ReaderErrorCode } from './contracts';

const ERROR_MESSAGES: Record<ReaderErrorCode, string> = {
  EMPTY_FILE: '这个文件没有可阅读的文字。',
  FILE_TOO_LARGE: '文件超过 50 MiB，暂时无法导入。',
  UNSUPPORTED_OR_INVALID_TEXT: '无法识别这个 TXT 的文字编码，请确认文件内容有效。',
  DUPLICATE_BOOK: '这本书已经在书架中了。',
  BOOK_NOT_FOUND: '找不到这本书，它可能已被移除。',
  STORAGE_UNAVAILABLE: '本地书库暂时无法访问，请检查磁盘空间或文件权限。',
  INVALID_INPUT: '操作参数无效，请重试。',
  UNKNOWN_ERROR: '操作没有完成，请稍后重试。',
};

export class ReaderError extends Error {
  constructor(
    public readonly code: ReaderErrorCode,
    message = ERROR_MESSAGES[code],
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'ReaderError';
  }
}

export function getErrorMessage(code: ReaderErrorCode): string {
  return ERROR_MESSAGES[code];
}

export function toReaderError(error: unknown): ReaderError {
  return error instanceof ReaderError
    ? error
    : new ReaderError('UNKNOWN_ERROR', undefined, { cause: error });
}
