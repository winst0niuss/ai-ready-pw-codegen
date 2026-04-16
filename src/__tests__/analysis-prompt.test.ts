import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';

vi.mock('fs');

import { writeAnalysisPrompt } from '../utils/analysis-prompt';

const metadata = {
  startUrl: 'https://example.com',
  startedAt: '2026-04-16T10:00:00Z',
  endedAt: '2026-04-16T10:05:00Z',
  totalActions: 7,
  browserType: 'chromium',
  viewportSize: { width: 1280, height: 720 },
};

describe('writeAnalysisPrompt', () => {
  beforeEach(() => vi.clearAllMocks());

  it('writes to SESSION.md in the output dir', () => {
    writeAnalysisPrompt('/tmp/recording', metadata);
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      path.join('/tmp/recording', 'SESSION.md'),
      expect.any(String),
      'utf-8',
    );
  });

  it('includes the start URL', () => {
    writeAnalysisPrompt('/tmp/recording', metadata);
    const content = (fs.writeFileSync as any).mock.calls[0][1] as string;
    expect(content).toContain('https://example.com');
  });

  it('includes the action count', () => {
    writeAnalysisPrompt('/tmp/recording', metadata);
    const content = (fs.writeFileSync as any).mock.calls[0][1] as string;
    expect(content).toContain('7');
  });

  it('includes viewport dimensions', () => {
    writeAnalysisPrompt('/tmp/recording', metadata);
    const content = (fs.writeFileSync as any).mock.calls[0][1] as string;
    expect(content).toContain('1280x720');
  });

  it('includes browser type', () => {
    writeAnalysisPrompt('/tmp/recording', metadata);
    const content = (fs.writeFileSync as any).mock.calls[0][1] as string;
    expect(content).toContain('chromium');
  });
});
