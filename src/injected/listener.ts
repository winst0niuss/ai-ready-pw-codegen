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

  // Guard: не записываем события от overlay панели
  function isOverlayElement(el) {
    var node = el;
    while (node) {
      if (node.id === '__recorder-overlay-host__') return true;
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

  // Генерация CSS-селектора
  function getCssSelector(el) {
    if (el.id) return '#' + CSS.escape(el.id);

    const testId = el.getAttribute('data-testid') || el.getAttribute('data-test') || el.getAttribute('data-cy');
    if (testId) return '[data-testid="' + testId + '"]';

    const tag = el.tagName.toLowerCase();
    const parent = el.parentElement;
    if (!parent) return tag;

    const siblings = Array.from(parent.children).filter(c => c.tagName === el.tagName);
    if (siblings.length === 1) {
      const parentSelector = getCssSelector(parent);
      return parentSelector + ' > ' + tag;
    }
    const index = siblings.indexOf(el) + 1;
    const parentSelector = getCssSelector(parent);
    return parentSelector + ' > ' + tag + ':nth-child(' + index + ')';
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

  function send(payload) {
    window.__RECORDER_LAST_TARGET__ = null; // сбрасываем перед установкой нового
    try {
      // Сохраняем ссылку на элемент для DOM snapshot
      const el = payload._element;
      delete payload._element;
      if (el) window.__RECORDER_LAST_TARGET__ = el;
    } catch {}
    console.debug(PREFIX + JSON.stringify(payload));

    // Уведомляем overlay панель
    document.dispatchEvent(new CustomEvent('__recorder_action__', {
      detail: { type: payload.type, selector: payload.cssSelector, value: payload.value, key: payload.key }
    }));
  }

  // Click
  document.addEventListener('click', function(e) {
    const el = e.target;
    if (!el || !el.tagName) return;
    if (isOverlayElement(el)) return;
    // Пропускаем клик по select — будет change
    if (el.tagName === 'SELECT') return;
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
