import { describe, expect, it } from 'vitest';
import { CaptureTimeoutError, withTimeout } from '../utils/with-timeout';

describe('withTimeout', () => {
  it('resolves with the original value when in time', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 1000, 'test')).resolves.toBe('ok');
  });

  it('propagates the original rejection', async () => {
    const failing = Promise.reject(new Error('boom'));
    await expect(withTimeout(failing, 1000, 'test')).rejects.toThrow('boom');
  });

  it('rejects with CaptureTimeoutError when the budget runs out', async () => {
    const hanging = new Promise<string>(() => {});
    await expect(withTimeout(hanging, 20, 'DOM snapshot')).rejects.toBeInstanceOf(CaptureTimeoutError);
  });

  it('does not raise unhandledRejection when the slow promise fails after the timeout', async () => {
    const rejections: unknown[] = [];
    const onRejection = (reason: unknown) => rejections.push(reason);
    process.on('unhandledRejection', onRejection);

    const late = new Promise<string>((_, reject) => setTimeout(() => reject(new Error('too late')), 30));
    await expect(withTimeout(late, 10, 'test')).rejects.toBeInstanceOf(CaptureTimeoutError);
    await new Promise((resolve) => setTimeout(resolve, 60));

    process.off('unhandledRejection', onRejection);
    expect(rejections).toEqual([]);
  });
});
