import { afterEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { loadPlaywright, supportsInspectorWithApi } from '../utils/playwright-loader';

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-loader-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('loadPlaywright', () => {
  it('prefers playwright installed in the project', () => {
    const project = makeTempDir();
    const pkgDir = path.join(project, 'node_modules', 'playwright');
    fs.mkdirSync(pkgDir, { recursive: true });
    fs.writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify({ name: 'playwright', version: '1.63.0' }));
    fs.writeFileSync(path.join(pkgDir, 'index.js'), "module.exports = { fake: true };");

    const loaded = loadPlaywright(project);

    expect(loaded.version).toBe('1.63.0');
    expect(fs.realpathSync(loaded.dir)).toBe(fs.realpathSync(pkgDir));
    expect(loaded.playwright).toEqual({ fake: true });
  });

  it('falls back to the bundled playwright when the project has none', () => {
    const loaded = loadPlaywright(makeTempDir());

    expect(loaded.dir).toBe(path.dirname(require.resolve('playwright/package.json')));
    expect(typeof loaded.playwright.chromium.launch).toBe('function');
  });
});

describe('supportsInspectorWithApi', () => {
  it.each([
    ['1.59.1', true],
    ['1.62.0', true],
    ['1.63.0', false],
    ['1.64.0-alpha-2026-09-28', false],
    ['2.0.0', false],
  ])('%s → %s', (version, expected) => {
    expect(supportsInspectorWithApi(version)).toBe(expected);
  });
});
