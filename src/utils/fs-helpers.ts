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
  await ensureDir(baseDir);

  for (let attempt = 0; attempt < 10; attempt++) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const suffix = Math.random().toString(36).slice(2, 8);
    const dirName = `test-${timestamp}-${suffix}`;
    const fullPath = path.join(baseDir, dirName);

    try {
      await fs.promises.mkdir(fullPath, { recursive: false });
      await fs.promises.mkdir(path.join(fullPath, 'screenshots'), { recursive: false });
      return fullPath;
    } catch (err: any) {
      if (err?.code !== 'EEXIST') throw err;
    }
  }

  throw new Error(`Could not create unique output directory in ${baseDir}`);
}
