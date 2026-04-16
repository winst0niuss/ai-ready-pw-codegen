import { describe, it, expect } from 'vitest';
import { parseAndValidateUrl, parseViewportSize } from '../utils/cli-parsers';

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
