// Function executed via page.evaluate()
// Cleans full page DOM, keeping only test-relevant data
// Returns a function string — DOM typing not needed here, code runs in browser
export function getDomCleanerScript(): () => string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fn = function (this: any) {
    const ALLOWED_ATTRS = new Set([
      'id', 'class', 'data-testid', 'data-test', 'data-cy', 'data-qa',
      'aria-label', 'aria-labelledby', 'aria-describedby', 'aria-expanded',
      'aria-checked', 'aria-selected', 'aria-disabled', 'aria-hidden',
      'role', 'name', 'type', 'placeholder', 'href', 'value', 'for',
      'action', 'method', 'src', 'alt', 'title'
    ]);

    const REMOVE_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'LINK', 'META']);
    const MAX_DEPTH = 15;
    const MAX_TEXT_LENGTH = 200;

    // Clone the entire document from body
    const body = document.body;
    if (!body) return '<no-body/>';

    const clone = body.cloneNode(true) as HTMLElement;

    cleanNode(clone, 0);

    function cleanNode(node: any, depth: number): void {
      if (node.nodeType === 3) {
        const text = (node.textContent || '').trim();
        if (text.length > MAX_TEXT_LENGTH) {
          node.textContent = text.slice(0, MAX_TEXT_LENGTH) + '...';
        }
        return;
      }

      if (node.nodeType !== 1) return;
      const el = node;

      if (REMOVE_TAGS.has(el.tagName)) {
        el.remove();
        return;
      }

      if (el.tagName === 'SVG' || el.tagName === 'svg') {
        el.innerHTML = '';
        return;
      }

      if (depth >= MAX_DEPTH) {
        el.innerHTML = '<!-- truncated -->';
        return;
      }

      // Strip irrelevant attributes
      const attrsToRemove: string[] = [];
      for (const attr of Array.from(el.attributes) as any[]) {
        if (!ALLOWED_ATTRS.has(attr.name) && !attr.name.startsWith('aria-')) {
          attrsToRemove.push(attr.name);
        }
      }
      for (const name of attrsToRemove) {
        el.removeAttribute(name);
      }

      const children = Array.from(el.childNodes);
      for (const child of children) {
        cleanNode(child, depth + 1);
      }
    }

    return clone.outerHTML;
  };

  return fn as unknown as () => string;
}
