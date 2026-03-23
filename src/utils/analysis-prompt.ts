import fs from 'fs';
import path from 'path';

const PROMPT = `# DOMTrace Recording — Analysis Instructions

You are analyzing a recording captured by DOMTrace — an offline Playwright recorder.
The archive contains user interactions with DOM snapshots, accessibility trees, and screenshots.

## Archive Structure

- \`metadata.json\` — session info: start URL, timestamps, viewport, total actions count
- \`actions/NNN-<type>.json\` — individual recorded actions in order
- \`screenshots/NNN-<type>.png\` — corresponding screenshots (if enabled)

## Action JSON Format

Each action file contains:
- \`index\` — sequential action number
- \`timestamp\` — ISO timestamp
- \`url\` — page URL at the time of action
- \`action.type\` — action type: navigate, click, fill, press, select, check, uncheck, hover, assertVisible, etc.
- \`action.selector\` — Playwright selector used
- \`action.value\` — input value (for fill/select)
- \`action.key\` — key name (for press)
- \`action.codegenCode\` — generated Playwright code snippet
- \`snapshot.accessibilityTree\` — page accessibility tree at action time
- \`snapshot.cleanedDom\` — cleaned DOM snapshot (non-test attributes stripped, max depth 15)
- \`screenshotFile\` — relative path to screenshot (or null)

## What You Can Do With This Data

1. **Generate E2E Tests** — use \`codegenCode\` as a base, enhance with proper assertions from accessibility tree and DOM
2. **Create Page Objects** — extract selectors and group by page/component using DOM structure
3. **Analyze User Flow** — understand the recorded scenario from actions sequence and screenshots
4. **Find Accessibility Issues** — review accessibility tree snapshots for missing labels, roles, etc.
5. **Generate Test Data** — extract filled values and interactions for test data sets

## Recommendations

- Start by reading \`metadata.json\` to understand the session context
- Process actions in order (by index) to follow the user flow
- Use screenshots to visually verify page state when DOM/accessibility data is ambiguous
- The \`codegenCode\` field contains working Playwright code — use it as a starting point, not final output
- Selectors from codegen use Playwright's internal format — consider converting to more stable selectors (data-testid, role-based)
`;

export function writeAnalysisPrompt(outputDir: string): void {
  fs.writeFileSync(path.join(outputDir, 'ANALYSIS_PROMPT.md'), PROMPT, 'utf-8');
}
