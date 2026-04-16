// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { getDomCleanerScript } from '../snapshot/dom-cleaner';

function runCleaner(): string {
  return getDomCleanerScript().call(window);
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('getDomCleanerScript', () => {
  it('removes script tags', () => {
    document.body.innerHTML = '<div><script>alert(1)</script><p>Hello</p></div>';
    expect(runCleaner()).not.toContain('<script');
    expect(runCleaner()).toContain('<p>Hello</p>');
  });

  it('removes style tags', () => {
    document.body.innerHTML = '<div><style>.foo { color: red }</style><p>Text</p></div>';
    expect(runCleaner()).not.toContain('<style');
    expect(runCleaner()).toContain('<p>Text</p>');
  });

  it('strips non-whitelisted attributes', () => {
    document.body.innerHTML = '<button onclick="bad()" style="color:red" data-testid="btn">OK</button>';
    const result = runCleaner();
    expect(result).not.toContain('onclick');
    expect(result).not.toContain('style=');
    expect(result).toContain('data-testid="btn"');
  });

  it('keeps whitelisted attributes: id, class, role, aria-*', () => {
    document.body.innerHTML = '<input id="email" class="form-input" role="textbox" aria-label="Email" type="email" tabindex="0" />';
    const result = runCleaner();
    expect(result).toContain('id="email"');
    expect(result).toContain('class="form-input"');
    expect(result).toContain('role="textbox"');
    expect(result).toContain('aria-label="Email"');
  });

  it('clears SVG content', () => {
    document.body.innerHTML = '<div><svg><path d="M0 0"/><circle cx="5" cy="5" r="5"/></svg></div>';
    const result = runCleaner();
    expect(result).toContain('<svg');
    expect(result).not.toContain('<path');
    expect(result).not.toContain('<circle');
  });

  it('truncates deep nesting at depth 30', () => {
    document.body.innerHTML = '<div>'.repeat(35) + 'deep' + '</div>'.repeat(35);
    expect(runCleaner()).toContain('truncated');
  });
});
