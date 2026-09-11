import assert from 'node:assert/strict';
import { test } from 'node:test';

import { decodeEntities, decodeMaybeBase64, normaliseForSearch } from '../src/text';
import { normaliseBaseUrl, buildUrl } from '../src/http';
import { IptvError } from '../src/errors';

test('decodes base64 EPG text including multi-byte characters', () => {
  // "Nouvelles du soir – été" encoded by a panel.
  const encoded = Buffer.from('Nouvelles du soir – été', 'utf8').toString('base64');
  assert.equal(decodeMaybeBase64(encoded), 'Nouvelles du soir – été');
});

test('leaves plain text alone when a panel does not encode it', () => {
  assert.equal(decodeMaybeBase64('Evening News'), 'Evening News');
  assert.equal(decodeMaybeBase64(''), '');
  assert.equal(decodeMaybeBase64(null), '');
});

test('decodes XML and numeric entities', () => {
  assert.equal(decodeEntities('Rock &amp; Roll'), 'Rock & Roll');
  assert.equal(decodeEntities('caf&#233;'), 'café');
  assert.equal(decodeEntities('caf&#xe9;'), 'café');
  assert.equal(decodeEntities('no entities here'), 'no entities here');
});

test('search normalisation strips case, accents and punctuation', () => {
  assert.equal(normaliseForSearch('beIN SPORTS 1 HD'), 'bein sports 1 hd');
  assert.equal(normaliseForSearch('Télé-Québec'), 'tele quebec');
});

test('normalises server URLs typed by hand', () => {
  assert.equal(normaliseBaseUrl('example.com:8080'), 'http://example.com:8080');
  assert.equal(normaliseBaseUrl('http://example.com:8080/'), 'http://example.com:8080');
  assert.equal(
    normaliseBaseUrl('http://example.com:8080/player_api.php'),
    'http://example.com:8080',
  );
  assert.equal(normaliseBaseUrl('https://panel.example.com/xc'), 'https://panel.example.com/xc');
  assert.throws(() => normaliseBaseUrl('  '), (error: unknown) => {
    return IptvError.is(error) && error.code === 'invalid_url';
  });
});

test('builds query strings and skips empty values', () => {
  assert.equal(
    buildUrl('http://x/player_api.php', { username: 'u', password: 'p p', category_id: undefined }),
    'http://x/player_api.php?username=u&password=p%20p',
  );
  assert.equal(buildUrl('http://x/a?b=1', { c: 2 }), 'http://x/a?b=1&c=2');
});
