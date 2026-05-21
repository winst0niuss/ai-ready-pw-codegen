const DEFAULT_VIEWPORT_WIDTH = 1920;
const DEFAULT_VIEWPORT_HEIGHT = 1080;

export interface ParsedCliArgs {
  url?: string;
  noScreenshots: boolean;
  noArchive: boolean;
  noConsole: boolean;
  noNetwork: boolean;
  outputBase: string;
  maxActions?: number;
  viewportSize: { width: number; height: number };
  screenshotQuality?: number;
  unknownFlags: string[];
}

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

export function parseCliArgs(args: string[]): ParsedCliArgs {
  let url: string | undefined;
  let outputBase = './recordings';
  let maxActions: number | undefined;
  let viewportRaw: string | undefined;
  let screenshotQuality: number | undefined;
  const unknownFlags: string[] = [];

  const booleans = {
    noScreenshots: false,
    noArchive: false,
    noConsole: false,
    noNetwork: false,
  };

  const requireValue = (flag: string, value: string | undefined): string => {
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for ${flag}`);
    }
    return value;
  };

  const parseMaxActions = (raw: string): number => {
    if (!/^\d+$/.test(raw)) {
      throw new Error(`Invalid --max-actions: ${raw} (expected positive number)`);
    }
    const parsed = parseInt(raw, 10);
    if (parsed <= 0) {
      throw new Error(`Invalid --max-actions: ${raw} (expected positive number)`);
    }
    return parsed;
  };

  const parseJpegQuality = (raw: string | undefined): number => {
    if (raw === undefined) return 80;
    const parsed = parseInt(raw, 10);
    if (!isNaN(parsed) && parsed >= 1 && parsed <= 100) return parsed;
    if (!isNaN(parsed)) {
      console.warn(`\x1b[33m⚠ --jpeg quality ${parsed} is out of range (1–100), using default 80\x1b[0m`);
    }
    return 80;
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--no-screenshots') {
      booleans.noScreenshots = true;
      continue;
    }
    if (arg === '--no-archive') {
      booleans.noArchive = true;
      continue;
    }
    if (arg === '--no-console') {
      booleans.noConsole = true;
      continue;
    }
    if (arg === '--no-network') {
      booleans.noNetwork = true;
      continue;
    }

    const eqIdx = arg.indexOf('=');
    const hasEquals = arg.startsWith('--') && eqIdx !== -1;
    const flagName = hasEquals ? arg.slice(0, eqIdx) : arg;
    const inlineValue = hasEquals ? arg.slice(eqIdx + 1) : undefined;

    if (flagName === '--output-dir') {
      outputBase = hasEquals ? requireValue(flagName, inlineValue) : requireValue(flagName, args[++i]);
      continue;
    }
    if (flagName === '--max-actions') {
      const raw = hasEquals ? requireValue(flagName, inlineValue) : requireValue(flagName, args[++i]);
      maxActions = parseMaxActions(raw);
      continue;
    }
    if (flagName === '--viewport-size') {
      viewportRaw = hasEquals ? requireValue(flagName, inlineValue) : requireValue(flagName, args[++i]);
      continue;
    }
    if (flagName === '--jpeg') {
      if (hasEquals) {
        screenshotQuality = parseJpegQuality(inlineValue || undefined);
      } else {
        const next = args[i + 1];
        if (next && /^\d+$/.test(next)) {
          screenshotQuality = parseJpegQuality(next);
          i++;
        } else {
          screenshotQuality = parseJpegQuality(undefined);
        }
      }
      continue;
    }

    if (arg.startsWith('-')) {
      unknownFlags.push(arg);
      continue;
    }

    if (url) {
      throw new Error(`Unexpected argument: ${arg}`);
    }
    url = arg;
  }

  return {
    url,
    noScreenshots: booleans.noScreenshots,
    noArchive: booleans.noArchive,
    noConsole: booleans.noConsole,
    noNetwork: booleans.noNetwork,
    outputBase,
    maxActions,
    viewportSize: parseViewportSize(viewportRaw),
    ...(screenshotQuality !== undefined && { screenshotQuality }),
    unknownFlags,
  };
}
