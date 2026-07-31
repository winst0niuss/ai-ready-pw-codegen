import { afterEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { JsonlWriter } from '../utils/jsonl-writer';

const tempRoots: string[] = [];

function makeWriter(): { writer: JsonlWriter; filePath: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jsonl-writer-'));
  tempRoots.push(dir);
  const filePath = path.join(dir, 'actions.jsonl');
  return { writer: new JsonlWriter(filePath), filePath };
}

function readLines(filePath: string): string[] {
  return fs.readFileSync(filePath, 'utf-8').split('\n').filter(Boolean);
}

afterEach(() => {
  for (const dir of tempRoots.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('JsonlWriter', () => {
  it('flushes earlier lines to disk without waiting for close', async () => {
    const { writer, filePath } = makeWriter();

    await writer.write(1, '{"index":1}');
    await writer.write(2, '{"index":2}');
    await writer.write(3, '{"index":3}');

    // Строки 1 и 2 уже на диске, третья ещё в буфере — её может перезаписать actionUpdated
    expect(readLines(filePath)).toEqual(['{"index":1}', '{"index":2}']);

    await writer.close();
    expect(readLines(filePath)).toEqual(['{"index":1}', '{"index":2}', '{"index":3}']);
  });

  it('overwrites the buffered line for the same index', async () => {
    const { writer, filePath } = makeWriter();

    await writer.write(1, '{"value":"a"}');
    await writer.write(1, '{"value":"ab"}');
    await writer.write(1, '{"value":"abc"}');
    await writer.close();

    expect(readLines(filePath)).toEqual(['{"value":"abc"}']);
  });

  it('counts updates arriving after the line was flushed', async () => {
    const { writer, filePath } = makeWriter();

    await writer.write(1, '{"index":1}');
    await writer.write(2, '{"index":2}');
    await writer.write(1, '{"index":1,"late":true}');

    const { staleUpdates } = await writer.close();

    expect(staleUpdates).toBe(1);
    expect(readLines(filePath)).toEqual(['{"index":1}', '{"index":2}']);
  });

  it('creates an empty file when nothing was recorded', async () => {
    const { writer, filePath } = makeWriter();

    await writer.close();

    expect(fs.existsSync(filePath)).toBe(true);
    expect(fs.readFileSync(filePath, 'utf-8')).toBe('');
  });

  it('does not truncate the file if close runs twice', async () => {
    const { writer, filePath } = makeWriter();

    await writer.write(1, '{"index":1}');
    await writer.close();
    await writer.close();

    expect(readLines(filePath)).toEqual(['{"index":1}']);
  });
});
