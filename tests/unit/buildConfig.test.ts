import { readFile } from 'node:fs/promises';
import path from 'node:path';

describe('Windows build configuration', () => {
  it('keeps the release version in package.json and the lockfile aligned', async () => {
    const packageJson = JSON.parse(await readFile(path.resolve('package.json'), 'utf8')) as {
      version: string;
    };
    const lockfile = JSON.parse(await readFile(path.resolve('package-lock.json'), 'utf8')) as {
      version: string;
      packages: { '': { version: string } };
    };

    expect(packageJson.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(lockfile.version).toBe(packageJson.version);
    expect(lockfile.packages[''].version).toBe(packageJson.version);
  });

  it('routes make through a reversible ASCII-path wrapper', async () => {
    const packageJson = JSON.parse(await readFile(path.resolve('package.json'), 'utf8')) as {
      dependencies: Record<string, string>;
      scripts: Record<string, string>;
      version: string;
    };
    const makeScript = await readFile(path.resolve('scripts', 'make-windows.ps1'), 'utf8');

    expect(packageJson.scripts.make).toContain('scripts/make-windows.ps1');
    expect(packageJson.dependencies['electron-squirrel-startup']).toBe('1.0.1');
    expect(packageJson.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(makeScript).toContain("$repositoryRoot -notmatch '[^\\x00-\\x7F]'");
    expect(makeScript).toContain('& subst $mappedDrive $repositoryRoot');
    expect(makeScript).toContain('& subst $mappedDrive /D');
    expect(makeScript).toMatch(/try \{[\s\S]+finally \{/);
  });
});
