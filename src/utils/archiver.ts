import { execSync } from 'child_process';
import path from 'path';

export function createArchive(outputDir: string): string {
  const dirName = path.basename(outputDir);
  const parentDir = path.dirname(outputDir);
  const archivePath = path.join(parentDir, `${dirName}.tar.gz`);

  execSync(`tar -czf "${archivePath}" -C "${parentDir}" "${dirName}"`);
  return archivePath;
}
