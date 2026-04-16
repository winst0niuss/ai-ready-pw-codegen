const DEFAULT_VIEWPORT_WIDTH = 1920;
const DEFAULT_VIEWPORT_HEIGHT = 1080;

export function parseAndValidateUrl(raw: string): { url: string; needsProtocolFallback: boolean } {
  if (/^https?:\/\//i.test(raw)) {
    try {
      new URL(raw);
    } catch {
      throw new Error(`Invalid URL: ${raw}`);
    }
    return { url: raw, needsProtocolFallback: false };
  }

  try {
    new URL(`http://${raw}`);
  } catch {
    throw new Error(`Invalid URL: ${raw}`);
  }
  return { url: raw, needsProtocolFallback: true };
}

export function parseViewportSize(raw: string | undefined): { width: number; height: number } {
  if (!raw) return { width: DEFAULT_VIEWPORT_WIDTH, height: DEFAULT_VIEWPORT_HEIGHT };
  const match = raw.match(/^(\d+),(\d+)$/);
  if (!match) {
    throw new Error(`Invalid --viewport-size: "${raw}" (expected format: 1280,720)`);
  }
  const width = parseInt(match[1], 10);
  const height = parseInt(match[2], 10);
  if (width <= 0 || width > 7680 || height <= 0 || height > 7680) {
    throw new Error(`Invalid --viewport-size: "${raw}" (values must be 1–7680)`);
  }
  return { width, height };
}
