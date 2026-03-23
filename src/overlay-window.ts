// HTML content for the separate action log window
export function getOverlayWindowHTML(): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Recorder — Action Log</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      background: #1e1e2e;
      color: #cdd6f4;
      font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
      font-size: 12px;
      height: 100vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 12px;
      background: #313244;
      border-bottom: 1px solid #45475a;
      flex-shrink: 0;
    }

    .header-left {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .rec-dot {
      width: 8px;
      height: 8px;
      background: #f38ba8;
      border-radius: 50%;
      animation: blink 1.5s infinite;
    }

    .title {
      font-weight: 600;
      font-size: 13px;
      color: #89b4fa;
    }

    .counter {
      font-size: 11px;
      color: #585b70;
    }

    .btn-clear {
      padding: 4px 10px;
      background: #313244;
      color: #f38ba8;
      border: 1px solid #45475a;
      border-radius: 4px;
      cursor: pointer;
      font-size: 11px;
      font-family: inherit;
    }
    .btn-clear:hover { background: #45475a; }

    .action-log {
      flex: 1;
      overflow-y: auto;
      padding: 6px;
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

    .action-index {
      color: #585b70;
      font-size: 10px;
      flex-shrink: 0;
      min-width: 20px;
    }

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
      padding: 40px 20px;
      font-style: italic;
    }

    @keyframes blink {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.3; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="header-left">
      <div class="rec-dot"></div>
      <span class="title">Action Log</span>
      <span class="counter" id="counter">(0)</span>
    </div>
    <button class="btn-clear" id="btn-clear">Clear</button>
  </div>
  <div class="action-log" id="action-log">
    <div class="action-empty" id="empty-msg">Actions will appear here...</div>
  </div>

  <script>
    var actionLog = document.getElementById('action-log');
    var emptyMsg = document.getElementById('empty-msg');
    var counter = document.getElementById('counter');
    var btnClear = document.getElementById('btn-clear');
    var count = 0;

    // Called from recorder.ts via page.evaluate
    window.__addAction = function(data) {
      if (emptyMsg) { emptyMsg.remove(); emptyMsg = null; }
      count++;
      counter.textContent = '(' + count + ')';

      var item = document.createElement('div');
      item.className = 'action-item';

      var idx = document.createElement('span');
      idx.className = 'action-index';
      idx.textContent = String(data.index).padStart(3, '0');
      item.appendChild(idx);

      var badge = document.createElement('span');
      badge.className = 'action-badge badge-' + data.type;
      badge.textContent = data.type;
      item.appendChild(badge);

      var detail = document.createElement('span');
      detail.className = 'action-detail';

      if (data.type === 'navigate') {
        detail.textContent = data.url || '';
      } else if (data.type === 'fill') {
        detail.textContent = (data.selector || '') + ' = "' + (data.value || '') + '"';
      } else if (data.type === 'keypress') {
        detail.textContent = (data.selector || '') + ' [' + (data.key || '') + ']';
      } else if (data.type === 'waitFor') {
        detail.textContent = (data.selector || '') + ' (' + (data.condition || '') + ')';
      } else {
        detail.textContent = data.selector || data.url || '';
      }

      item.appendChild(detail);
      actionLog.appendChild(item);
      actionLog.scrollTop = actionLog.scrollHeight;
    };

    btnClear.addEventListener('click', function() {
      count = 0;
      counter.textContent = '(0)';
      actionLog.innerHTML = '<div class="action-empty">Actions will appear here...</div>';
      emptyMsg = actionLog.querySelector('.action-empty');
    });
  </script>
</body>
</html>`;
}
