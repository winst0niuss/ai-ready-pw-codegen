import archiver from 'archiver';
import fs from 'fs';
import path from 'path';

export interface ArchiveResult {
  archivePath: string;
  /** Байт записано в архив; 0 означает, что архив пустой и исходники удалять нельзя */
  bytes: number;
  /** Пропущенные файлы (ENOENT/EACCES) — архив создан, но неполный */
  warnings: string[];
}

export function createArchive(outputDir: string): Promise<ArchiveResult> {
  const dirName = path.basename(outputDir);
  const parentDir = path.dirname(outputDir);
  const { stream, archivePath } = openUniqueArchive(parentDir, dirName);

  return new Promise((resolve, reject) => {
    const archive = archiver('zip', { zlib: { level: 6 } });
    const warnings: string[] = [];

    const fail = (err: Error) => {
      // Огрызок архива не оставляем — его слишком легко принять за готовый
      try { fs.unlinkSync(archivePath); } catch {}
      reject(err);
    };

    stream.on('error', fail);
    stream.on('close', () => resolve({ archivePath, bytes: archive.pointer(), warnings }));

    // warning — это пропущенный файл, а не фатальная ошибка: архив соберётся,
    // но будет неполным. Копим и отдаём наверх, чтобы вызывающий решил, что делать
    archive.on('warning', (err: Error) => warnings.push(err.message));
    archive.on('error', fail);

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
