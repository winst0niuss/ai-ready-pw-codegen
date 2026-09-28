import { describe, expect, it } from 'vitest';
import { normalizeCodegenData } from '../utils/codegen-data';

describe('normalizeCodegenData', () => {
  it('returns legacy (≤1.62) data unchanged', () => {
    const legacy = {
      frame: { pageGuid: 'page@1', framePath: ['iframe[name="f"]'] },
      action: { name: 'click', selector: 'internal:role=button[name="Inner"i]', signals: [] },
      startTime: 42,
    };

    expect(normalizeCodegenData(legacy)).toBe(legacy);
  });

  it('wraps flat (≥1.63) action data for the main frame', () => {
    const result = normalizeCodegenData({ name: 'fill', selector: 'internal:role=textbox[name="Name"i]', text: 'abc' });

    expect(result).toEqual({
      frame: { framePath: [] },
      action: { name: 'fill', selector: 'internal:role=textbox[name="Name"i]', text: 'abc' },
    });
  });

  it('splits the enter-frame chain of a flat selector into framePath', () => {
    const result = normalizeCodegenData({
      name: 'click',
      selector:
        'iframe[name="outer"] >> internal:control=enter-frame >> [id="f"] >> internal:control=enter-frame >> internal:role=button[name="Inner"i]',
    });

    expect(result.frame.framePath).toEqual(['iframe[name="outer"]', '[id="f"]']);
    expect(result.action.selector).toBe('internal:role=button[name="Inner"i]');
  });

  it('handles flat actions without selector (openPage/navigate)', () => {
    const result = normalizeCodegenData({ name: 'openPage', url: 'about:blank' });

    expect(result.action).toEqual({ name: 'openPage', url: 'about:blank', selector: undefined });
    expect(result.frame.framePath).toEqual([]);
  });
});
