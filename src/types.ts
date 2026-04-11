export interface ConsoleLogEntry {
  level: 'log' | 'warn' | 'error' | 'info' | 'debug' | 'pageerror';
  text: string;
  timestamp: string;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TargetElementState {
  visible: boolean;
  enabled: boolean;
  editable?: boolean;
  checked?: boolean;
  focused: boolean;
  readOnly?: boolean;
}

export interface TargetComputedStyle {
  display: string;
  visibility: string;
  opacity: string;
  pointerEvents: string;
}

export interface TargetAncestor {
  tagName: string;
  id?: string;
  classes?: string;
  role?: string;
  testId?: string;
}

export interface TargetSnapshot {
  missing?: boolean;
  tagName?: string;
  role?: string;
  accessibleName?: string;
  text?: string;
  attributes?: Record<string, string>;
  boundingBox?: BoundingBox | null;
  inViewport?: boolean;
  state?: TargetElementState;
  computedStyle?: TargetComputedStyle;
  ancestors?: TargetAncestor[];
}

export interface SelectorCandidates {
  codegen: string;
  testId?: string;
  role?: { role: string; name?: string };
  label?: string;
  text?: string;
  placeholder?: string;
  css?: string;
  xpath?: string;
}

export interface FrameContext {
  path: string[];
  url: string;
  name?: string;
}

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
    position?: { x: number; y: number };
    modifiers?: number;
    button?: string;
    clickCount?: number;
  };
  target?: TargetSnapshot;
  selectors?: SelectorCandidates;
  frame?: FrameContext;
  accessibilityTree: unknown;
  screenshotFile: string | null;
  consoleLogs?: ConsoleLogEntry[];
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
  noArchive?: boolean;
  maxActions?: number;
  headless?: boolean;
  captureConsole?: boolean;
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
