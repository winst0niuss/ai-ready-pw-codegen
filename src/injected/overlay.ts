import { getOverlayStyles } from './overlay-styles';

export function getOverlayScript(): string {
  const styles = getOverlayStyles();

  return `
(function() {
  if (window.__RECORDER_OVERLAY_INJECTED__) return;
  window.__RECORDER_OVERLAY_INJECTED__ = true;

  const PREFIX = '__RECORDER__:';
  const STYLES = ${JSON.stringify(styles)};

  function initOverlay() {
    if (!document.body) {
      // body ещё не готов — ждём
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initOverlay, { once: true });
      } else {
        requestAnimationFrame(initOverlay);
      }
      return;
    }
    if (document.getElementById('__recorder-overlay-host__')) return;

    // === Создаём Shadow DOM хост ===
    var host = document.createElement('div');
    host.id = '__recorder-overlay-host__';
    host.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;z-index:2147483647;pointer-events:none;';
    document.body.appendChild(host);
    var shadow = host.attachShadow({ mode: 'closed' });

    // === Стили ===
    var styleEl = document.createElement('style');
    styleEl.textContent = STYLES;
    shadow.appendChild(styleEl);

    // === Панель ===
    var panel = document.createElement('div');
    panel.className = 'recorder-panel';
    panel.style.pointerEvents = 'auto';
    shadow.appendChild(panel);

    // Header
    var header = document.createElement('div');
    header.className = 'panel-header';
    header.innerHTML = '<span class="panel-title">REC</span><div class="panel-header-buttons"><button class="btn-header btn-collapse" title="Collapse">_</button></div>';
    panel.appendChild(header);

    // Body
    var panelBody = document.createElement('div');
    panelBody.className = 'panel-body';
    panel.appendChild(panelBody);

    // Action log
    var actionLog = document.createElement('div');
    actionLog.className = 'action-log';
    panelBody.appendChild(actionLog);

    // Controls
    var controls = document.createElement('div');
    controls.className = 'panel-controls';
    controls.innerHTML = '<button class="btn-waitfor">WaitFor</button><button class="btn-clear">Clear</button>';
    panelBody.appendChild(controls);

    var btnWaitFor = controls.querySelector('.btn-waitfor');
    var btnClear = controls.querySelector('.btn-clear');
    var btnCollapse = header.querySelector('.btn-collapse');

    // === Состояние ===
    var actions = [];
    var waitForMode = false;
    var highlightedEl = null;
    var conditionPicker = null;
    var waitForHint = null;

    // === Persistence ===
    function saveState() {
      try {
        sessionStorage.setItem('__recorder_actions__', JSON.stringify(actions));
        sessionStorage.setItem('__recorder_panel_pos__', JSON.stringify({
          top: panel.style.top, right: panel.style.right, left: panel.style.left
        }));
        sessionStorage.setItem('__recorder_collapsed__', panelBody.classList.contains('collapsed') ? '1' : '0');
      } catch(e) {}
    }

    function restoreState() {
      try {
        var saved = sessionStorage.getItem('__recorder_actions__');
        if (saved) {
          actions = JSON.parse(saved);
          actions.forEach(function(a) { renderAction(a); });
        }
        var pos = sessionStorage.getItem('__recorder_panel_pos__');
        if (pos) {
          var p = JSON.parse(pos);
          if (p.top) panel.style.top = p.top;
          if (p.right) panel.style.right = p.right;
          if (p.left) panel.style.left = p.left;
        }
        var collapsed = sessionStorage.getItem('__recorder_collapsed__');
        if (collapsed === '1') panelBody.classList.add('collapsed');
      } catch(e) {}
    }

    // === Рендер действия ===
    function renderAction(action) {
      var item = document.createElement('div');
      item.className = 'action-item';

      var badge = document.createElement('span');
      badge.className = 'action-badge badge-' + action.type;
      badge.textContent = action.type;
      item.appendChild(badge);

      var detail = document.createElement('span');
      detail.className = 'action-detail';
      var text = action.selector || action.url || '';
      if (action.value) text += ' = "' + action.value + '"';
      if (action.key) text += ' [' + action.key + ']';
      if (action.condition) text += ' -> ' + action.condition;
      detail.textContent = text;
      detail.title = text;
      item.appendChild(detail);

      actionLog.appendChild(item);
      actionLog.scrollTop = actionLog.scrollHeight;

      var empty = actionLog.querySelector('.action-empty');
      if (empty) empty.remove();
    }

    function addAction(action) {
      actions.push(action);
      renderAction(action);
      saveState();
    }

    function showEmpty() {
      if (actions.length === 0) {
        actionLog.innerHTML = '<div class="action-empty">Actions will appear here...</div>';
      }
    }

    // === Drag ===
    var isDragging = false;
    var dragStartX, dragStartY, panelStartX, panelStartY;

    header.addEventListener('mousedown', function(e) {
      if (e.target.tagName === 'BUTTON') return;
      isDragging = true;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      var rect = panel.getBoundingClientRect();
      panelStartX = rect.left;
      panelStartY = rect.top;
      e.preventDefault();
    });

    document.addEventListener('mousemove', function(e) {
      if (!isDragging) return;
      var dx = e.clientX - dragStartX;
      var dy = e.clientY - dragStartY;
      panel.style.left = (panelStartX + dx) + 'px';
      panel.style.top = (panelStartY + dy) + 'px';
      panel.style.right = 'auto';
    });

    document.addEventListener('mouseup', function() {
      if (isDragging) {
        isDragging = false;
        saveState();
      }
    });

    // === Collapse ===
    btnCollapse.addEventListener('click', function() {
      panelBody.classList.toggle('collapsed');
      btnCollapse.textContent = panelBody.classList.contains('collapsed') ? '+' : '_';
      saveState();
    });

    // === Clear ===
    btnClear.addEventListener('click', function() {
      actions = [];
      actionLog.innerHTML = '';
      showEmpty();
      saveState();
    });

    // === WaitFor Mode ===
    function enterWaitForMode() {
      waitForMode = true;
      btnWaitFor.classList.add('active');
      document.documentElement.style.cursor = 'crosshair';

      waitForHint = document.createElement('div');
      waitForHint.className = 'waitfor-hint';
      waitForHint.textContent = 'Click element to wait for | Esc to cancel';
      shadow.appendChild(waitForHint);
    }

    function exitWaitForMode() {
      waitForMode = false;
      btnWaitFor.classList.remove('active');
      document.documentElement.style.cursor = '';
      clearHighlight();
      if (waitForHint) { waitForHint.remove(); waitForHint = null; }
      if (conditionPicker) { conditionPicker.remove(); conditionPicker = null; }
    }

    function clearHighlight() {
      if (highlightedEl) {
        highlightedEl.style.outline = highlightedEl.__origOutline || '';
        highlightedEl = null;
      }
    }

    function isOverlayEl(el) {
      var node = el;
      while (node) {
        if (node === host || node.id === '__recorder-overlay-host__') return true;
        node = node.parentElement;
      }
      return false;
    }

    // Highlight при наведении в waitFor mode
    document.addEventListener('mousemove', function(e) {
      if (!waitForMode || conditionPicker) return;
      var target = e.target;
      if (isOverlayEl(target)) return;
      if (target === highlightedEl) return;

      clearHighlight();
      highlightedEl = target;
      highlightedEl.__origOutline = highlightedEl.style.outline || '';
      highlightedEl.style.outline = '2px solid #94e2d5';
    }, true);

    // Клик в waitFor mode — перехватываем ДО listener.ts
    document.addEventListener('click', function(e) {
      if (!waitForMode) return;
      if (isOverlayEl(e.target)) return;

      e.preventDefault();
      e.stopImmediatePropagation();

      var target = highlightedEl || e.target;
      clearHighlight();
      showConditionPicker(e.clientX, e.clientY, target);
    }, true);

    function showConditionPicker(x, y, targetEl) {
      if (conditionPicker) conditionPicker.remove();

      conditionPicker = document.createElement('div');
      conditionPicker.className = 'condition-picker';
      conditionPicker.style.left = Math.min(x, window.innerWidth - 160) + 'px';
      conditionPicker.style.top = Math.min(y, window.innerHeight - 140) + 'px';
      conditionPicker.style.pointerEvents = 'auto';

      ['visible', 'hidden', 'attached', 'detached'].forEach(function(cond) {
        var btn = document.createElement('button');
        btn.className = 'condition-btn';
        btn.textContent = cond;
        btn.addEventListener('click', function(ev) {
          ev.stopPropagation();
          sendWaitFor(targetEl, cond);
          exitWaitForMode();
        });
        conditionPicker.appendChild(btn);
      });

      shadow.appendChild(conditionPicker);
    }

    function sendWaitFor(el, condition) {
      var RELEVANT_ATTRS = [
        'id', 'class', 'data-testid', 'data-test', 'data-cy', 'data-qa',
        'aria-label', 'role', 'name', 'type', 'placeholder', 'href'
      ];
      var attrs = {};
      for (var i = 0; i < RELEVANT_ATTRS.length; i++) {
        var val = el.getAttribute(RELEVANT_ATTRS[i]);
        if (val !== null && val !== '') attrs[RELEVANT_ATTRS[i]] = val;
      }

      var text = (el.textContent || '').trim();
      if (text.length > 150) text = text.slice(0, 150) + '...';

      var rect = null;
      try {
        var r = el.getBoundingClientRect();
        rect = { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
      } catch(ex) {}

      var cssSelector = '';
      if (el.id) cssSelector = '#' + el.id;
      else {
        var testId = el.getAttribute('data-testid') || el.getAttribute('data-test') || el.getAttribute('data-cy');
        if (testId) cssSelector = '[data-testid="' + testId + '"]';
        else cssSelector = el.tagName.toLowerCase() + (el.className ? '.' + el.className.split(' ').filter(Boolean).join('.') : '');
      }

      var payload = {
        type: 'waitFor',
        condition: condition,
        tagName: el.tagName.toLowerCase(),
        id: el.id || '',
        classes: Array.from(el.classList || []),
        text: text,
        attributes: attrs,
        boundingBox: rect,
        cssSelector: cssSelector,
        xpath: ''
      };

      window.__RECORDER_LAST_TARGET__ = el;
      console.debug(PREFIX + JSON.stringify(payload));
      addAction({ type: 'waitFor', selector: cssSelector, condition: condition });
    }

    btnWaitFor.addEventListener('click', function() {
      if (waitForMode) exitWaitForMode();
      else enterWaitForMode();
    });

    // Escape — выход из waitFor
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && waitForMode) {
        exitWaitForMode();
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    }, true);

    // === Слушаем действия от listener.ts ===
    document.addEventListener('__recorder_action__', function(e) {
      addAction(e.detail);
    });

    // === Инициализация ===
    restoreState();
    showEmpty();

    // Блокируем всплытие событий от панели
    ['click', 'mousedown', 'mouseup', 'input', 'change', 'keydown', 'submit'].forEach(function(evt) {
      panel.addEventListener(evt, function(e) { e.stopPropagation(); }, true);
    });
  }

  // Запускаем когда DOM готов
  if (document.body) {
    initOverlay();
  } else if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initOverlay, { once: true });
  } else {
    requestAnimationFrame(initOverlay);
  }
})();
`;
}
