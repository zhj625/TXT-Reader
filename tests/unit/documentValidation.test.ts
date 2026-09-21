import { mkdtemp, mkdir, readFile, writeFile, copyFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

let fixtureRoot: string;
beforeEach(async () => {
  fixtureRoot = await mkdtemp(path.join(os.tmpdir(), 'moodu-doc-validation-'));
  await mkdir(path.join(fixtureRoot, 'tests'));
  await mkdir(path.join(fixtureRoot, 'docs'));
});
afterEach(async () => { await rm(fixtureRoot, { recursive: true, force: true }); });

async function runValidation(kind: 'technical' | 'product', newline: string, missingHeading = false) {
  for (const name of ['TECHNICAL_DESIGN.md', 'PRODUCT_DESIGN.md']) {
    let content = (await readFile(path.resolve('docs', name), 'utf8')).replace(/\r\n?/g, '\n');
    if (missingHeading && name === 'TECHNICAL_DESIGN.md') content = content.replace('## 3. 技术栈', '## 3. 错误标题');
    await writeFile(path.join(fixtureRoot, 'docs', name), content.replace(/\n/g, newline));
  }
  const scriptName = `validate-${kind}-design.ps1`;
  const scriptPath = path.join(fixtureRoot, 'tests', scriptName);
  await copyFile(path.resolve('tests', scriptName), scriptPath);
  return spawnSync('pwsh', ['-NoProfile', '-File', scriptPath], { encoding: 'utf8', timeout: 20000, windowsHide: true });
}

it.each([
  ['technical', '\n'], ['technical', '\r\n'], ['product', '\n'], ['product', '\r\n'],
] as const)('validates %s documents with %j line endings', async (kind, newline) => {
  const result = await runValidation(kind, newline);
  expect(result.status, result.stderr || result.error?.message).toBe(0);
  expect(result.stdout).toContain('validation passed');
}, 30000);

it('still rejects a document with a missing required heading after normalization', async () => {
  const result = await runValidation('technical', '\r\n', true);
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain('missing required pattern');
}, 30000);
