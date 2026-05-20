import { describe, it, expect, vi } from 'vitest';
import { parseAndValidateUrl, parseCliArgs, parseViewportSize } from '../utils/cli-parsers';

describe('parseAndValidateUrl', () => {
  it('returns url as-is when https protocol is explicit', () => {
    const result = parseAndValidateUrl('https://example.com');
    expect(result.url).toBe('https://example.com');
    expect(result.needsProtocolFallback).toBe(false);
  });

  it('returns url as-is when http protocol is explicit', () => {
    const result = parseAndValidateUrl('http://localhost:3000');
    expect(result.url).toBe('http://localhost:3000');
    expect(result.needsProtocolFallback).toBe(false);
  });

  it('sets needsProtocolFallback for bare domain', () => {
    const result = parseAndValidateUrl('example.com');
    expect(result.needsProtocolFallback).toBe(true);
    expect(result.url).toBe('example.com');
  });

  it('sets needsProtocolFallback for domain with path', () => {
    const result = parseAndValidateUrl('example.com/path');
    expect(result.needsProtocolFallback).toBe(true);
  });

  it('throws on invalid URL without protocol', () => {
    expect(() => parseAndValidateUrl('not a url!!')).toThrow();
  });
});

describe('parseViewportSize', () => {
  it('returns defaults when undefined', () => {
    expect(parseViewportSize(undefined)).toEqual({ width: 1920, height: 1080 });
  });

  it('parses standard desktop size', () => {
    expect(parseViewportSize('1920,1080')).toEqual({ width: 1920, height: 1080 });
  });

  it('parses mobile size', () => {
    expect(parseViewportSize('375,812')).toEqual({ width: 375, height: 812 });
  });

  it('throws on wrong separator (x instead of comma)', () => {
    expect(() => parseViewportSize('1280x720')).toThrow(/expected format/);
  });

  it('throws on zero width', () => {
    expect(() => parseViewportSize('0,720')).toThrow(/1–7680/);
  });

  it('throws on zero height', () => {
    expect(() => parseViewportSize('1280,0')).toThrow(/1–7680/);
  });

  it('throws on value exceeding max', () => {
    expect(() => parseViewportSize('7681,720')).toThrow(/1–7680/);
  });

  it('throws on non-numeric input', () => {
    expect(() => parseViewportSize('abc,def')).toThrow();
  });
});

describe('parseCliArgs', () => {
  it('keeps URL positional after flags with values', () => {
    const result = parseCliArgs(['--output-dir', 'out', '--jpeg', '80', 'https://example.com']);
    expect(result.url).toBe('https://example.com');
    expect(result.outputBase).toBe('out');
    expect(result.screenshotQuality).toBe(80);
  });

  it('supports equals form for value flags', () => {
    const result = parseCliArgs([
      '--output-dir=out',
      '--max-actions=10',
      '--viewport-size=1280,720',
      '--jpeg=75',
      'example.com',
    ]);

    expect(result.url).toBe('example.com');
    expect(result.outputBase).toBe('out');
    expect(result.maxActions).toBe(10);
    expect(result.viewportSize).toEqual({ width: 1280, height: 720 });
    expect(result.screenshotQuality).toBe(75);
  });

  it('supports separate form for viewport size', () => {
    const result = parseCliArgs(['--viewport-size', '375,812', 'example.com']);
    expect(result.viewportSize).toEqual({ width: 375, height: 812 });
    expect(result.url).toBe('example.com');
  });

  it('uses default jpeg quality when --jpeg has no numeric value', () => {
    const result = parseCliArgs(['--jpeg', 'https://example.com']);
    expect(result.screenshotQuality).toBe(80);
    expect(result.url).toBe('https://example.com');
  });

  it('falls back to default jpeg quality for out-of-range value', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = parseCliArgs(['--jpeg=101', 'example.com']);
    expect(result.screenshotQuality).toBe(80);
    expect(result.url).toBe('example.com');
    warn.mockRestore();
  });

  it('throws when required flag value is missing', () => {
    expect(() => parseCliArgs(['--output-dir'])).toThrow(/Missing value/);
    expect(() => parseCliArgs(['--max-actions', '--no-console'])).toThrow(/Missing value/);
    expect(() => parseCliArgs(['--viewport-size'])).toThrow(/Missing value/);
  });

  it('throws on invalid max actions', () => {
    expect(() => parseCliArgs(['--max-actions=0', 'example.com'])).toThrow(/Invalid --max-actions/);
    expect(() => parseCliArgs(['--max-actions=10abc', 'example.com'])).toThrow(/Invalid --max-actions/);
  });

  it('collects unknown flags without losing the URL', () => {
    const result = parseCliArgs(['--unknown', 'example.com']);
    expect(result.unknownFlags).toEqual(['--unknown']);
    expect(result.url).toBe('example.com');
  });
});
