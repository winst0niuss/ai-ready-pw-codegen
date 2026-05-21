import archiver from 'archiver';
import fs from 'fs';
import path from 'path';

export function createArchive(outputDir: string): Promise<string> {
  const dirName = path.basename(outputDir);
  const parentDir = path.dirname(outputDir);
  const { stream, archivePath } = openUniqueArchive(parentDir, dirName);

  return new Promise((resolve, reject) => {
    const archive = archiver('zip', { zlib: { level: 6 } });

    stream.on('error', reject);
    stream.on('close', () => resolve(archivePath));
    archive.on('error', reject);

    archive.pipe(stream);
    archive.directory(outputDir, dirName);
    archive.finalize();
  });
}

function openUniqueArchive(
  parentDir: string,
  dirName: string,
): { stream: fs.WriteStream; archivePath: string } {
  const names = [`${dirName}.zip`, ...Array.from({ length: 100 }, (_, i) => `${dirName}-${i + 1}.zip`)];
  for (const name of names) {
    const archivePath = path.join(parentDir, name);
    try {
      // openSync with 'wx' atomically checks and creates the file, throws EEXIST if it already exists
      const fd = fs.openSync(archivePath, 'wx');
      const stream = fs.createWriteStream(archivePath, { fd });
      return { stream, archivePath };
    } catch (err: any) {
      if (err.code !== 'EEXIST') throw err;
    }
  }
  throw new Error(`Could not create unique archive path for ${dirName}`);
}
