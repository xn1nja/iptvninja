/** Stable, user-actionable failure categories. */
export type IptvErrorCode =
  | 'network'
  | 'timeout'
  | 'aborted'
  | 'invalid_url'
  | 'invalid_credentials'
  | 'subscription_expired'
  | 'account_banned'
  | 'connection_limit'
  | 'invalid_response'
  | 'empty_playlist'
  | 'not_found'
  | 'unknown';

/**
 * The single error type core throws. UI layers switch on `code` rather than
 * matching provider strings, so error copy lives in one place per platform.
 */
export class IptvError extends Error {
  readonly code: IptvErrorCode;
  /** HTTP status, when the failure came from a response. */
  readonly status?: number;
  override readonly cause?: unknown;

  constructor(
    code: IptvErrorCode,
    message: string,
    options: { status?: number; cause?: unknown } = {},
  ) {
    super(message);
    this.name = 'IptvError';
    this.code = code;
    if (options.status !== undefined) this.status = options.status;
    if (options.cause !== undefined) this.cause = options.cause;
    // Keeps `instanceof` working when compiled down to ES5-ish targets.
    Object.setPrototypeOf(this, IptvError.prototype);
  }

  static is(value: unknown): value is IptvError {
    return value instanceof IptvError;
  }
}

/** Wraps anything thrown into an IptvError without losing the original. */
export function toIptvError(error: unknown, fallbackMessage: string): IptvError {
  if (IptvError.is(error)) return error;
  if (error instanceof Error) {
    if (error.name === 'AbortError') {
      return new IptvError('aborted', 'The request was cancelled.', { cause: error });
    }
    return new IptvError('network', error.message || fallbackMessage, { cause: error });
  }
  return new IptvError('unknown', fallbackMessage, { cause: error });
}

/**
 * Default English copy for each failure. Platforms can ignore this and
 * localise from `code` instead.
 */
export function describeError(error: unknown): string {
  if (!IptvError.is(error)) {
    return error instanceof Error ? error.message : 'Something went wrong.';
  }
  switch (error.code) {
    case 'network':
      return 'Could not reach the server. Check the URL and your connection.';
    case 'timeout':
      return 'The server took too long to respond.';
    case 'aborted':
      return 'Cancelled.';
    case 'invalid_url':
      return 'That does not look like a valid URL.';
    case 'invalid_credentials':
      return 'Wrong username or password.';
    case 'subscription_expired':
      return 'This subscription has expired.';
    case 'account_banned':
      return 'This account has been disabled by the provider.';
    case 'connection_limit':
      return 'All connections for this account are in use.';
    case 'invalid_response':
      return 'The server replied with something unexpected. Is this an Xtream Codes panel?';
    case 'empty_playlist':
      return 'The playlist loaded but contained no channels.';
    case 'not_found':
      return 'Not found.';
    default:
      return error.message || 'Something went wrong.';
  }
}
