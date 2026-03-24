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
├── SESSION.md              ← you are here (session metadata)
├── DATA_FORMAT.md          ← data format reference
├── TEST_GUIDE.md           ← test generation guidelines
├── actions.jsonl            ← all actions, one JSON per line (start here)
├── snapshots.jsonl          ← cleaned DOM snapshots, one per line (read on demand)
└── screenshots/             ← PNG screenshots matching action index
\`\`\`

## Next Steps

1. Read \`DATA_FORMAT.md\` for data format details (\`actions.jsonl\`, \`snapshots.jsonl\`, cross-reference strategy)
2. Read \`TEST_GUIDE.md\` for test generation guidelines (selector strategy, POM, code template)
3. Start with \`actions.jsonl\` — it has everything for most tasks
`;

  fs.writeFileSync(path.join(outputDir, 'SESSION.md'), prompt, 'utf-8');
}
