import { spawnSync } from 'child_process';
import path from 'path';

export function createArchive(outputDir: string): string {
  const dirName = path.basename(outputDir);
  const parentDir = path.dirname(outputDir);
  const archivePath = path.join(parentDir, `${dirName}.tar.gz`);

  const result = spawnSync('tar', ['-czf', archivePath, '-C', parentDir, dirName]);
  if (result.status !== 0) {
    const stderr = result.stderr?.toString() || 'unknown error';
    throw new Error(`Failed to create archive: ${stderr}`);
  }
  return archivePath;
}
