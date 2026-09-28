import { describe, expect, it } from 'vitest';
import { SecretRedactor, isSecretField, maskSecretInCode } from '../utils/secrets';

describe('isSecretField', () => {
  it('trusts the secret flag set by target-element', () => {
    expect(isSecretField({ secret: true, attributes: { type: 'text' } })).toBe(true);
  });

  it('ignores regular fields and missing targets', () => {
    expect(isSecretField({ attributes: { type: 'password' } })).toBe(false);
    expect(isSecretField({ missing: true })).toBe(false);
    expect(isSecretField(null)).toBe(false);
  });
});

describe('maskSecretInCode', () => {
  it('masks single- and double-quoted literals', () => {
    expect(maskSecretInCode("await page.getByLabel('Пароль').fill('s3cret');", 's3cret'))
      .toBe("await page.getByLabel('Пароль').fill('***');");
    expect(maskSecretInCode('page.fill("#p", "s3cret")', 's3cret')).toBe('page.fill("#p", "***")');
  });

  it('handles quotes and backslashes escaped by codegen', () => {
    expect(maskSecretInCode("fill('it\\'s\\\\ok')", "it's\\ok")).toBe("fill('***')");
  });

  it('masks short secrets without touching other code', () => {
    expect(maskSecretInCode("getByTestId('pin-1').fill('1')", '1')).toBe("getByTestId('pin-1').fill('***')");
  });
});

describe('SecretRedactor', () => {
  it('keeps only the latest value of an updated action', () => {
    const redactor = new SecretRedactor();
    redactor.remember('field:3', 'pas');
    redactor.remember('field:3', 'password1');

    expect(redactor.redactString('pas is a prefix')).toBe('pas is a prefix');
    expect(redactor.redactString('login=user&pwd=password1')).toBe('login=user&pwd=***');
  });

  it('redacts nested JSON bodies and console entries', () => {
    const redactor = new SecretRedactor();
    redactor.remember('field:1', 's3cret!');

    expect(redactor.redact({ user: 'admin', auth: { password: 's3cret!' }, list: ['x s3cret! y'] }))
      .toEqual({ user: 'admin', auth: { password: '***' }, list: ['x *** y'] });
    expect(redactor.redact([{ level: 'log', text: 'pwd=s3cret!' }])).toEqual([{ level: 'log', text: 'pwd=***' }]);
  });

  it('redacts the URL-encoded form of a secret', () => {
    const redactor = new SecretRedactor();
    redactor.remember('field:1', 'p@ss word');

    expect(redactor.redactString('password=p%40ss%20word')).toBe('password=***');
  });

  it('replaces short secrets only on exact match', () => {
    const redactor = new SecretRedactor();
    redactor.remember('field:1', '123');

    expect(redactor.redact({ password: '123', id: 'order-12345', count: 123 }))
      .toEqual({ password: '***', id: 'order-12345', count: 123 });
  });

  it('masks a short secret as a whole field value in ariaSnapshot', () => {
    const redactor = new SecretRedactor();
    redactor.remember('field:1', '1$');

    expect(redactor.redactString('- textbox "Логин": 1$5\n- textbox "Пароль": 1$\n- text: 1$'))
      .toBe('- textbox "Логин": 1$5\n- textbox "Пароль": ***\n- text: 1$');
  });

  it('keeps the secret when the field is cleared', () => {
    const redactor = new SecretRedactor();
    redactor.remember('field:1', 's3cret!');
    redactor.remember('field:1', '');

    expect(redactor.redactString('s3cret!')).toBe('***');
  });

  it('returns values unchanged when nothing is remembered', () => {
    const value = { password: 'secret' };
    expect(new SecretRedactor().redact(value)).toBe(value);
  });
});
