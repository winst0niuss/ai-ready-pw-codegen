import path from 'path';

/**
 * Prefers the playwright installed in the cwd project, so its version matches
 * the browsers already installed for it; falls back to the bundled one.
 */
export function loadPlaywright(cwd: string = process.cwd()) {
  let pkgPath: string;
  try {
    pkgPath = require.resolve('playwright/package.json', { paths: [cwd] });
  } catch {
    pkgPath = require.resolve('playwright/package.json');
  }

  const dir = path.dirname(pkgPath);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const version = (require(pkgPath) as { version: string }).version;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const playwright = require(dir) as typeof import('playwright');

  return { playwright, version, dir };
}

/**
 * Since 1.63 a context holds a single recorder app: the second _enableRecorder
 * call (api mode) is ignored if the Inspector window was opened first.
 */
export function supportsInspectorWithApi(version: string): boolean {
  const [major, minor] = version.split('.').map(Number);
  return major === 1 && minor < 63;
}
