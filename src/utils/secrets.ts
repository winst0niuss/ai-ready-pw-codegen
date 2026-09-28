import type { TargetSnapshot } from '../types';

export const SECRET_MASK = '***';

// Короче этого секрет заменяем только целиком: подстрока "123" испортила бы
// id и числа во всех телах запросов
const MIN_SUBSTRING_LENGTH = 4;

export const SECRET_BINDING = '__aiReadyPwReportSecret';

/**
 * Init-скрипт страницы. Очередь действий может отставать от пользователя на несколько
 * секунд, поэтому пароль узнаём не из неё, а в момент ввода:
 * - помечаем поле (JS-свойство, DOM приложения не меняется) — к моменту захвата
 *   «показать пароль» мог уже сменить type на text;
 * - сразу отправляем текущее значение в Node через binding.
 */
export const SECRET_MARKER_SCRIPT = `document.addEventListener('input', (e) => {
  const el = e.target;
  if (!el || el.tagName !== 'INPUT') return;
  if (String(el.type).toLowerCase() === 'password') el.__aiReadyPwSecret = true;
  if (!el.__aiReadyPwSecret) return;
  el.__aiReadyPwId = el.__aiReadyPwId || Math.random().toString(36).slice(2);
  if (typeof window.${SECRET_BINDING} === 'function') window.${SECRET_BINDING}(el.__aiReadyPwId, el.value);
}, true);`;

/** Поле пароля по снимку target (флаг secret ставит target-element). */
export function isSecretField(target: TargetSnapshot | null | undefined): boolean {
  return target?.secret === true;
}

/** Заменяет строковый литерал с секретом в сгенерированном коде: .fill('secret') → .fill('***'). */
export function maskSecretInCode(code: string, secret: string): string {
  const singleQuoted = `'${secret.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  const doubleQuoted = JSON.stringify(secret);
  return code
    .split(singleQuoted).join(`'${SECRET_MASK}'`)
    .split(doubleQuoted).join(`"${SECRET_MASK}"`);
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Хранит введённые в поля паролей значения и вычищает их из всего, что уходит в архив.
 * Ключ — поле или действие: при вводе значение растёт ("p", "pa", "pas"…), и
 * промежуточные префиксы не должны остаться в списке секретов.
 */
export class SecretRedactor {
  private secrets = new Map<string, string>();

  remember(key: string, value: string): void {
    // Пустое значение (поле очистили) секрет не удаляет — он ещё может встретиться в
    // снимках, которые очередь обработает позже
    if (value) this.secrets.set(key, value);
  }

  has(key: string): boolean {
    return this.secrets.has(key);
  }

  redactString(text: string): string {
    // Длинные первыми, чтобы секрет-префикс не разбил более длинный
    const secrets = [...this.secrets.values()].sort((a, b) => b.length - a.length);
    let result = text;
    for (const secret of secrets) {
      if (result === secret) return SECRET_MASK;
      if (secret.length < MIN_SUBSTRING_LENGTH) {
        // Короткий секрет как целое значение поля в ariaSnapshot: `- textbox "Пароль": 123`
        result = result.replace(new RegExp(`(": )${escapeRegExp(secret)}$`, 'gm'), `$1${SECRET_MASK}`);
        continue;
      }
      // Второй вариант — секрет в application/x-www-form-urlencoded теле
      for (const form of new Set([secret, encodeURIComponent(secret)])) {
        result = result.split(form).join(SECRET_MASK);
      }
    }
    return result;
  }

  /** Рекурсивно чистит строки в JSON-подобном значении. */
  redact<T>(value: T): T {
    if (this.secrets.size === 0) return value;
    if (typeof value === 'string') return this.redactString(value) as T;
    if (Array.isArray(value)) return value.map((item) => this.redact(item)) as T;
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [key, this.redact(item)]),
      ) as T;
    }
    return value;
  }
}
