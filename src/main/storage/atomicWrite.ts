import { open, rename, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

export type AtomicTextWriter = (targetPath: string, content: string) => Promise<void>;

export const atomicWriteText: AtomicTextWriter = async (targetPath, content) => {
  const temporaryPath = `${targetPath}.${process.pid}.${randomUUID()}.tmp`;
  const fileHandle = await open(temporaryPath, 'wx');

  try {
    await fileHandle.writeFile(content, { encoding: 'utf8' });
    await fileHandle.sync();
  } finally {
    await fileHandle.close();
  }

  try {
    await rename(temporaryPath, targetPath);
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
};
