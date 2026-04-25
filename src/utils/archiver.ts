import archiver from 'archiver';
import fs from 'fs';
import path from 'path';

export function createArchive(outputDir: string): Promise<string> {
  const dirName = path.basename(outputDir);
  const parentDir = path.dirname(outputDir);
  const archivePath = path.join(parentDir, `${dirName}.zip`);

  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(archivePath);
    const archive = archiver('zip', { zlib: { level: 6 } });

    output.on('error', reject);
    output.on('close', () => {
      try {
        fs.rmSync(outputDir, { recursive: true, force: true });
      } catch (err) {
        console.warn(`⚠ Could not delete recording directory: ${err instanceof Error ? err.message : err}`);
      }
      resolve(archivePath);
    });
    archive.on('error', reject);

    archive.pipe(output);
    archive.directory(outputDir, dirName);
    archive.finalize();
  });
}
