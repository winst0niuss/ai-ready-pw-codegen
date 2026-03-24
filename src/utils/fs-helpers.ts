import fs from 'fs';
import path from 'path';

export async function ensureDir(dirPath: string): Promise<void> {
  await fs.promises.mkdir(dirPath, { recursive: true });
}

export async function writeScreenshot(filePath: string, buffer: Buffer): Promise<void> {
  await fs.promises.writeFile(filePath, buffer);
}

export function copyDocsToOutput(outputDir: string): void {
  const docsDir = path.join(__dirname, '..', '..', 'docs');
  if (!fs.existsSync(docsDir)) return;

  const files = fs.readdirSync(docsDir).filter((f) => f.endsWith('.md'));
  for (const file of files) {
    fs.copyFileSync(path.join(docsDir, file), path.join(outputDir, file));
  }
}

export async function generateOutputDir(baseDir: string): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const dirName = `test-${timestamp}`;
  const fullPath = path.join(baseDir, dirName);
  await ensureDir(path.join(fullPath, 'screenshots'));
  return fullPath;
}
