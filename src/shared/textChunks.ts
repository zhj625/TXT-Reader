export interface TextChunk {
  index: number;
  startOffset: number;
  endOffset: number;
  text: string;
}

const DEFAULT_MAX_CHUNK_LENGTH = 3_200;
const MIN_PARAGRAPH_SPLIT = 800;
const FORWARD_NEWLINE_TOLERANCE = 480;

export function createTextChunks(
  content: string,
  maxChunkLength = DEFAULT_MAX_CHUNK_LENGTH,
): TextChunk[] {
  if (content.length === 0) {
    return [];
  }

  if (!Number.isInteger(maxChunkLength) || maxChunkLength < 100) {
    throw new RangeError('maxChunkLength must be an integer of at least 100');
  }

  const chunks: TextChunk[] = [];
  let cursor = 0;

  while (cursor < content.length) {
    const hardEnd = Math.min(cursor + maxChunkLength, content.length);
    let endOffset = hardEnd;

    if (hardEnd < content.length) {
      const previousNewline = content.lastIndexOf('\n', hardEnd);
      const forwardNewline = content.indexOf('\n', hardEnd);

      if (previousNewline >= cursor + Math.min(MIN_PARAGRAPH_SPLIT, maxChunkLength / 2)) {
        endOffset = previousNewline + 1;
      } else if (
        forwardNewline !== -1 &&
        forwardNewline <= hardEnd + FORWARD_NEWLINE_TOLERANCE
      ) {
        endOffset = forwardNewline + 1;
      }
    }

    if (endOffset <= cursor) {
      endOffset = hardEnd;
    }

    chunks.push({
      index: chunks.length,
      startOffset: cursor,
      endOffset,
      text: content.slice(cursor, endOffset),
    });
    cursor = endOffset;
  }

  return chunks;
}

export function findChunkIndex(chunks: TextChunk[], charOffset: number): number {
  if (chunks.length === 0) {
    return 0;
  }

  const normalizedOffset = Math.max(0, charOffset);
  let low = 0;
  let high = chunks.length - 1;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const chunk = chunks[middle];

    if (normalizedOffset < chunk.startOffset) {
      high = middle - 1;
    } else if (normalizedOffset >= chunk.endOffset && middle < chunks.length - 1) {
      low = middle + 1;
    } else {
      return middle;
    }
  }

  return Math.min(low, chunks.length - 1);
}
