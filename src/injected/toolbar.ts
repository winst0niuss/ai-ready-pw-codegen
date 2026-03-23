import { getToolbarStyles } from './toolbar-styles';

// Тулбар на целевой странице — маленькая полоска для выбора режима (Record/WaitFor)
export function getToolbarScript(): string {
  const styles = getToolbarStyles();

  return `
(function() {
  if (window.__RECORDER_TOOLBAR_INJECTED__) return;
  window.__RECORDER_TOOLBAR_INJECTED__ = true;

  var PREFIX = '__RECORDER__:';

  // Состояние WaitFor — живёт между переинжекциями тулбара
  var waitForMode = false;
  var highlightedEl = null;
  var currentShadow = null;
  var currentHost = null;
  var pickerEl = null;
  var hintEl = null;

  function isToolbarEl(el) {
    var node = el;
    while (node) {
      if (node === currentHost) return true;
      if (node.nodeType === 11) node = node.host;
      else node = node.parentNode;
    }
    return false;
  }

  function enterWaitForMode() {
    waitForMode = true;
    window.__RECORDER_WAITFOR_MODE__ = true;
    document.documentElement.style.cursor = 'crosshair';

    // Обновляем кнопки если тулбар есть
    var btnW = currentShadow && currentShadow.querySelector('.btn-waitfor');
    var btnR = currentShadow && currentShadow.querySelector('.btn-record');
    if (btnW) btnW.classList.add('active');
    if (btnR) btnR.classList.remove('active');

    if (currentShadow) {
      hintEl = document.createElement('div');
      hintEl.className = 'waitfor-hint';
      hintEl.textContent = 'Click element to wait for | Esc to cancel';
      currentShadow.appendChild(hintEl);
    }
  }

  function exitWaitForMode() {
    waitForMode = false;
    window.__RECORDER_WAITFOR_MODE__ = false;
    document.documentElement.style.cursor = '';

    var btnW = currentShadow && currentShadow.querySelector('.btn-waitfor');
    var btnR = currentShadow && currentShadow.querySelector('.btn-record');
    if (btnW) btnW.classList.remove('active');
    if (btnR) btnR.classList.add('active');

    if (highlightedEl) {
      highlightedEl.style.outline = '';
      highlightedEl = null;
    }
    if (pickerEl) { pickerEl.remove(); pickerEl = null; }
    if (hintEl) { hintEl.remove(); hintEl = null; }
  }

  function showConditionPicker(targetEl, x, y) {
    if (pickerEl) pickerEl.remove();
    if (!currentShadow) return;

    pickerEl = document.createElement('div');
    pickerEl.className = 'condition-picker';
    pickerEl.style.pointerEvents = 'auto';
    pickerEl.style.left = Math.min(x, window.innerWidth - 150) + 'px';
    pickerEl.style.top = Math.min(y, window.innerHeight - 140) + 'px';

    var conditions = ['visible', 'hidden', 'attached', 'detached'];
    conditions.forEach(function(cond) {
      var btn = document.createElement('button');
      btn.className = 'condition-btn';
      btn.textContent = cond;
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        e.preventDefault();
        sendWaitFor(targetEl, cond);
        exitWaitForMode();
      });
      pickerEl.appendChild(btn);
    });

    currentShadow.appendChild(pickerEl);
  }

  function sendWaitFor(el, condition) {
    window.__RECORDER_LAST_TARGET__ = el;
    var payload;
    if (window.__RECORDER_BUILD_PAYLOAD__) {
      payload = window.__RECORDER_BUILD_PAYLOAD__('waitFor', el, { condition: condition });
    } else {
      payload = {
        type: 'waitFor', condition: condition,
        tagName: el.tagName.toLowerCase(), id: el.id || '',
        classes: Array.from(el.classList || []),
        text: (el.textContent || '').trim().slice(0, 150),
        attributes: {}, boundingBox: null, cssSelector: '', xpath: ''
      };
    }
    console.debug(PREFIX + JSON.stringify(payload));
  }

  // --- Document-level listeners (регистрируются один раз) ---

  document.addEventListener('mousemove', function(e) {
    if (!waitForMode || pickerEl) return;
    var el = e.target;
    if (!el || !el.tagName) return;
    if (isToolbarEl(el)) return;
    if (highlightedEl && highlightedEl !== el) highlightedEl.style.outline = '';
    el.style.outline = '2px solid #94e2d5';
    highlightedEl = el;
  }, true);

  document.addEventListener('click', function(e) {
    if (!waitForMode) return;
    var el = e.target;
    if (!el || !el.tagName) return;
    if (isToolbarEl(el)) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    if (highlightedEl) highlightedEl.style.outline = '';
    showConditionPicker(el, e.clientX, e.clientY);
  }, true);

  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && waitForMode) {
      e.preventDefault();
      e.stopPropagation();
      exitWaitForMode();
    }
  }, true);

  // --- Создание DOM тулбара (может вызываться повторно) ---

  function createToolbar() {
    var host = document.createElement('div');
    host.id = '__recorder-toolbar-host__';
    host.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;z-index:2147483647;pointer-events:none;';
    document.body.appendChild(host);
    currentHost = host;

    var shadow = host.attachShadow({ mode: 'closed' });
    currentShadow = shadow;

    var style = document.createElement('style');
    style.textContent = ${JSON.stringify(styles)};
    shadow.appendChild(style);

    var toolbar = document.createElement('div');
    toolbar.className = 'recorder-toolbar';
    toolbar.style.pointerEvents = 'auto';
    shadow.appendChild(toolbar);

    var rec = document.createElement('div');
    rec.className = 'rec-indicator';
    toolbar.appendChild(rec);

    var label = document.createElement('span');
    label.className = 'toolbar-label';
    label.textContent = 'REC';
    toolbar.appendChild(label);

    var sep = document.createElement('div');
    sep.className = 'toolbar-separator';
    toolbar.appendChild(sep);

    var btnRecord = document.createElement('button');
    btnRecord.className = 'btn-mode btn-record' + (waitForMode ? '' : ' active');
    btnRecord.textContent = 'Record';
    toolbar.appendChild(btnRecord);

    var btnWaitFor = document.createElement('button');
    btnWaitFor.className = 'btn-mode btn-waitfor' + (waitForMode ? ' active' : '');
    btnWaitFor.textContent = 'WaitFor';
    toolbar.appendChild(btnWaitFor);

    btnWaitFor.addEventListener('click', function(e) {
      e.stopPropagation();
      if (waitForMode) exitWaitForMode();
      else enterWaitForMode();
    });

    btnRecord.addEventListener('click', function(e) {
      e.stopPropagation();
      if (waitForMode) exitWaitForMode();
    });

    // Блокируем всплытие событий от тулбара
    ['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup'].forEach(function(evt) {
      toolbar.addEventListener(evt, function(e) { e.stopPropagation(); });
    });
  }

  // --- Инжекция и MutationObserver ---

  function ensureToolbar() {
    if (!document.body) return;
    if (!document.getElementById('__recorder-toolbar-host__')) {
      createToolbar();
    }
  }

  if (document.body) ensureToolbar();
  document.addEventListener('DOMContentLoaded', ensureToolbar);

  // Переинжектируем если SPA-фреймворк удалил тулбар
  new MutationObserver(function() {
    if (document.body && !document.getElementById('__recorder-toolbar-host__')) {
      createToolbar();
    }
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
`;
}
