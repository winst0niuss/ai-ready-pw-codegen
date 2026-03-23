import fs from 'fs';
import path from 'path';

export async function ensureDir(dirPath: string): Promise<void> {
  await fs.promises.mkdir(dirPath, { recursive: true });
}

export async function writeScreenshot(filePath: string, buffer: Buffer): Promise<void> {
  await fs.promises.writeFile(filePath, buffer);
}

export async function generateOutputDir(baseDir: string): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const dirName = `recording-${timestamp}`;
  const fullPath = path.join(baseDir, dirName);
  await ensureDir(path.join(fullPath, 'screenshots'));
  return fullPath;
}
