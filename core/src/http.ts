import { IptvError, toIptvError } from './errors';

/**
 * The subset of `fetch` core relies on. Declared structurally so that core
 * does not need DOM lib types and so tests can inject a stub.
 */
export type FetchLike = (
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    signal?: unknown;
  },
) => Promise<HttpResponseLike>;

export interface HttpResponseLike {
  ok: boolean;
  status: number;
  text(): Promise<string>;
}

export interface HttpClientOptions {
  fetchImpl?: FetchLike;
  timeoutMs?: number;
  headers?: Record<string, string>;
}

export const DEFAULT_TIMEOUT_MS = 20_000;

// Declared locally so core needs no DOM or @types/node lib. Every runtime core
// targets (browsers, Hermes, Node, Tizen) provides these globals.
declare function setTimeout(handler: () => void, timeout: number): unknown;
declare function clearTimeout(handle: unknown): void;

function resolveFetch(fetchImpl?: FetchLike): FetchLike {
  if (fetchImpl) return fetchImpl;
  const globalFetch = (globalThis as { fetch?: unknown }).fetch;
  if (typeof globalFetch !== 'function') {
    throw new IptvError(
      'network',
      'No fetch implementation available. Pass `fetchImpl` when constructing the client.',
    );
  }
  return globalFetch as unknown as FetchLike;
}

/**
 * `fetch` with a timeout, sane defaults and errors normalised to IptvError.
 *
 * Providers are frequently slow or plain broken, so every failure mode is
 * mapped to a code the UI can render a useful message for.
 */
export async function httpGetText(
  url: string,
  options: HttpClientOptions & { signal?: unknown } = {},
): Promise<string> {
  const fetchImpl = resolveFetch(options.fetchImpl);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  // AbortController exists in RN, browsers and Node 18+, but guard anyway so
  // core keeps working on the oddest of TV runtimes.
  const Controller = (globalThis as { AbortController?: new () => AbortControllerLike })
    .AbortController;
  const controller = Controller ? new Controller() : undefined;
  const signal = options.signal ?? controller?.signal;

  let timedOut = false;
  const timer =
    controller && timeoutMs > 0
      ? setTimeout(() => {
          timedOut = true;
          controller.abort();
        }, timeoutMs)
      : undefined;

  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      headers: {
        Accept: '*/*',
        ...options.headers,
      },
      ...(signal ? { signal } : {}),
    });

    if (!response.ok) {
      throw new IptvError(
        response.status === 404 ? 'not_found' : 'network',
        `Request failed with HTTP ${response.status}.`,
        { status: response.status },
      );
    }
    return await response.text();
  } catch (error) {
    if (timedOut) {
      throw new IptvError('timeout', `The server did not respond within ${timeoutMs}ms.`, {
        cause: error,
      });
    }
    throw toIptvError(error, `Could not load ${url}.`);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

interface AbortControllerLike {
  signal: unknown;
  abort(): void;
}

/** GET + JSON.parse, with the "panel returned an HTML error page" case handled. */
export async function httpGetJson<T>(
  url: string,
  options: HttpClientOptions & { signal?: unknown } = {},
): Promise<T> {
  const body = await httpGetText(url, {
    ...options,
    headers: { Accept: 'application/json', ...options.headers },
  });
  const trimmed = body.trim();
  if (!trimmed) {
    throw new IptvError('invalid_response', 'The server returned an empty response.');
  }
  try {
    return JSON.parse(trimmed) as T;
  } catch (error) {
    throw new IptvError(
      'invalid_response',
      'The server returned a non-JSON response.',
      { cause: error },
    );
  }
}

/**
 * Normalises a user-typed panel/playlist URL: adds a scheme when missing,
 * strips trailing slashes and any `player_api.php` the user pasted along.
 *
 * Deliberately regex-based rather than using the `URL` global: React Native's
 * built-in URL is not spec-compliant and older TV runtimes may not have one.
 */
export function normaliseBaseUrl(input: string): string {
  const raw = input.trim();
  if (!raw) throw new IptvError('invalid_url', 'Enter a server URL.');

  const withScheme = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`;
  const match = /^(https?):\/\/([^/?#\s]+)([^?#\s]*)/i.exec(withScheme);
  if (!match) {
    throw new IptvError('invalid_url', `"${input}" is not a valid URL.`);
  }

  const scheme = (match[1] ?? 'http').toLowerCase();
  const host = match[2] ?? '';
  if (!host || host.startsWith(':')) {
    throw new IptvError('invalid_url', `"${input}" is not a valid URL.`);
  }

  const path = (match[3] ?? '')
    .replace(/\/(player_api|panel_api|xmltv|get)\.php\/?$/i, '/')
    .replace(/\/+$/, '');

  return `${scheme}://${host}${path}`;
}

/** Builds `base?a=1&b=2`, skipping null/undefined values. */
export function buildUrl(
  base: string,
  params: Record<string, string | number | undefined | null>,
): string {
  const query = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&');
  if (!query) return base;
  return `${base}${base.includes('?') ? '&' : '?'}${query}`;
}
