import type { Page, Frame } from 'playwright';
import type { TargetSnapshot, SelectorCandidates } from '../types';

const RESOLVE_TIMEOUT_MS = 500;

export interface TargetCaptureResult {
  target: TargetSnapshot;
  selectors: SelectorCandidates;
}

/**
 * Resolves the target element in a frame/page via a Playwright selector and captures
 * a compact snapshot: tag, state, bounding box, ancestors + candidate selectors.
 */
export async function captureTargetElement(
  frameOrPage: Page | Frame,
  selector: string,
): Promise<TargetCaptureResult> {
  if (!selector) {
    return { target: { missing: true }, selectors: { codegen: '' } };
  }

  try {
    const locator = frameOrPage.locator(selector).first();
    const handle = await locator.elementHandle({ timeout: RESOLVE_TIMEOUT_MS });
    if (!handle) {
      return { target: { missing: true }, selectors: { codegen: selector } };
    }

    try {
      const data = await handle.evaluate(extractTargetData);
      return {
        target: data.target,
        selectors: { codegen: selector, ...data.selectors },
      };
    } finally {
      await handle.dispose().catch(() => {});
    }
  } catch {
    return { target: { missing: true }, selectors: { codegen: selector } };
  }
}

/** Inline function executed in the browser via elementHandle.evaluate. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractTargetData(el: any): {
  target: TargetSnapshot;
  selectors: Omit<SelectorCandidates, 'codegen'>;
} {
  const MAX_TEXT = 200;
  const ATTR_WHITELIST = new Set([
    'id', 'name', 'type', 'role', 'href', 'value', 'placeholder', 'title', 'alt',
    'for', 'src', 'action', 'method', 'disabled', 'readonly', 'checked',
    'required', 'selected', 'multiple', 'min', 'max', 'maxlength', 'pattern',
    'autocomplete', 'tabindex',
    'data-testid', 'data-test', 'data-cy', 'data-qa',
  ]);

  const truncate = (s: string | null | undefined): string | undefined => {
    if (!s) return undefined;
    const t = s.trim().replace(/\s+/g, ' ');
    if (!t) return undefined;
    return t.length > MAX_TEXT ? t.slice(0, MAX_TEXT) + '...' : t;
  };

  const rect = el.getBoundingClientRect();
  const boundingBox =
    rect.width || rect.height
      ? { x: +rect.x.toFixed(1), y: +rect.y.toFixed(1), width: +rect.width.toFixed(1), height: +rect.height.toFixed(1) }
      : null;

  const viewportW = (el.ownerDocument?.defaultView?.innerWidth) || 0;
  const viewportH = (el.ownerDocument?.defaultView?.innerHeight) || 0;
  const inViewport = !!boundingBox &&
    rect.bottom > 0 && rect.right > 0 &&
    rect.top < viewportH && rect.left < viewportW;

  const cs = el.ownerDocument?.defaultView?.getComputedStyle?.(el);
  const computedStyle = cs
    ? {
        display: cs.display,
        visibility: cs.visibility,
        opacity: cs.opacity,
        pointerEvents: cs.pointerEvents,
      }
    : { display: '', visibility: '', opacity: '', pointerEvents: '' };

  const visible =
    !!boundingBox &&
    computedStyle.display !== 'none' &&
    computedStyle.visibility !== 'hidden' &&
    computedStyle.opacity !== '0';

  const tagName = (el.tagName || '').toUpperCase();
  const isFormEl = tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT' || tagName === 'BUTTON';

  const enabled = !(isFormEl && el.disabled) && el.getAttribute('aria-disabled') !== 'true';
  const editable =
    tagName === 'TEXTAREA' ||
    (tagName === 'INPUT' && !['checkbox', 'radio', 'submit', 'button', 'file'].includes((el.type || '').toLowerCase())) ||
    el.isContentEditable === true;
  const isCheckable = tagName === 'INPUT' && (el.type === 'checkbox' || el.type === 'radio');
  const checked = isCheckable ? !!el.checked : undefined;
  const readOnly = isFormEl ? !!el.readOnly : undefined;
  const focused = el.ownerDocument?.activeElement === el;

  // Attributes (whitelisted)
  const attributes: Record<string, string> = {};
  for (const attr of Array.from(el.attributes) as Array<{ name: string; value: string }>) {
    if (ATTR_WHITELIST.has(attr.name) || attr.name.startsWith('aria-')) {
      attributes[attr.name] = attr.value;
    }
  }

  // Accessible name: aria-label > aria-labelledby > associated <label> > innerText > title > alt > placeholder
  let accessibleName: string | undefined = truncate(el.getAttribute('aria-label'));
  if (!accessibleName) {
    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) {
      const ids = labelledBy.split(/\s+/);
      const parts: string[] = [];
      for (const id of ids) {
        const ref = el.ownerDocument?.getElementById(id);
        if (ref) parts.push(ref.textContent || '');
      }
      accessibleName = truncate(parts.join(' '));
    }
  }
  if (!accessibleName && el.id) {
    const lbl = el.ownerDocument?.querySelector(`label[for="${CSS.escape(el.id)}"]`);
    if (lbl) accessibleName = truncate(lbl.textContent);
  }
  if (!accessibleName && typeof el.closest === 'function') {
    const wrappingLabel = el.closest('label');
    if (wrappingLabel && wrappingLabel !== el) accessibleName = truncate(wrappingLabel.textContent);
  }
  if (!accessibleName) {
    accessibleName = truncate(el.innerText || el.textContent);
  }
  if (!accessibleName) accessibleName = truncate(el.getAttribute('title')) || truncate(el.getAttribute('alt'));

  const text = truncate(el.innerText || el.textContent);

  // Ancestors — up to 5 levels
  const ancestors: TargetSnapshot['ancestors'] = [];
  let cur = el.parentElement;
  let depth = 0;
  while (cur && depth < 5 && cur.tagName !== 'HTML') {
    ancestors.push({
      tagName: cur.tagName,
      ...(cur.id ? { id: cur.id } : {}),
      ...(cur.className && typeof cur.className === 'string' ? { classes: cur.className.slice(0, 120) } : {}),
      ...(cur.getAttribute('role') ? { role: cur.getAttribute('role') } : {}),
      ...((cur.getAttribute('data-testid') || cur.getAttribute('data-test') || cur.getAttribute('data-cy') || cur.getAttribute('data-qa'))
        ? { testId: cur.getAttribute('data-testid') || cur.getAttribute('data-test') || cur.getAttribute('data-cy') || cur.getAttribute('data-qa') || undefined }
        : {}),
    });
    cur = cur.parentElement;
    depth++;
  }

  // Implicit role — simple heuristic for the most common cases
  const implicitRoleOf = (tag: string, type?: string): string | undefined => {
    if (tag === 'BUTTON') return 'button';
    if (tag === 'A' && el.hasAttribute('href')) return 'link';
    if (tag === 'SELECT') return 'combobox';
    if (tag === 'TEXTAREA') return 'textbox';
    if (tag === 'INPUT') {
      const t = (type || 'text').toLowerCase();
      if (t === 'button' || t === 'submit' || t === 'reset') return 'button';
      if (t === 'checkbox') return 'checkbox';
      if (t === 'radio') return 'radio';
      if (t === 'range') return 'slider';
      return 'textbox';
    }
    return undefined;
  };
  const role = el.getAttribute('role') || implicitRoleOf(tagName, el.type);

  // Selector candidates
  const selectors: Omit<SelectorCandidates, 'codegen'> = {};
  const testId =
    el.getAttribute('data-testid') ||
    el.getAttribute('data-test') ||
    el.getAttribute('data-cy') ||
    el.getAttribute('data-qa');
  if (testId) selectors.testId = testId;
  if (role) {
    selectors.role = accessibleName ? { role, name: accessibleName } : { role };
  }
  if (el.id) {
    const lbl = el.ownerDocument?.querySelector(`label[for="${CSS.escape(el.id)}"]`);
    const lblText = truncate(lbl?.textContent);
    if (lblText) selectors.label = lblText;
  }
  const placeholder = el.getAttribute('placeholder');
  if (placeholder) selectors.placeholder = truncate(placeholder);
  if (text && text.length < 80) selectors.text = text;

  // Short CSS path: tag#id or tag.class:nth-of-type
  const buildCss = (): string => {
    if (el.id) return `${tagName.toLowerCase()}#${el.id}`;
    const parts: string[] = [];
    let node = el;
    let d = 0;
    while (node && node.nodeType === 1 && d < 4) {
      let part = node.tagName.toLowerCase();
      if (node.id) {
        parts.unshift(`${part}#${node.id}`);
        break;
      }
      if (node.className && typeof node.className === 'string') {
        const cls = node.className.trim().split(/\s+/).filter(Boolean).slice(0, 2).join('.');
        if (cls) part += '.' + cls;
      }
      const parent = node.parentElement;
      if (parent) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const siblings = (Array.from(parent.children) as any[]).filter((c) => c.tagName === node.tagName);
        if (siblings.length > 1) {
          const idx = siblings.indexOf(node) + 1;
          part += `:nth-of-type(${idx})`;
        }
      }
      parts.unshift(part);
      node = parent;
      d++;
    }
    return parts.join(' > ');
  };
  selectors.css = buildCss();

  // XPath — last resort
  const buildXPath = (): string => {
    if (el.id) return `//*[@id="${el.id}"]`;
    const parts: string[] = [];
    let node = el;
    while (node && node.nodeType === 1 && node.tagName !== 'HTML') {
      const parent = node.parentElement;
      if (!parent) break;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const siblings = (Array.from(parent.children) as any[]).filter((c) => c.tagName === node.tagName);
      const idx = siblings.indexOf(node) + 1;
      parts.unshift(`${node.tagName.toLowerCase()}[${idx}]`);
      node = parent;
    }
    return '/' + parts.join('/');
  };
  selectors.xpath = buildXPath();

  const target: TargetSnapshot = {
    tagName,
    ...(role ? { role } : {}),
    ...(accessibleName ? { accessibleName } : {}),
    ...(text ? { text } : {}),
    attributes,
    boundingBox,
    inViewport,
    state: {
      visible,
      enabled,
      ...(editable !== undefined ? { editable } : {}),
      ...(checked !== undefined ? { checked } : {}),
      focused,
      ...(readOnly !== undefined ? { readOnly } : {}),
    },
    computedStyle,
    ancestors,
  };

  return { target, selectors };
}
