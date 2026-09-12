import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { FetchLike } from '../src/http';
import {
  alternateLiveExtension,
  isHlsUrl,
  probeStream,
  resolveUrl,
  swapStreamExtension,
} from '../src/stream';

const LIVE = 'http://example.com:8080/live/demo/secret/101.m3u8';

function respondWith(body: string, init: { ok?: boolean; status?: number } = {}): FetchLike {
  return async () => ({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    text: async () => body,
  });
}

test('recognises HLS URLs and swaps the container', () => {
  assert.equal(isHlsUrl(LIVE), true);
  assert.equal(isHlsUrl('http://x/live/u/p/1.ts'), false);

  assert.equal(swapStreamExtension(LIVE, 'ts'), 'http://example.com:8080/live/demo/secret/101.ts');
  assert.equal(
    swapStreamExtension('http://x/live/1.m3u8?token=a', 'ts'),
    'http://x/live/1.ts?token=a',
  );
  assert.equal(swapStreamExtension('http://x/live/no-extension', 'ts'), null);

  assert.equal(alternateLiveExtension(LIVE), 'ts');
  assert.equal(alternateLiveExtension('http://x/1.ts'), 'm3u8');
  assert.equal(alternateLiveExtension('http://x/stream'), null);
});

test('a media playlist with segments probes clean', async () => {
  // No master indirection: the URL is already the playlist carrying segments.
  const body = '#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXTINF:6.0,\nseg1.ts\n';
  const result = await probeStream(LIVE, { fetchImpl: respondWith(body) });
  assert.equal(result.diagnosis, 'ok');
});

test('a playlist with no streams is reported rather than played as a black screen', async () => {
  const result = await probeStream(LIVE, { fetchImpl: respondWith('#EXTM3U\n') });
  assert.equal(result.diagnosis, 'empty_playlist');
});

test('an HTML error page is reported as a credentials or connection-limit problem', async () => {
  const result = await probeStream(LIVE, {
    fetchImpl: respondWith('<html><body>Forbidden</body></html>'),
  });
  assert.equal(result.diagnosis, 'not_a_stream');
  assert.match(result.detail, /credentials|expired|connections/i);
});

test('an HTTP failure carries its status through', async () => {
  const result = await probeStream(LIVE, {
    fetchImpl: respondWith('nope', { ok: false, status: 512 }),
  });
  assert.equal(result.diagnosis, 'http_error');
  assert.equal(result.status, 512);
});

test('an unreachable host is distinguished from a bad response', async () => {
  const fetchImpl: FetchLike = async () => {
    throw new Error('getaddrinfo ENOTFOUND example.com');
  };
  const result = await probeStream(LIVE, { fetchImpl });
  assert.equal(result.diagnosis, 'unreachable');
});

test('a raw MPEG-TS URL is never fetched, since it would never end', async () => {
  let called = false;
  const fetchImpl: FetchLike = async () => {
    called = true;
    return { ok: true, status: 200, text: async () => '' };
  };
  const result = await probeStream('http://x/live/u/p/1.ts', { fetchImpl });
  assert.equal(called, false);
  assert.equal(result.diagnosis, 'unknown');
});

test('resolves playlist-relative URIs against the playlist URL', () => {
  const base = 'http://example.com:8080/live/demo/secret/101.m3u8';
  assert.equal(resolveUrl(base, 'http://cdn.example/a.m3u8'), 'http://cdn.example/a.m3u8');
  assert.equal(resolveUrl(base, '/hls/a.m3u8'), 'http://example.com:8080/hls/a.m3u8');
  assert.equal(
    resolveUrl(base, 'variant.m3u8'),
    'http://example.com:8080/live/demo/secret/variant.m3u8',
  );
  assert.equal(resolveUrl(base, '../other/v.m3u8'), 'http://example.com:8080/live/demo/other/v.m3u8');
});

const MASTER = '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1200000\nvariant.m3u8\n';

test('a listed channel whose stream is dead is reported as offline, not as a config problem', async () => {
  // The master playlist loads fine; the variant it points at does not. This is
  // the common "channel is in the list but off air" case, and it must not be
  // confused with a permissions or credentials problem.
  const fetchImpl: FetchLike = async (url) => {
    if (url.endsWith('variant.m3u8')) throw new Error('connection refused');
    return { ok: true, status: 200, text: async () => MASTER };
  };

  const result = await probeStream(LIVE, { fetchImpl });
  assert.equal(result.diagnosis, 'variant_unavailable');
  assert.match(result.detail, /offline/i);
});

test('a master playlist whose variant is live probes ok', async () => {
  const fetchImpl: FetchLike = async (url) => ({
    ok: true,
    status: 200,
    text: async () =>
      url.endsWith('variant.m3u8') ? '#EXTM3U\n#EXTINF:6.0,\nseg1.ts\n' : MASTER,
  });

  const result = await probeStream(LIVE, { fetchImpl });
  assert.equal(result.diagnosis, 'ok');
  assert.match(result.detail, /live/i);
});

test('a variant carrying no segments means the channel is sending nothing', async () => {
  const fetchImpl: FetchLike = async (url) => ({
    ok: true,
    status: 200,
    text: async () => (url.endsWith('variant.m3u8') ? '#EXTM3U\n' : MASTER),
  });

  const result = await probeStream(LIVE, { fetchImpl });
  assert.equal(result.diagnosis, 'empty_playlist');
  assert.match(result.detail, /no video/i);
});
