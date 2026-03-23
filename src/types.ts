export interface RecordedAction {
  index: number;
  timestamp: string;
  url: string;
  action: {
    type: string;
    selector?: string;
    value?: string;
    key?: string;
    codegenCode?: string;
  };
  accessibilityTree: unknown;
  screenshotFile: string | null;
}

export interface DomSnapshot {
  index: number;
  cleanedDom: string;
}

export interface SessionMetadata {
  startUrl: string;
  startedAt: string;
  endedAt: string;
  totalActions: number;
  browserType: string;
  viewportSize: { width: number; height: number };
}

export interface RecorderOptions {
  outputDir: string;
  screenshots: boolean;
  viewport: { width: number; height: number };
}

// Data from Playwright codegen eventSink
export interface CodegenActionData {
  frame: { pageGuid: string; framePath: string[] };
  action: {
    name: string;
    selector?: string;
    url?: string;
    text?: string;
    key?: string;
    value?: string;
    options?: string[];
    checked?: boolean;
    modifiers?: number;
    button?: string;
    clickCount?: number;
    position?: { x: number; y: number };
    signals: unknown[];
  };
  startTime: number;
  committed?: boolean;
}
