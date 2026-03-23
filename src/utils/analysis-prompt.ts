import fs from 'fs';
import path from 'path';
import { SessionMetadata } from '../types';

export function writeAnalysisPrompt(outputDir: string, metadata: SessionMetadata): void {
  const prompt = `# AI-Ready PW Codegen Recording

## Session Info
- **URL:** ${metadata.startUrl}
- **Actions:** ${metadata.totalActions}
- **Viewport:** ${metadata.viewportSize.width}x${metadata.viewportSize.height}
- **Browser:** ${metadata.browserType}
- **Started:** ${metadata.startedAt}
- **Ended:** ${metadata.endedAt}

## Archive Structure

\`\`\`
├── ANALYSIS_PROMPT.md    ← you are here
├── actions.jsonl          ← all actions, one JSON per line (start here)
├── snapshots.jsonl        ← cleaned DOM snapshots, one per line (read on demand)
└── screenshots/           ← PNG screenshots matching action index
\`\`\`

## How to Read

### 1. actions.jsonl (primary file)
Each line is a JSON object with fields:
- \`index\` — sequential number (001, 002, ...)
- \`timestamp\` — ISO timestamp
- \`url\` — page URL at action time
- \`action.type\` — navigate, click, fill, press, select, check, uncheck, hover, assertVisible
- \`action.selector\` — Playwright selector
- \`action.value\` — input value (fill/select)
- \`action.key\` — key name (press)
- \`action.codegenCode\` — generated Playwright test code
- \`action.position\` — click coordinates { x, y } (when available)
- \`action.modifiers\` — keyboard modifiers (Shift, Ctrl, etc.)
- \`action.button\` — mouse button (left/right/middle)
- \`action.clickCount\` — single/double/triple click
- \`accessibilityTree\` — page accessibility snapshot
- \`screenshotFile\` — path to screenshot or null
- \`consoleLogs\` — browser console messages since previous action (if captured)

### 2. snapshots.jsonl (on demand)
Each line: \`{ "index": N, "cleanedDom": "..." }\`
DOM snapshots are large — only read when you need element structure details not visible in the accessibility tree.

### 3. screenshots/ (visual reference)
Files named \`NNN-<action>.png\`, matching action index.

## What You Can Do

1. **Generate E2E tests** — use \`codegenCode\` as base, add assertions from accessibility tree
2. **Create Page Objects** — group selectors by page using URL changes and DOM structure
3. **Analyze user flow** — follow actions in order, use screenshots for visual context
4. **Find accessibility issues** — check accessibility tree for missing labels/roles
5. **Suggest better selectors** — replace codegen selectors with stable ones (data-testid, role-based)

## Tips
- Read \`actions.jsonl\` first — it has everything for most tasks
- Only open \`snapshots.jsonl\` if accessibility tree lacks needed details
- Codegen selectors use Playwright internal format — convert for production tests
`;

  fs.writeFileSync(path.join(outputDir, 'ANALYSIS_PROMPT.md'), prompt, 'utf-8');
}
