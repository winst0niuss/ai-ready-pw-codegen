export interface ElementInfo {
  tagName: string;
  id: string;
  classes: string[];
  text: string;
  attributes: Record<string, string>;
  boundingBox: { x: number; y: number; width: number; height: number } | null;
  cssSelector: string;
  xpath: string;
}

export interface RecordedAction {
  index: number;
  timestamp: string;
  url: string;
  action: {
    type: 'navigate' | 'click' | 'fill' | 'select' | 'keypress' | 'submit' | 'waitFor';
    value?: string; // fill/select — the entered value
    key?: string; // keypress — the pressed key
    condition?: WaitForCondition; // waitFor — the wait condition
    elementInfo?: ElementInfo; // absent for navigate
  };
  snapshot: {
    accessibilityTree: unknown;
    cleanedDom: string;
  };
  screenshotFile: string | null;
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

export type WaitForCondition = 'visible' | 'hidden' | 'attached' | 'detached';

// Payload from injected browser script
export interface BrowserActionPayload {
  type: 'click' | 'fill' | 'select' | 'keypress' | 'submit' | 'waitFor';
  value?: string;
  key?: string;
  condition?: WaitForCondition;
  tagName: string;
  id: string;
  classes: string[];
  text: string;
  attributes: Record<string, string>;
  boundingBox: { x: number; y: number; width: number; height: number } | null;
  cssSelector: string;
  xpath: string;
}
