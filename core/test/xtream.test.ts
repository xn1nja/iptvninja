import assert from 'node:assert/strict';
import { test } from 'node:test';

import { IptvError } from '../src/errors';
import type { FetchLike, HttpResponseLike } from '../src/http';
import { XtreamClient } from '../src/xtream';

interface StubRoute {
  match: string;
  body: unknown;
  ok?: boolean;
  status?: number;
}

/** Minimal fetch stub that answers on substring match of the request URL. */
function stubFetch(routes: StubRoute[]): { fetchImpl: FetchLike; calls: string[] } {
  const calls: string[] = [];
  const fetchImpl: FetchLike = async (url) => {
    calls.push(url);
    const route = routes.find((entry) => url.includes(entry.match));
    if (!route) {
      const missing: HttpResponseLike = {
        ok: false,
        status: 404,
        text: async () => 'not found',
      };
      return missing;
    }
    return {
      ok: route.ok ?? true,
      status: route.status ?? 200,
      text: async () =>
        typeof route.body === 'string' ? route.body : JSON.stringify(route.body),
    };
  };
  return { fetchImpl, calls };
}

const ACTIVE_AUTH = {
  user_info: {
    username: 'demo',
    auth: 1,
    status: 'Active',
    exp_date: '1767225600',
    is_trial: '0',
    active_cons: '1',
    max_connections: '2',
    allowed_output_formats: ['m3u8', 'ts'],
  },
  server_info: { url: 'example.com', port: '8080', timestamp_now: 1705000000 },
};

function clientWith(routes: StubRoute[]) {
  const { fetchImpl, calls } = stubFetch(routes);
  const client = new XtreamClient({
    serverUrl: 'http://example.com:8080/',
    username: 'demo',
    password: 'secret',
    fetchImpl,
  });
  return { client, calls };
}

test('authenticates and normalises account info', async () => {
  const { client, calls } = clientWith([{ match: 'player_api.php', body: ACTIVE_AUTH }]);
  const auth = await client.authenticate();

  assert.equal(auth.user.username, 'demo');
  assert.equal(auth.user.isActive, true);
  assert.equal(auth.user.isTrial, false);
  assert.equal(auth.user.maxConnections, 2);
  assert.equal(auth.user.expiresAt, 1767225600 * 1000);
  assert.equal(auth.server.timeNow, 1705000000 * 1000);
  assert.ok(calls[0]?.includes('username=demo&password=secret'));
});

test('maps auth=0 to invalid_credentials', async () => {
  const { client } = clientWith([
    { match: 'player_api.php', body: { user_info: { auth: 0, status: 'Active' } } },
  ]);
  await assert.rejects(client.authenticate(), (error: unknown) => {
    return IptvError.is(error) && error.code === 'invalid_credentials';
  });
});

test('maps an Expired status to subscription_expired', async () => {
  const { client } = clientWith([
    { match: 'player_api.php', body: { user_info: { auth: 1, status: 'Expired' } } },
  ]);
  await assert.rejects(client.authenticate(), (error: unknown) => {
    return IptvError.is(error) && error.code === 'subscription_expired';
  });
});

test('maps a Banned status to account_banned', async () => {
  const { client } = clientWith([
    { match: 'player_api.php', body: { user_info: { auth: 1, status: 'Banned' } } },
  ]);
  await assert.rejects(client.authenticate(), (error: unknown) => {
    return IptvError.is(error) && error.code === 'account_banned';
  });
});

test('maps an HTML error page to invalid_response', async () => {
  const { client } = clientWith([{ match: 'player_api.php', body: '<html>nope</html>' }]);
  await assert.rejects(client.authenticate(), (error: unknown) => {
    return IptvError.is(error) && error.code === 'invalid_response';
  });
});

test('maps an unreachable server to a network error', async () => {
  const fetchImpl: FetchLike = async () => {
    throw new Error('getaddrinfo ENOTFOUND example.com');
  };
  const client = new XtreamClient({
    serverUrl: 'http://example.com:8080',
    username: 'demo',
    password: 'secret',
    fetchImpl,
  });
  await assert.rejects(client.authenticate(), (error: unknown) => {
    return IptvError.is(error) && error.code === 'network';
  });
});

test('rejects empty credentials up front', () => {
  assert.throws(
    () => new XtreamClient({ serverUrl: 'http://x', username: '', password: '' }),
    (error: unknown) => IptvError.is(error) && error.code === 'invalid_credentials',
  );
});

test('maps live categories and streams, filling in HLS URLs', async () => {
  const { client, calls } = clientWith([
    {
      match: 'get_live_categories',
      body: [{ category_id: '1', category_name: 'Sports', parent_id: 0 }],
    },
    {
      match: 'get_live_streams',
      body: [
        {
          num: 3,
          name: 'Sky Sports',
          stream_id: 101,
          stream_icon: 'http://logo/sky.png',
          epg_channel_id: 'sky.sports',
          category_id: '1',
          tv_archive: 1,
        },
      ],
    },
  ]);

  const categories = await client.getLiveCategories();
  assert.deepEqual(categories, [{ id: '1', name: 'Sports', kind: 'live', parentId: '0' }]);

  const channels = await client.getLiveStreams('1');
  const channel = channels[0];
  assert.equal(channel?.id, 'live:101');
  assert.equal(channel?.name, 'Sky Sports');
  assert.equal(channel?.streamId, '101');
  assert.equal(channel?.hasArchive, true);
  assert.equal(channel?.streamUrl, 'http://example.com:8080/live/demo/secret/101.m3u8');
  assert.ok(calls.some((url) => url.includes('category_id=1')));
});

test('maps VOD streams with their container extension', async () => {
  const { client } = clientWith([
    {
      match: 'get_vod_streams',
      body: [{ name: 'Dune', stream_id: 555, container_extension: 'mkv', rating: '8.1' }],
    },
  ]);
  const movie = (await client.getVodStreams())[0];
  assert.equal(movie?.kind, 'movie');
  assert.equal(movie?.streamUrl, 'http://example.com:8080/movie/demo/secret/555.mkv');
  assert.equal(movie?.rating, 8.1);
});

test('series entries are not directly playable', async () => {
  const { client } = clientWith([
    { match: 'get_series', body: [{ name: 'The Wire', series_id: 9, cover: 'http://c.png' }] },
  ]);
  const series = (await client.getSeries())[0];
  assert.equal(series?.kind, 'series');
  assert.equal(series?.seriesId, '9');
  assert.equal(series?.streamUrl, null);
});

test('flattens get_series_info into ordered seasons and episodes', async () => {
  const { client } = clientWith([
    {
      match: 'get_series_info',
      body: {
        info: { name: 'The Wire', plot: 'Baltimore.', cover: 'http://c.png' },
        episodes: {
          '2': [
            {
              id: '22',
              title: 'Ebb Tide',
              episode_num: 1,
              season: 2,
              container_extension: 'mkv',
              info: { duration_secs: 3600, plot: 'Docks.' },
            },
          ],
          '1': [
            { id: '12', title: 'The Detail', episode_num: 2, season: 1, container_extension: 'mp4' },
            { id: '11', title: 'The Target', episode_num: 1, season: 1, container_extension: 'mp4' },
          ],
        },
      },
    },
  ]);

  const detail = await client.getSeriesInfo('9');
  assert.equal(detail.name, 'The Wire');
  assert.deepEqual(
    detail.seasons.map((season) => season.season),
    [1, 2],
  );
  assert.deepEqual(
    detail.seasons[0]?.episodes.map((episode) => episode.title),
    ['The Target', 'The Detail'],
  );
  assert.equal(
    detail.seasons[1]?.episodes[0]?.streamUrl,
    'http://example.com:8080/series/demo/secret/22.mkv',
  );
});

test('decodes base64 short EPG listings and sorts them', async () => {
  const encode = (value: string) => Buffer.from(value, 'utf8').toString('base64');
  const { client } = clientWith([
    {
      match: 'get_short_epg',
      body: {
        epg_listings: [
          {
            title: encode('Late Show'),
            description: encode('Talk & music'),
            start_timestamp: '2000',
            stop_timestamp: '3000',
            channel_id: 'sky.sports',
            lang: 'en',
          },
          {
            title: encode('Early Show'),
            start_timestamp: '1000',
            stop_timestamp: '2000',
            channel_id: 'sky.sports',
          },
        ],
      },
    },
  ]);

  const listings = await client.getShortEpg('101', 4);
  assert.deepEqual(
    listings.map((entry) => entry.title),
    ['Early Show', 'Late Show'],
  );
  assert.equal(listings[1]?.description, 'Talk & music');
  assert.equal(listings[0]?.start, 1_000_000);
});

test('builds playlist and stream URLs from the normalised base', () => {
  const { client } = clientWith([]);
  assert.equal(client.baseUrl, 'http://example.com:8080');
  assert.equal(client.buildLiveStreamUrl(7, 'ts'), 'http://example.com:8080/live/demo/secret/7.ts');
  assert.equal(
    client.buildPlaylistUrl(),
    'http://example.com:8080/get.php?username=demo&password=secret&type=m3u_plus&output=m3u8',
  );
});
