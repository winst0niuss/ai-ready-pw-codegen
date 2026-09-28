// @vitest-environment jsdom
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { SECRET_BINDING, SECRET_MARKER_SCRIPT } from '../utils/secrets';

const report = vi.fn();

function type(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

beforeAll(() => {
  (window as any)[SECRET_BINDING] = report;
  window.eval(SECRET_MARKER_SCRIPT);
});

beforeEach(() => {
  report.mockClear();
  document.body.innerHTML = '<input id="pwd" type="password"><input id="login">';
});

describe('SECRET_MARKER_SCRIPT', () => {
  it('reports password values as they are typed', () => {
    const pwd = document.getElementById('pwd') as HTMLInputElement;
    type(pwd, 's');
    type(pwd, 's3');

    expect(report).toHaveBeenCalledTimes(2);
    const [fieldId, value] = report.mock.calls[1];
    expect(fieldId).toBe(report.mock.calls[0][0]);
    expect(value).toBe('s3');
  });

  it('keeps reporting after "show password" switches the type to text', () => {
    const pwd = document.getElementById('pwd') as HTMLInputElement;
    type(pwd, 's3');
    pwd.type = 'text';
    type(pwd, 's3!');

    expect(report).toHaveBeenLastCalledWith(expect.any(String), 's3!');
    expect((pwd as any).__aiReadyPwSecret).toBe(true);
  });

  it('ignores regular fields', () => {
    type(document.getElementById('login') as HTMLInputElement, 'admin');
    expect(report).not.toHaveBeenCalled();
  });
});
