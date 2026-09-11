import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { FetchLike } from '../src/http';
import {
  alternateLiveExtension,
  isHlsUrl,
  probeStream,
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

test('a real playlist probes clean', async () => {
  const body = '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1200000\nchunk.m3u8\n';
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
