// Этот файл экспортирует строку JS-кода для инжекции через addInitScript
export function getListenerScript(): string {
  return `
(function() {
  if (window.__RECORDER_INJECTED__) return;
  window.__RECORDER_INJECTED__ = true;
  window.__RECORDER_LAST_TARGET__ = null;

  const PREFIX = '__RECORDER__:';
  let inputTimer = null;
  let lastInputTarget = null;

  // Guard: не записываем события от тулбара рекордера
  function isOverlayElement(el) {
    var node = el;
    while (node) {
      if (node.id === '__recorder-toolbar-host__') return true;
      node = node.parentElement;
    }
    return false;
  }

  // Атрибуты, которые собираем
  const RELEVANT_ATTRS = [
    'id', 'class', 'data-testid', 'data-test', 'data-cy', 'data-qa',
    'aria-label', 'aria-labelledby', 'aria-describedby', 'aria-expanded',
    'aria-checked', 'aria-selected', 'aria-disabled', 'aria-hidden',
    'role', 'name', 'type', 'placeholder', 'href', 'value', 'for',
    'action', 'method', 'src', 'alt', 'title'
  ];

  function getAttributes(el) {
    const attrs = {};
    for (const name of RELEVANT_ATTRS) {
      const val = el.getAttribute(name);
      if (val !== null && val !== '') attrs[name] = val;
    }
    return attrs;
  }

  function getTextContent(el) {
    const text = (el.textContent || '').trim();
    return text.length > 150 ? text.slice(0, 150) + '...' : text;
  }

  function getBoundingBox(el) {
    try {
      const rect = el.getBoundingClientRect();
      return { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) };
    } catch { return null; }
  }

  // Генерация CSS-селектора (приоритет как в Playwright codegen)
  function getCssSelector(el) {
    // 1. data-testid / data-test / data-cy
    var testId = el.getAttribute('data-testid') || el.getAttribute('data-test') || el.getAttribute('data-cy');
    if (testId) return '[data-testid="' + testId + '"]';

    // 2. id (если не автогенерированный)
    if (el.id && !/^\d|^[:-]|--/.test(el.id)) return '#' + CSS.escape(el.id);

    var tag = el.tagName.toLowerCase();

    // 3. role + name (aria-label или текст)
    var role = el.getAttribute('role') || getImplicitRole(el);
    var ariaLabel = el.getAttribute('aria-label');
    if (role && ariaLabel) return tag + '[role="' + role + '"][aria-label="' + ariaLabel.replace(/"/g, '\\"') + '"]';

    // 4. aria-label без role
    if (ariaLabel) return tag + '[aria-label="' + ariaLabel.replace(/"/g, '\\"') + '"]';

    // 5. placeholder (для input/textarea)
    var placeholder = el.getAttribute('placeholder');
    if (placeholder && (tag === 'input' || tag === 'textarea')) return tag + '[placeholder="' + placeholder.replace(/"/g, '\\"') + '"]';

    // 6. alt (для img)
    var alt = el.getAttribute('alt');
    if (alt && tag === 'img') return 'img[alt="' + alt.replace(/"/g, '\\"') + '"]';

    // 7. Уникальный текст для кликабельных элементов (a, button)
    if (tag === 'a' || tag === 'button') {
      var text = (el.textContent || '').trim();
      if (text && text.length < 50) {
        var escapedText = text.replace(/"/g, '\\"');
        // Проверяем уникальность через :has-text нельзя в CSS, используем role+name паттерн
        if (role) return tag + '[role="' + role + '"]:text("' + escapedText + '")';
      }
    }

    // 8. name атрибут (для form-элементов)
    var name = el.getAttribute('name');
    if (name && (tag === 'input' || tag === 'select' || tag === 'textarea')) return tag + '[name="' + name + '"]';

    // 9. Fallback: рекурсивный CSS path
    var parent = el.parentElement;
    if (!parent) return tag;

    var siblings = Array.from(parent.children).filter(function(c) { return c.tagName === el.tagName; });
    if (siblings.length === 1) {
      return getCssSelector(parent) + ' > ' + tag;
    }
    var index = siblings.indexOf(el) + 1;
    return getCssSelector(parent) + ' > ' + tag + ':nth-child(' + index + ')';
  }

  function getImplicitRole(el) {
    var tag = el.tagName;
    if (tag === 'A' && el.hasAttribute('href')) return 'link';
    if (tag === 'BUTTON') return 'button';
    if (tag === 'INPUT') {
      var type = (el.getAttribute('type') || 'text').toLowerCase();
      if (type === 'checkbox') return 'checkbox';
      if (type === 'radio') return 'radio';
      if (type === 'submit' || type === 'button' || type === 'reset') return 'button';
      return 'textbox';
    }
    if (tag === 'SELECT') return 'combobox';
    if (tag === 'TEXTAREA') return 'textbox';
    if (tag === 'IMG') return 'img';
    if (tag === 'NAV') return 'navigation';
    if (tag === 'MAIN') return 'main';
    if (tag === 'HEADER') return 'banner';
    if (tag === 'FOOTER') return 'contentinfo';
    return '';
  }

  // Генерация простого XPath
  function getXPath(el) {
    if (el.id) return '//*[@id="' + el.id + '"]';

    const parts = [];
    let current = el;
    while (current && current.nodeType === 1) {
      let part = current.tagName.toLowerCase();
      const parent = current.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(c => c.tagName === current.tagName);
        if (siblings.length > 1) {
          const idx = siblings.indexOf(current) + 1;
          part += '[' + idx + ']';
        }
      }
      parts.unshift(part);
      current = parent;
    }
    return '/' + parts.join('/');
  }

  function buildPayload(type, el, extra) {
    return Object.assign({
      type: type,
      tagName: el.tagName.toLowerCase(),
      id: el.id || '',
      classes: Array.from(el.classList || []),
      text: getTextContent(el),
      attributes: getAttributes(el),
      boundingBox: getBoundingBox(el),
      cssSelector: getCssSelector(el),
      xpath: getXPath(el)
    }, extra || {});
  }

  // Делаем buildPayload доступным для toolbar (waitFor)
  window.__RECORDER_BUILD_PAYLOAD__ = buildPayload;

  function send(payload) {
    window.__RECORDER_LAST_TARGET__ = null; // сбрасываем перед установкой нового
    try {
      // Сохраняем ссылку на элемент для DOM snapshot
      const el = payload._element;
      delete payload._element;
      if (el) window.__RECORDER_LAST_TARGET__ = el;
    } catch {}
    console.debug(PREFIX + JSON.stringify(payload));
  }

  // Click — с fallback на mousedown для IDE (Theia/Monaco), где click может не генерироваться
  let pendingMousedown = null;
  let mousedownTimer = null;

  document.addEventListener('mousedown', function(e) {
    if (window.__RECORDER_WAITFOR_MODE__) return;
    const el = e.target;
    if (!el || !el.tagName) return;
    if (isOverlayElement(el)) return;
    if (el.tagName === 'SELECT') return;
    // Запоминаем mousedown, ждём click 400мс
    clearTimeout(mousedownTimer);
    pendingMousedown = el;
    mousedownTimer = setTimeout(function() {
      // Click не пришёл — записываем mousedown как click (IDE-режим)
      if (pendingMousedown) {
        const payload = buildPayload('click', pendingMousedown);
        payload._element = pendingMousedown;
        send(payload);
        pendingMousedown = null;
      }
    }, 400);
  }, true);

  document.addEventListener('click', function(e) {
    if (window.__RECORDER_WAITFOR_MODE__) return;
    const el = e.target;
    if (!el || !el.tagName) return;
    if (isOverlayElement(el)) return;
    if (el.tagName === 'SELECT') return;
    // Click пришёл — отменяем mousedown fallback
    clearTimeout(mousedownTimer);
    pendingMousedown = null;
    const payload = buildPayload('click', el);
    payload._element = el;
    send(payload);
  }, true);

  // Input (с дебаунсом)
  document.addEventListener('input', function(e) {
    const el = e.target;
    if (!el || !el.tagName) return;
    if (isOverlayElement(el)) return;
    lastInputTarget = el;
    clearTimeout(inputTimer);
    inputTimer = setTimeout(function() {
      const payload = buildPayload('fill', el, { value: el.value || '' });
      payload._element = el;
      send(payload);
      lastInputTarget = null;
    }, 300);
  }, true);

  // Change (для select)
  document.addEventListener('change', function(e) {
    const el = e.target;
    if (!el || el.tagName !== 'SELECT') return;
    if (isOverlayElement(el)) return;
    const payload = buildPayload('select', el, { value: el.value || '' });
    payload._element = el;
    send(payload);
  }, true);

  // Keydown (Enter, Tab, Escape)
  document.addEventListener('keydown', function(e) {
    if (!['Enter', 'Tab', 'Escape'].includes(e.key)) return;
    const el = e.target;
    if (!el || !el.tagName) return;
    if (isOverlayElement(el)) return;
    // Если есть pending input — отправляем его сначала
    if (lastInputTarget && e.key === 'Enter') {
      clearTimeout(inputTimer);
      const fillPayload = buildPayload('fill', lastInputTarget, { value: lastInputTarget.value || '' });
      fillPayload._element = lastInputTarget;
      send(fillPayload);
      lastInputTarget = null;
    }
    const payload = buildPayload('keypress', el, { key: e.key });
    payload._element = el;
    send(payload);
  }, true);

  // Submit
  document.addEventListener('submit', function(e) {
    const el = e.target;
    if (!el) return;
    if (isOverlayElement(el)) return;
    const payload = buildPayload('submit', el);
    payload._element = el;
    send(payload);
  }, true);

  // Перехват pushState/replaceState для SPA
  const origPush = history.pushState;
  const origReplace = history.replaceState;
  history.pushState = function() {
    origPush.apply(this, arguments);
    console.debug(PREFIX + JSON.stringify({ type: 'spa-navigate', url: location.href }));
  };
  history.replaceState = function() {
    origReplace.apply(this, arguments);
    console.debug(PREFIX + JSON.stringify({ type: 'spa-navigate', url: location.href }));
  };
  window.addEventListener('popstate', function() {
    console.debug(PREFIX + JSON.stringify({ type: 'spa-navigate', url: location.href }));
  });
})();
`;
}
