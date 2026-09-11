import assert from 'node:assert/strict';
import { test } from 'node:test';

import { openCatalog } from '../src/catalog';
import { IptvError } from '../src/errors';
import { FavouritesRepository } from '../src/favourites';
import type { FetchLike } from '../src/http';
import { searchChannels } from '../src/search';
import { MemoryStorage } from '../src/storage';
import { SourceRepository } from '../src/sources';
import type { Channel, Source } from '../src/types';

test('adds, lists, switches and removes sources', async () => {
  const repository = new SourceRepository(new MemoryStorage());

  const first = await repository.add('Provider A', {
    kind: 'xtream',
    serverUrl: 'example.com:8080/',
    username: ' demo ',
    password: 'secret',
  });
  const second = await repository.add('Provider B', {
    kind: 'm3u',
    url: 'lists.example/playlist.m3u8?token=1',
  });

  // Config is normalised on the way in.
  assert.equal(
    (first.config as { serverUrl: string }).serverUrl,
    'http://example.com:8080',
  );
  assert.equal((first.config as { username: string }).username, 'demo');
  assert.equal(
    (second.config as { url: string }).url,
    'http://lists.example/playlist.m3u8?token=1',
  );

  assert.equal((await repository.list()).length, 2);
  // The first source added becomes active.
  assert.equal((await repository.getActive())?.id, first.id);

  await repository.setActiveId(second.id);
  assert.equal((await repository.getActive())?.id, second.id);

  // Removing the active source promotes whatever is left.
  await repository.remove(second.id);
  assert.equal((await repository.list()).length, 1);
  assert.equal((await repository.getActive())?.id, first.id);

  await repository.remove(first.id);
  assert.equal(await repository.getActive(), null);
});

test('rejects incomplete source configuration', async () => {
  const repository = new SourceRepository(new MemoryStorage());

  await assert.rejects(
    repository.add('No name', { kind: 'm3u' }),
    (error: unknown) => IptvError.is(error) && error.code === 'invalid_url',
  );
  await assert.rejects(
    repository.add('', { kind: 'm3u', url: 'http://x/p.m3u' }),
    (error: unknown) => IptvError.is(error) && error.code === 'invalid_url',
  );
  await assert.rejects(
    repository.add('Bad creds', {
      kind: 'xtream',
      serverUrl: 'http://x',
      username: '',
      password: '',
    }),
    (error: unknown) => IptvError.is(error) && error.code === 'invalid_credentials',
  );
});

test('survives corrupt stored JSON', async () => {
  const storage = new MemoryStorage();
  await storage.set('iptv-ninja:sources', '{not json');
  const repository = new SourceRepository(storage);
  assert.deepEqual(await repository.list(), []);
});

test('favourites are per source and toggle both ways', async () => {
  const repository = new FavouritesRepository(new MemoryStorage());
  const channel: Channel = { id: 'live:1', name: 'BBC One', kind: 'live' };

  assert.equal(await repository.toggle('src_a', channel), true);
  assert.equal(await repository.has('src_a', 'live:1'), true);
  assert.equal(await repository.has('src_b', 'live:1'), false);

  assert.equal(await repository.toggle('src_a', channel), false);
  assert.deepEqual(await repository.list('src_a'), []);
});

const CHANNELS: Channel[] = [
  { id: '1', name: 'BBC One HD', kind: 'live', categoryName: 'UK Entertainment' },
  { id: '2', name: 'Sky Sports Main Event', kind: 'live', categoryName: 'UK Sports' },
  { id: '3', name: 'beIN SPORTS 1', kind: 'live', categoryName: 'FR Sports' },
  { id: '4', name: 'Discovery Channel', kind: 'live', categoryName: 'Documentaries' },
];

test('search matches across name and category, ranking prefixes first', () => {
  // Equal-ranked hits fall back to alphabetical order.
  assert.deepEqual(
    searchChannels(CHANNELS, 'sports').map((channel) => channel.id),
    ['3', '2'],
  );
  // A name prefix outranks a mid-name match.
  assert.deepEqual(
    searchChannels(CHANNELS, 'sky').map((channel) => channel.id),
    ['2'],
  );
  assert.deepEqual(
    searchChannels(CHANNELS, 'bein sports').map((channel) => channel.id),
    ['3'],
  );
  // Diacritics and case are ignored; category text counts as a match.
  assert.deepEqual(
    searchChannels(CHANNELS, 'documentaries').map((channel) => channel.id),
    ['4'],
  );
  assert.deepEqual(searchChannels(CHANNELS, '   '), []);
});

const M3U_BODY = [
  '#EXTM3U url-tvg="http://guide.example/xmltv"',
  '#EXTINF:-1 tvg-id="bbc1.uk" group-title="UK",BBC One',
  'http://provider.example/live/u/p/1.m3u8',
  '#EXTINF:-1 group-title="Films",A Movie',
  'http://provider.example/movie/u/p/2.mp4',
].join('\n');

/** XMLTV wants `YYYYMMDDHHMMSS +0000`. */
function xmltvTime(offsetMs: number): string {
  const date = new Date(Date.now() + offsetMs);
  const pad = (value: number) => String(value).padStart(2, '0');
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())} +0000`
  );
}

const HOUR = 60 * 60 * 1000;

// Relative to now on purpose: catalogs keep only a window around the present,
// so a guide pinned to a fixed past date would be discarded as stale.
const XMLTV_BODY = `<tv>
  <channel id="bbc1.uk"><display-name>BBC One</display-name></channel>
  <programme start="${xmltvTime(-HOUR)}" stop="${xmltvTime(HOUR)}" channel="bbc1.uk">
    <title>Evening News</title>
  </programme>
</tv>`;

test('opens an M3U catalog, groups it and wires up the guide', async () => {
  const fetchImpl: FetchLike = async (url) => ({
    ok: true,
    status: 200,
    text: async () => (url.includes('xmltv') ? XMLTV_BODY : M3U_BODY),
  });

  const source: Source = {
    id: 'src_1',
    name: 'Test',
    createdAt: 0,
    config: { kind: 'm3u', url: 'http://provider.example/playlist.m3u' },
  };

  const catalog = await openCatalog(source, { fetchImpl });

  assert.deepEqual(catalog.capabilities, { live: true, movie: true, series: false, epg: true });
  assert.equal((await catalog.getCategories('live')).length, 1);
  assert.equal((await catalog.getChannels('movie')).length, 1);
  assert.equal((await catalog.getAllChannels()).length, 2);

  const live = (await catalog.getChannels('live'))[0] as Channel;
  const guide = await catalog.getGuide(live);
  assert.equal(guide[0]?.title, 'Evening News');
});

test('an M3U catalog reports a useless playlist rather than showing nothing', async () => {
  const fetchImpl: FetchLike = async () => ({
    ok: true,
    status: 200,
    text: async () => '#EXTM3U\n',
  });
  const source: Source = {
    id: 'src_2',
    name: 'Empty',
    createdAt: 0,
    config: { kind: 'm3u', url: 'http://provider.example/empty.m3u' },
  };

  await assert.rejects(
    openCatalog(source, { fetchImpl }),
    (error: unknown) => IptvError.is(error) && error.code === 'empty_playlist',
  );
});

test('a pasted playlist needs no network at all', async () => {
  const source: Source = {
    id: 'src_3',
    name: 'Pasted',
    createdAt: 0,
    config: { kind: 'm3u', content: M3U_BODY },
  };
  const catalog = await openCatalog(source, {
    deferEpg: true,
    fetchImpl: async () => {
      throw new Error('should not be called');
    },
  });
  assert.equal((await catalog.getAllChannels()).length, 2);
});

test('opening a catalog never downloads the XMLTV guide', async () => {
  // The guide is megabytes and parsing it blocks the only JS thread a phone
  // has, so nothing may pull it in as a side effect of loading a playlist.
  const requested: string[] = [];
  const fetchImpl: FetchLike = async (url) => {
    requested.push(url);
    return { ok: true, status: 200, text: async () => M3U_BODY };
  };

  const source: Source = {
    id: 'src_4',
    name: 'Test',
    createdAt: 0,
    config: { kind: 'm3u', url: 'http://provider.example/playlist.m3u' },
  };

  const catalog = await openCatalog(source, { fetchImpl, deferEpg: true });
  await catalog.getChannels('live');

  assert.equal(requested.length, 1);
  assert.ok(!requested.some((url) => url.includes('xmltv')));
});
