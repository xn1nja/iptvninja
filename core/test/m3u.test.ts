import assert from 'node:assert/strict';
import { test } from 'node:test';

import { inferMediaKind, parseExtinfAttributes, parseM3u, parseM3uStrict } from '../src/m3u';
import { IptvError } from '../src/errors';

const PLAYLIST = [
  '#EXTM3U url-tvg="http://guide.example/xmltv.php"',
  '#EXTINF:-1 tvg-id="bbc1.uk" tvg-name="BBC One" tvg-logo="http://logo/bbc1.png" group-title="UK | Entertainment",BBC One HD',
  'http://provider.example:8080/live/user/pass/101.m3u8',
  '#EXTINF:-1 tvg-id="itv1.uk" tvg-logo="http://logo/itv.png" group-title="UK | Entertainment",ITV 1',
  '#EXTVLCOPT:http-user-agent=VLC/3.0',
  'http://provider.example:8080/live/user/pass/102.m3u8',
  "#EXTINF:-1 tvg-id='sky.sports' group-title='UK | Sports',Sky Sports Main Event",
  'http://provider.example:8080/live/user/pass/103.ts',
  '#EXTINF:-1 tvg-id="" group-title="Movies",Blade Runner 2049',
  'http://provider.example:8080/movie/user/pass/555.mkv',
  '#EXTINF:-1,Orphan With No Group',
  'http://provider.example:8080/live/user/pass/104.m3u8',
];

test('parses attributes in double quotes, single quotes and bare form', () => {
  const attributes = parseExtinfAttributes(
    '#EXTINF:-1 tvg-id="a.b" tvg-name=\'Name Here\' tvg-chno=42 group-title="News"',
  );
  assert.equal(attributes['tvg-id'], 'a.b');
  assert.equal(attributes['tvg-name'], 'Name Here');
  assert.equal(attributes['tvg-chno'], '42');
  assert.equal(attributes['group-title'], 'News');
});

test('parses a playlist into channels and categories', () => {
  const playlist = parseM3u(PLAYLIST.join('\n'));

  assert.equal(playlist.epgUrl, 'http://guide.example/xmltv.php');
  assert.equal(playlist.channels.length, 5);

  const bbc = playlist.channels[0];
  assert.equal(bbc?.name, 'BBC One HD');
  assert.equal(bbc?.epgChannelId, 'bbc1.uk');
  assert.equal(bbc?.logo, 'http://logo/bbc1.png');
  assert.equal(bbc?.categoryName, 'UK | Entertainment');
  assert.equal(bbc?.streamUrl, 'http://provider.example:8080/live/user/pass/101.m3u8');
  assert.equal(bbc?.kind, 'live');
});

test('groups channels by group-title and counts them', () => {
  const playlist = parseM3u(PLAYLIST.join('\n'));
  const names = playlist.categories.map((category) => category.name);

  assert.deepEqual(names, ['UK | Entertainment', 'UK | Sports', 'Movies', 'Uncategorised']);
  assert.equal(playlist.categories[0]?.count, 2);
  assert.equal(playlist.categories.find((c) => c.name === 'Movies')?.kind, 'movie');
});

test('skips #EXTVLCOPT and honours #EXTGRP', () => {
  const playlist = parseM3u(
    ['#EXTM3U', '#EXTINF:-1,Channel A', '#EXTGRP:Docs', 'http://x/live/a.m3u8'].join('\n'),
  );
  assert.equal(playlist.channels[0]?.categoryName, 'Docs');
});

test('tolerates CRLF line endings and a BOM', () => {
  const playlist = parseM3u(`﻿${PLAYLIST.join('\r\n')}`);
  assert.equal(playlist.channels.length, 5);
  assert.equal(playlist.channels[0]?.name, 'BBC One HD');
});

test('keeps duplicate tvg-id entries addressable', () => {
  const playlist = parseM3u(
    [
      '#EXTM3U',
      '#EXTINF:-1 tvg-id="dup",One',
      'http://x/live/1.m3u8',
      '#EXTINF:-1 tvg-id="dup",Two',
      'http://x/live/2.m3u8',
    ].join('\n'),
  );
  assert.equal(playlist.channels.length, 2);
  assert.notEqual(playlist.channels[0]?.id, playlist.channels[1]?.id);
});

test('infers media kind from the stream path', () => {
  assert.equal(inferMediaKind('http://x/live/u/p/1.m3u8'), 'live');
  assert.equal(inferMediaKind('http://x/movie/u/p/1.mkv'), 'movie');
  assert.equal(inferMediaKind('http://x/series/u/p/1.mp4'), 'series');
  assert.equal(inferMediaKind('http://x/vod/Some.Movie.2020.mp4'), 'movie');
});

test('strict parsing rejects non-playlists and empty playlists', () => {
  assert.throws(() => parseM3uStrict('<html>404</html>'), (error: unknown) => {
    return IptvError.is(error) && error.code === 'invalid_response';
  });
  assert.throws(() => parseM3uStrict('#EXTM3U\n'), (error: unknown) => {
    return IptvError.is(error) && error.code === 'empty_playlist';
  });
});
