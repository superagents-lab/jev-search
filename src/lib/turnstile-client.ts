/**
 * Browser side of the Turnstile check on /api/ask. One invisible widget is rendered per page and
 * asked for a fresh single-use token before every search. When the server has no Turnstile secret,
 * /api/models returns no site key and searches go out without a token.
 */

interface TurnstileApi {
  render(container: HTMLElement, options: Record<string, unknown>): string;
  execute(widget: string): void;
  reset(widget: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const TOKEN_TIMEOUT_MS = 20_000;

let siteKeyPromise: Promise<string | null> | null = null;
let scriptPromise: Promise<TurnstileApi> | null = null;
let widget: { id: string; pending: ((token: string | null) => void) | null } | null = null;

function siteKey(): Promise<string | null> {
  siteKeyPromise ??= fetch('/api/models')
    .then((response) => (response.ok ? response.json() : {}))
    .then((body) => (body as { turnstileSiteKey?: string | null }).turnstileSiteKey ?? null)
    .catch(() => {
      siteKeyPromise = null;
      return null;
    });
  return siteKeyPromise;
}

function loadScript(): Promise<TurnstileApi> {
  scriptPromise ??= new Promise<TurnstileApi>((resolve, reject) => {
    if (window.turnstile) return resolve(window.turnstile);
    const script = document.createElement('script');
    script.src = SCRIPT_URL;
    script.async = true;
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('Turnstile did not load')));
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error('Turnstile did not load'));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

function ensureWidget(api: TurnstileApi, key: string) {
  if (widget) return widget;
  const container = document.createElement('div');
  // Fixed in the corner: invisible unless Cloudflare needs the visitor to tick the box.
  container.style.cssText = 'position:fixed;bottom:16px;right:16px;z-index:50';
  document.body.appendChild(container);
  const state: { id: string; pending: ((token: string | null) => void) | null } = { id: '', pending: null };
  const settle = (token: string | null) => {
    const pending = state.pending;
    state.pending = null;
    pending?.(token);
  };
  state.id = api.render(container, {
    sitekey: key,
    action: 'search',
    execution: 'execute',
    appearance: 'interaction-only',
    callback: (token: string) => settle(token),
    'error-callback': () => settle(null),
    'expired-callback': () => settle(null),
    'timeout-callback': () => settle(null),
  });
  widget = state;
  return state;
}

/**
 * A fresh token for one search, `null` when the server does not ask for one, or `undefined` when
 * the check could not run (the server will then refuse the search with a verification error).
 */
export async function turnstileToken(): Promise<string | null | undefined> {
  const key = await siteKey();
  if (!key) return null;
  try {
    const api = await loadScript();
    const w = ensureWidget(api, key);
    w.pending?.(null);
    return await new Promise<string | undefined>((resolve) => {
      const timer = setTimeout(() => {
        w.pending = null;
        resolve(undefined);
      }, TOKEN_TIMEOUT_MS);
      w.pending = (token) => {
        clearTimeout(timer);
        resolve(token ?? undefined);
      };
      api.reset(w.id);
      api.execute(w.id);
    });
  } catch {
    return undefined;
  }
}
