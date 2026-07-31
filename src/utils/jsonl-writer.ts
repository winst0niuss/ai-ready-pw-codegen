import fs from 'fs';

/**
 * Инкрементальная запись JSONL.
 *
 * Каждая строка попадает на диск сразу, в памяти висит только последняя — её может
 * перезаписать `actionUpdated` от codegen (склейка нажатий клавиш в один `fill`).
 * Так аварийное завершение процесса (SIGKILL, краш браузера, OOM) стоит максимум
 * одного последнего действия, а не всей сессии.
 *
 * Индексы монотонны: codegen обновляет только текущее действие.
 */
export class JsonlWriter {
  private readonly filePath: string;
  private pending: { index: number; line: string } | null = null;
  private lastFlushedIndex = 0;
  private staleUpdates = 0;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  /** Записывает строку либо перезаписывает ещё не сброшенную строку с тем же индексом. */
  async write(index: number, line: string): Promise<void> {
    if (this.pending && index === this.pending.index) {
      this.pending.line = line;
      return;
    }

    if (index <= this.lastFlushedIndex) {
      // Обновление для строки, уже лежащей на диске — перезаписать нельзя, считаем
      this.staleUpdates++;
      return;
    }

    await this.flush();
    this.pending = { index, line };
  }

  /** Сбрасывает буферизованную строку на диск. */
  async flush(): Promise<void> {
    if (!this.pending) return;

    const { index, line } = this.pending;
    this.pending = null;
    await fs.promises.appendFile(this.filePath, line + '\n', 'utf-8');
    this.lastFlushedIndex = index;
  }

  /**
   * Дописывает остаток. Файл создаётся даже для пустой сессии — потребители
   * рассчитывают на его наличие.
   */
  async close(): Promise<{ staleUpdates: number }> {
    await this.flush();

    if (this.lastFlushedIndex === 0) {
      // appendFile с пустой строкой создаёт файл, но не обрезает уже существующий
      await fs.promises.appendFile(this.filePath, '', 'utf-8');
    }

    return { staleUpdates: this.staleUpdates };
  }
}
