import { createTextChunks, findChunkIndex } from '../../src/shared/textChunks';

describe('text chunking', () => {
  it('preserves every character while preferring paragraph boundaries', () => {
    const content = `${'甲'.repeat(900)}\n${'乙'.repeat(900)}\n${'丙'.repeat(900)}`;
    const chunks = createTextChunks(content, 1_000);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.map((chunk) => chunk.text).join('')).toBe(content);
    expect(chunks[0].text.endsWith('\n')).toBe(true);
    expect(chunks.every((chunk, index) => chunk.index === index)).toBe(true);
  });

  it('splits a paragraph without newlines into bounded chunks', () => {
    const content = '长'.repeat(2_550);
    const chunks = createTextChunks(content, 1_000);

    expect(chunks.map((chunk) => chunk.text.length)).toEqual([1_000, 1_000, 550]);
    expect(chunks.map((chunk) => chunk.text).join('')).toBe(content);
  });

  it('finds the chunk containing a restored character offset', () => {
    const chunks = createTextChunks('a'.repeat(2_500), 1_000);

    expect(findChunkIndex(chunks, -1)).toBe(0);
    expect(findChunkIndex(chunks, 999)).toBe(0);
    expect(findChunkIndex(chunks, 1_000)).toBe(1);
    expect(findChunkIndex(chunks, 99_000)).toBe(2);
  });

  it('rejects unusably small chunk sizes', () => {
    expect(() => createTextChunks('text', 10)).toThrow(RangeError);
  });
});
