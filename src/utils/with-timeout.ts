/** Отклонение по бюджету времени — отличимо от обычной ошибки захвата. */
export class CaptureTimeoutError extends Error {
  constructor(label: string, ms: number) {
    super(`${label} timed out after ${ms}ms`);
    this.name = 'CaptureTimeoutError';
  }
}

/**
 * Ограничивает время ожидания промиса.
 *
 * Исходный промис не отменяется (Playwright этого не умеет) — он просто перестаёт
 * кого-либо интересовать. Поэтому его отказ отдельно глушим: иначе после таймаута
 * прилетит unhandledRejection.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;

  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new CaptureTimeoutError(label, ms)), ms);
    timer.unref();
  });

  void promise.catch(() => {});

  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}
