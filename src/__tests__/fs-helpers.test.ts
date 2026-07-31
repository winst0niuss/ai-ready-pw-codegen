import { afterEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createArchive } from '../utils/archiver';
import { generateOutputDir } from '../utils/fs-helpers';

const tempRoots: string[] = [];

function makeTempRoot(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-ready-pw-codegen-'));
  tempRoots.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempRoots.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('generateOutputDir', () => {
  it('returns unique directories for consecutive calls', async () => {
    const baseDir = makeTempRoot();

    const first = await generateOutputDir(baseDir);
    const second = await generateOutputDir(baseDir);

    expect(first).not.toBe(second);
    expect(fs.existsSync(path.join(first, 'screenshots'))).toBe(true);
    expect(fs.existsSync(path.join(second, 'screenshots'))).toBe(true);
  });
});

describe('createArchive', () => {
  it('does not overwrite an existing archive path', async () => {
    const baseDir = makeTempRoot();
    const outputDir = path.join(baseDir, 'recording');
    fs.mkdirSync(outputDir);
    fs.writeFileSync(path.join(outputDir, 'actions.jsonl'), '{}\n');
    fs.writeFileSync(path.join(baseDir, 'recording.zip'), 'existing');

    const { archivePath } = await createArchive(outputDir);

    expect(archivePath).toBe(path.join(baseDir, 'recording-1.zip'));
    expect(fs.readFileSync(path.join(baseDir, 'recording.zip'), 'utf-8')).toBe('existing');
    expect(fs.existsSync(archivePath)).toBe(true);
  });

  it('reports written bytes and no warnings for a healthy archive', async () => {
    const baseDir = makeTempRoot();
    const outputDir = path.join(baseDir, 'recording');
    fs.mkdirSync(outputDir);
    fs.writeFileSync(path.join(outputDir, 'actions.jsonl'), '{}\n');

    const { bytes, warnings } = await createArchive(outputDir);

    expect(bytes).toBeGreaterThan(0);
    expect(warnings).toEqual([]);
  });

  // chmod не действует на root, а под Windows не даёт EACCES
  const canBlockRead = process.platform !== 'win32' && process.getuid?.() !== 0;

  it.skipIf(!canBlockRead)('rejects and removes the partial archive when a file cannot be read', async () => {
    const baseDir = makeTempRoot();
    const outputDir = path.join(baseDir, 'recording');
    const locked = path.join(outputDir, 'screenshots');
    fs.mkdirSync(locked, { recursive: true });
    fs.writeFileSync(path.join(outputDir, 'actions.jsonl'), '{}\n');
    fs.writeFileSync(path.join(locked, '001.jpg'), 'x');
    fs.chmodSync(locked, 0o000);

    try {
      await expect(createArchive(outputDir)).rejects.toThrow(/EACCES/);
      // Огрызок архива не должен остаться: его легко принять за готовый
      expect(fs.existsSync(path.join(baseDir, 'recording.zip'))).toBe(false);
      expect(fs.existsSync(path.join(outputDir, 'actions.jsonl'))).toBe(true);
    } finally {
      fs.chmodSync(locked, 0o755);
    }
  });

  it('does not delete the source directory', async () => {
    const baseDir = makeTempRoot();
    const outputDir = path.join(baseDir, 'recording');
    fs.mkdirSync(outputDir);
    fs.writeFileSync(path.join(outputDir, 'actions.jsonl'), '{}\n');

    await createArchive(outputDir);

    expect(fs.existsSync(outputDir)).toBe(true);
  });
});
