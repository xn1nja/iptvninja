import { IptvError } from './errors';
import { httpGetText, type HttpClientOptions } from './http';

/** What a failed stream turned out to be, once probed. */
export type StreamDiagnosis =
  | 'ok'
  | 'unreachable'
  | 'timeout'
  | 'http_error'
  | 'not_a_stream'
  | 'empty_playlist'
  | 'unknown';

export interface StreamProbe {
  url: string;
  diagnosis: StreamDiagnosis;
  status?: number;
  /** One sentence, safe to show a user. */
  detail: string;
}

const HLS_TIMEOUT_MS = 8_000;

/** True for a URL the player would treat as an HLS playlist. */
export function isHlsUrl(url: string): boolean {
  return /\.m3u8(\?|#|$)/i.test(url);
}

/**
 * Rewrites the container extension of an Xtream-style stream URL.
 *
 * `http://host/live/u/p/123.m3u8` becomes `http://host/live/u/p/123.ts`.
 * Returns null when the URL has no extension to swap.
 */
export function swapStreamExtension(url: string, extension: string): string | null {
  const match = /^([^?#]*)\.([A-Za-z0-9]+)([?#].*)?$/.exec(url);
  if (!match) return null;
  return `${match[1]}.${extension}${match[3] ?? ''}`;
}

/**
 * The other container worth trying for a live stream.
 *
 * Panels commonly serve both; which one works varies by provider, and on iOS
 * only HLS plays at all, so offering the swap is more useful than guessing.
 */
export function alternateLiveExtension(url: string): 'm3u8' | 'ts' | null {
  if (isHlsUrl(url)) return 'ts';
  if (/\.ts(\?|#|$)/i.test(url)) return 'm3u8';
  return null;
}

/**
 * Works out why a stream would not play.
 *
 * Only HLS playlists are fetched: those are small, finite text files. A raw
 * MPEG-TS URL is an endless byte stream, so reading one to "check" it would
 * never return — for those the caller gets `unknown` rather than a hang.
 */
export async function probeStream(
  url: string,
  options: HttpClientOptions = {},
): Promise<StreamProbe> {
  if (!isHlsUrl(url)) {
    return {
      url,
      diagnosis: 'unknown',
      detail: 'This is not an HLS playlist, so it cannot be checked without opening the stream.',
    };
  }

  try {
    const body = await httpGetText(url, { timeoutMs: HLS_TIMEOUT_MS, ...options });
    const head = body.slice(0, 400).trim();

    if (head.startsWith('#EXTM3U')) {
      // A master or media playlist with no segments plays as a black screen.
      const hasContent = /#EXT-X-STREAM-INF|#EXTINF/i.test(body);
      if (!hasContent) {
        return {
          url,
          diagnosis: 'empty_playlist',
          detail: 'The server returned a playlist with no streams in it.',
        };
      }
      return { url, diagnosis: 'ok', detail: 'The server returned a valid HLS playlist.' };
    }

    if (/^<(!doctype|html)/i.test(head) || head.startsWith('{') || head.startsWith('<?xml')) {
      return {
        url,
        diagnosis: 'not_a_stream',
        detail:
          'The server returned a web page rather than a stream. That usually means the credentials are wrong, the line is expired, or all connections are in use.',
      };
    }

    return {
      url,
      diagnosis: 'unknown',
      detail: 'The server responded, but not with anything recognisable as a playlist.',
    };
  } catch (error) {
    if (IptvError.is(error)) {
      if (error.code === 'timeout') {
        return { url, diagnosis: 'timeout', detail: 'The server did not respond in time.' };
      }
      if (error.status !== undefined) {
        return {
          url,
          diagnosis: 'http_error',
          status: error.status,
          detail: `The server replied with HTTP ${error.status}.`,
        };
      }
      return {
        url,
        diagnosis: 'unreachable',
        detail: 'The stream could not be reached at all.',
      };
    }
    return { url, diagnosis: 'unknown', detail: 'The stream check failed.' };
  }
}
