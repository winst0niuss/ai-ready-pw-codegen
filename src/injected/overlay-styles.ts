export function getOverlayStyles(): string {
  return `
    * { box-sizing: border-box; margin: 0; padding: 0; }

    .recorder-panel {
      position: fixed;
      top: 10px;
      right: 10px;
      width: 320px;
      max-height: 60vh;
      background: #1e1e2e;
      color: #cdd6f4;
      border: 1px solid #45475a;
      border-radius: 8px;
      font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
      font-size: 12px;
      z-index: 2147483647;
      display: flex;
      flex-direction: column;
      box-shadow: 0 4px 20px rgba(0,0,0,0.4);
      user-select: none;
    }

    .panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 12px;
      background: #313244;
      border-radius: 8px 8px 0 0;
      cursor: grab;
      border-bottom: 1px solid #45475a;
    }
    .panel-header:active { cursor: grabbing; }

    .panel-title {
      font-weight: 600;
      font-size: 13px;
      color: #89b4fa;
    }

    .panel-header-buttons {
      display: flex;
      gap: 4px;
    }

    .btn-header {
      background: none;
      border: 1px solid #585b70;
      color: #a6adc8;
      width: 24px;
      height: 24px;
      border-radius: 4px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      line-height: 1;
    }
    .btn-header:hover { background: #45475a; color: #cdd6f4; }

    .panel-body {
      display: flex;
      flex-direction: column;
      overflow: hidden;
      flex: 1;
    }
    .panel-body.collapsed { display: none; }

    .action-log {
      flex: 1;
      overflow-y: auto;
      padding: 6px;
      max-height: 40vh;
      min-height: 100px;
    }
    .action-log::-webkit-scrollbar { width: 4px; }
    .action-log::-webkit-scrollbar-track { background: transparent; }
    .action-log::-webkit-scrollbar-thumb { background: #585b70; border-radius: 2px; }

    .action-item {
      padding: 4px 8px;
      margin-bottom: 2px;
      border-radius: 4px;
      font-size: 11px;
      line-height: 1.4;
      display: flex;
      align-items: baseline;
      gap: 6px;
    }
    .action-item:hover { background: #313244; }

    .action-badge {
      display: inline-block;
      padding: 1px 5px;
      border-radius: 3px;
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      white-space: nowrap;
      flex-shrink: 0;
    }
    .badge-click { background: #f38ba8; color: #1e1e2e; }
    .badge-fill { background: #a6e3a1; color: #1e1e2e; }
    .badge-select { background: #f9e2af; color: #1e1e2e; }
    .badge-navigate { background: #89b4fa; color: #1e1e2e; }
    .badge-keypress { background: #cba6f7; color: #1e1e2e; }
    .badge-submit { background: #fab387; color: #1e1e2e; }
    .badge-waitfor { background: #94e2d5; color: #1e1e2e; }

    .action-detail {
      color: #a6adc8;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .action-empty {
      color: #585b70;
      text-align: center;
      padding: 20px;
      font-style: italic;
    }

    .panel-controls {
      padding: 8px;
      border-top: 1px solid #45475a;
      display: flex;
      gap: 6px;
    }

    .btn-waitfor {
      flex: 1;
      padding: 6px 12px;
      background: #313244;
      color: #94e2d5;
      border: 1px solid #94e2d5;
      border-radius: 4px;
      cursor: pointer;
      font-size: 11px;
      font-weight: 600;
      font-family: inherit;
      transition: all 0.15s;
    }
    .btn-waitfor:hover { background: #94e2d5; color: #1e1e2e; }
    .btn-waitfor.active {
      background: #94e2d5;
      color: #1e1e2e;
      animation: pulse 1.5s infinite;
    }

    .btn-clear {
      padding: 6px 12px;
      background: #313244;
      color: #f38ba8;
      border: 1px solid #45475a;
      border-radius: 4px;
      cursor: pointer;
      font-size: 11px;
      font-family: inherit;
    }
    .btn-clear:hover { background: #45475a; }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.6; }
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

    /* WaitFor mode hint */
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
