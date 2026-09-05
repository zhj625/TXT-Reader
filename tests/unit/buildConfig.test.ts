import { readFile } from 'node:fs/promises';
import path from 'node:path';

describe('Windows build configuration', () => {
  it('routes make through a reversible ASCII-path wrapper', async () => {
    const packageJson = JSON.parse(await readFile(path.resolve('package.json'), 'utf8')) as {
      dependencies: Record<string, string>;
      scripts: Record<string, string>;
      version: string;
    };
    const makeScript = await readFile(path.resolve('scripts', 'make-windows.ps1'), 'utf8');

    expect(packageJson.scripts.make).toContain('scripts/make-windows.ps1');
    expect(packageJson.dependencies['electron-squirrel-startup']).toBe('1.0.1');
    expect(packageJson.version).toBe('0.1.1');
    expect(makeScript).toContain("$repositoryRoot -notmatch '[^\\x00-\\x7F]'");
    expect(makeScript).toContain('& subst $mappedDrive $repositoryRoot');
    expect(makeScript).toContain('& subst $mappedDrive /D');
    expect(makeScript).toMatch(/try \{[\s\S]+finally \{/);
  });
});
