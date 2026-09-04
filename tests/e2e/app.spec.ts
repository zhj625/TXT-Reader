import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';
import iconv from 'iconv-lite';

async function launchApp(userDataPath: string, importPath?: string): Promise<ElectronApplication> {
  return electron.launch({
    args: [path.resolve('.vite', 'build', 'main.cjs')],
    env: {
      ...process.env,
      READER_E2E: '1',
      READER_E2E_USER_DATA: userDataPath,
      ...(importPath ? { READER_E2E_IMPORT_PATH: importPath } : {}),
    },
  });
}

function packagedExecutablePath(): string {
  return path.resolve('out', 'TXT Reader-win32-x64', 'txt-reader.exe');
}

async function runPackagedImportSmoke(userDataPath: string, importPath: string): Promise<number | null> {
  return new Promise((resolve, reject) => {
    const child = spawn(packagedExecutablePath(), [], {
      env: {
        ...process.env,
        READER_E2E: '1',
        READER_E2E_AUTO_IMPORT: '1',
        READER_E2E_USER_DATA: userDataPath,
        READER_E2E_IMPORT_PATH: importPath,
      },
      stdio: 'pipe',
    });
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('Packaged application smoke test timed out'));
    }, 20_000);
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('exit', (code) => {
      clearTimeout(timer);
      resolve(code);
    });
  });
}

test.describe('TXT Reader desktop flow', () => {
  let testPath: string;
  let launchedApps: ElectronApplication[];

  test.beforeEach(async () => {
    testPath = await mkdtemp(path.join(os.tmpdir(), 'moodu-e2e-'));
    launchedApps = [];
  });

  test.afterEach(async () => {
    await Promise.allSettled(launchedApps.map((app) => app.close()));
    await rm(testPath, { recursive: true, force: true });
  });

  const launchTrackedApp = async (userDataPath: string, importPath?: string) => {
    const app = await launchApp(userDataPath, importPath);
    launchedApps.push(app);
    return app;
  };

  test('imports, reads, restores, rejects duplicates and removes without deleting the original', async () => {
    const originalPath = path.join(testPath, '山河入梦.txt');
    const content = Array.from({ length: 1_200 }, (_, index) => `第 ${index + 1} 段\n山河入梦来，明月照归途。\n`).join('\n');
    await writeFile(originalPath, content, 'utf8');
    const userDataPath = path.join(testPath, 'user-data');
    let app = await launchTrackedApp(userDataPath, originalPath);
    let page = await app.firstWindow();

    await expect(page.getByTestId('bookshelf-page')).toBeVisible();
    await page.getByTestId('import-book').click();
    await expect(page.getByTestId('reader-page')).toBeVisible();
    await expect(page.getByText('山河入梦来，明月照归途。').first()).toBeVisible();

    await page.getByTestId('reading-scroller').evaluate((element) => {
      element.scrollTop = element.scrollHeight * 0.55;
      element.dispatchEvent(new Event('scroll'));
    });
    await page.waitForTimeout(700);
    await page.getByRole('button', { name: /书架/ }).click();
    await expect(page.getByText('继续阅读')).toBeVisible();

    await page.getByTestId('import-book').click();
    await expect(page.getByRole('status')).toContainText('已经在书架中了');
    await app.close();

    app = await launchTrackedApp(userDataPath, originalPath);
    page = await app.firstWindow();
    const card = page.locator('[data-testid^="book-"]');
    await expect(card).toContainText('山河入梦');
    await expect(card).toContainText('继续阅读');

    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: '移除《山河入梦》' }).click();
    await expect(page.getByTestId('empty-shelf')).toBeVisible();
    expect(await readFile(originalPath, 'utf8')).toBe(content);
    await app.close();
  });

  test('renders GB18030 Chinese text correctly', async () => {
    const originalPath = path.join(testPath, '旧城.txt');
    await writeFile(originalPath, iconv.encode('旧城烟雨，故人归来。', 'gb18030'));
    const app = await launchTrackedApp(path.join(testPath, 'user-data'), originalPath);
    const page = await app.firstWindow();

    await page.getByTestId('import-book').click();
    await expect(page.getByText('旧城烟雨，故人归来。')).toBeVisible();
    await app.close();
  });

  test('the hardened packaged executable can import GB18030 using its bundled worker dependency', async () => {
    const originalPath = path.join(testPath, '打包验证.txt');
    const userDataPath = path.join(testPath, 'packaged-user-data');
    await writeFile(originalPath, iconv.encode('打包后的中文编码工作线程正常。', 'gb18030'));

    expect(await runPackagedImportSmoke(userDataPath, originalPath)).toBe(0);

    const library = JSON.parse(await readFile(path.join(userDataPath, 'library.json'), 'utf8')) as {
      books: Array<{ id: string; title: string }>;
    };
    expect(library.books).toHaveLength(1);
    expect(library.books[0].title).toBe('打包验证');
    expect(await readFile(path.join(userDataPath, 'books', `${library.books[0].id}.txt`), 'utf8'))
      .toBe('打包后的中文编码工作线程正常。');
  });
});
