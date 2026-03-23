import fs from 'fs';
import path from 'path';

export function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

export function writeScreenshot(filePath: string, buffer: Buffer): void {
  fs.writeFileSync(filePath, buffer);
}

export function generateOutputDir(baseDir: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const dirName = `recording-${timestamp}`;
  const fullPath = path.join(baseDir, dirName);
  ensureDir(path.join(fullPath, 'screenshots'));
  return fullPath;
}
