export function getToolbarStyles(): string {
  return `
    * { box-sizing: border-box; margin: 0; padding: 0; }

    .recorder-toolbar {
      position: fixed;
      top: 0;
      left: 50%;
      transform: translateX(-50%);
      height: 36px;
      background: #1e1e2e;
      color: #cdd6f4;
      border: 1px solid #45475a;
      border-top: none;
      border-radius: 0 0 8px 8px;
      font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
      font-size: 12px;
      z-index: 2147483647;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 0 12px;
      box-shadow: 0 2px 12px rgba(0,0,0,0.3);
      user-select: none;
    }

    .rec-indicator {
      width: 8px;
      height: 8px;
      background: #f38ba8;
      border-radius: 50%;
      animation: blink 1.5s infinite;
      flex-shrink: 0;
    }

    .toolbar-label {
      font-weight: 600;
      font-size: 11px;
      color: #89b4fa;
      white-space: nowrap;
    }

    .toolbar-separator {
      width: 1px;
      height: 18px;
      background: #45475a;
    }

    .btn-mode {
      padding: 4px 10px;
      background: transparent;
      color: #a6adc8;
      border: 1px solid #45475a;
      border-radius: 4px;
      cursor: pointer;
      font-size: 11px;
      font-weight: 600;
      font-family: inherit;
      transition: all 0.15s;
      white-space: nowrap;
    }
    .btn-mode:hover { background: #313244; color: #cdd6f4; }
    .btn-mode.active {
      background: #94e2d5;
      color: #1e1e2e;
      border-color: #94e2d5;
    }
    .btn-mode.active:hover { opacity: 0.85; }

    .btn-stop {
      padding: 4px 10px;
      background: #f38ba8;
      color: #1e1e2e;
      border: 1px solid #f38ba8;
      border-radius: 4px;
      cursor: pointer;
      font-size: 11px;
      font-weight: 600;
      font-family: inherit;
      transition: all 0.15s;
      white-space: nowrap;
      margin-left: 4px;
    }
    .btn-stop:hover { background: #eba0ac; border-color: #eba0ac; }

    @keyframes blink {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.3; }
    }

    /* Condition picker popup */
    .condition-picker {
      position: fixed;
      background: #1e1e2e;
      border: 1px solid #94e2d5;
      border-radius: 6px;
      padding: 4px;
      display: flex;
      flex-direction: column;
      gap: 2px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.5);
      z-index: 2147483647;
    }

    .condition-btn {
      padding: 6px 14px;
      background: transparent;
      color: #cdd6f4;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      font-family: inherit;
      text-align: left;
    }
    .condition-btn:hover { background: #313244; color: #94e2d5; }

    .waitfor-hint {
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: #1e1e2e;
      color: #94e2d5;
      border: 1px solid #94e2d5;
      border-radius: 8px;
      padding: 8px 16px;
      font-size: 13px;
      z-index: 2147483647;
      pointer-events: none;
    }
  `;
}
