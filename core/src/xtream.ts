import { IptvError } from './errors';
import { buildUrl, httpGetJson, httpGetText, normaliseBaseUrl, type HttpClientOptions } from './http';
import { isHlsUrl } from './stream';
import { decodeMaybeBase64 } from './text';
import type {
  Category,
  Channel,
  EpgEntry,
  SeriesDetail,
  SeriesEpisode,
  SeriesSeason,
  XtreamAuth,
} from './types';

export interface XtreamClientOptions extends HttpClientOptions {
  serverUrl: string;
  username: string;
  password: string;
  /**
   * Container to request for live streams. `m3u8` gives HLS, which is what
   * expo-video and every TV browser handle natively; `ts` is the raw MPEG-TS
   * fallback some panels serve more reliably.
   */
  liveExtension?: 'm3u8' | 'ts';
}

/** Raw shapes as returned by `player_api.php`, before normalisation. */
interface RawAuthResponse {
  user_info?: {
    username?: string;
    auth?: number | string;
    status?: string;
    exp_date?: string | number | null;
    is_trial?: string | number;
    active_cons?: string | number;
    max_connections?: string | number;
    created_at?: string | number | null;
    allowed_output_formats?: string[];
    message?: string;
  };
  server_info?: Record<string, unknown>;
  user?: unknown;
}

interface RawCategory {
  category_id?: string | number;
  category_name?: string;
  parent_id?: string | number;
}

interface RawLiveStream {
  num?: number;
  name?: string;
  stream_id?: string | number;
  stream_icon?: string;
  epg_channel_id?: string | null;
  category_id?: string | number;
  tv_archive?: string | number;
  direct_source?: string;
}

interface RawVodStream extends RawLiveStream {
  container_extension?: string;
  rating?: string | number;
  plot?: string;
}

interface RawSeries {
  num?: number;
  name?: string;
  series_id?: string | number;
  cover?: string;
  plot?: string;
  cast?: string;
  director?: string;
  genre?: string;
  releaseDate?: string;
  release_date?: string;
  rating?: string | number;
  category_id?: string | number;
}

interface RawEpgListing {
  title?: string;
  description?: string;
  lang?: string;
  channel_id?: string;
  start?: string;
  end?: string;
  stop?: string;
  start_timestamp?: string | number;
  stop_timestamp?: string | number;
}

function asString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  return str === '' ? null : str;
}

function asNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

/** Panels report epoch *seconds* as strings; normalise to epoch ms. */
function secondsToMs(value: unknown): number | null {
  const seconds = asNumber(value);
  if (seconds === null || seconds <= 0) return null;
  return Math.round(seconds * 1000);
}

/**
 * `2024-01-15 20:30:00` in the panel's local time. Only used as a fallback
 * when the panel omits the `*_timestamp` fields.
 */
function parsePanelDate(value: unknown): number | null {
  const str = asString(value);
  if (!str) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(str);
  if (!match) return null;
  return Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
    Number(match[6] ?? '0'),
  );
}

/**
 * Client for the Xtream Codes `player_api.php` interface.
 *
 * Every list endpoint returns already-normalised core types with playable URLs
 * filled in, so a UI layer never has to know how Xtream spells things.
 */
export class XtreamClient {
  readonly baseUrl: string;
  private readonly username: string;
  private readonly password: string;
  private readonly liveExtension: 'm3u8' | 'ts';
  private readonly http: HttpClientOptions;

  constructor(options: XtreamClientOptions) {
    this.baseUrl = normaliseBaseUrl(options.serverUrl);
    this.username = options.username.trim();
    this.password = options.password;
    this.liveExtension = options.liveExtension ?? 'm3u8';
    this.http = {
      ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
      ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
      ...(options.headers ? { headers: options.headers } : {}),
    };

    if (!this.username || !this.password) {
      throw new IptvError('invalid_credentials', 'Username and password are both required.');
    }
  }

  private apiUrl(params: Record<string, string | number | undefined | null>): string {
    return buildUrl(`${this.baseUrl}/player_api.php`, {
      username: this.username,
      password: this.password,
      ...params,
    });
  }

  private async call<T>(params: Record<string, string | number | undefined | null>): Promise<T> {
    return httpGetJson<T>(this.apiUrl(params), this.http);
  }

  /**
   * Verifies the credentials and returns account/server info.
   *
   * Translates the panel's own status vocabulary into distinct error codes so
   * "wrong password" and "your subscription ran out" do not look the same.
   */
  async authenticate(): Promise<XtreamAuth> {
    const raw = await this.call<RawAuthResponse>({});
    const info = raw?.user_info;

    if (!info || typeof info !== 'object') {
      throw new IptvError(
        'invalid_response',
        'No account information came back. Check that the server URL points at an Xtream Codes panel.',
      );
    }

    const authFlag = asNumber(info.auth);
    if (authFlag === 0) {
      throw new IptvError('invalid_credentials', 'The panel rejected this username and password.');
    }

    const status = asString(info.status) ?? 'Unknown';
    const normalisedStatus = status.toLowerCase();
    if (normalisedStatus === 'expired') {
      throw new IptvError('subscription_expired', 'This subscription has expired.');
    }
    if (normalisedStatus === 'banned' || normalisedStatus === 'disabled') {
      throw new IptvError('account_banned', `The provider has ${normalisedStatus} this account.`);
    }

    const server = (raw.server_info ?? {}) as Record<string, unknown>;

    return {
      user: {
        username: asString(info.username) ?? this.username,
        status,
        isActive: normalisedStatus === 'active',
        isTrial: asNumber(info.is_trial) === 1,
        expiresAt: secondsToMs(info.exp_date),
        createdAt: secondsToMs(info.created_at),
        activeConnections: asNumber(info.active_cons) ?? 0,
        maxConnections: asNumber(info.max_connections) ?? 0,
        allowedOutputFormats: Array.isArray(info.allowed_output_formats)
          ? info.allowed_output_formats.map(String)
          : [],
        message: asString(info.message),
      },
      server: {
        url: asString(server['url']),
        port: asString(server['port']),
        httpsPort: asString(server['https_port']),
        serverProtocol: asString(server['server_protocol']),
        timezone: asString(server['timezone']),
        timeNow: secondsToMs(server['timestamp_now']) ?? parsePanelDate(server['time_now']),
      },
    };
  }

  // --- Stream URLs -------------------------------------------------------

  buildLiveStreamUrl(streamId: string | number, extension = this.liveExtension): string {
    return `${this.baseUrl}/live/${encodeURIComponent(this.username)}/${encodeURIComponent(this.password)}/${streamId}.${extension}`;
  }

  buildVodStreamUrl(streamId: string | number, extension = 'mp4'): string {
    return `${this.baseUrl}/movie/${encodeURIComponent(this.username)}/${encodeURIComponent(this.password)}/${streamId}.${extension}`;
  }

  buildSeriesStreamUrl(episodeId: string | number, extension = 'mp4'): string {
    return `${this.baseUrl}/series/${encodeURIComponent(this.username)}/${encodeURIComponent(this.password)}/${episodeId}.${extension}`;
  }

  // --- Categories --------------------------------------------------------

  private mapCategories(raw: unknown, kind: Category['kind']): Category[] {
    if (!Array.isArray(raw)) return [];
    return (raw as RawCategory[])
      .map((entry): Category | null => {
        const id = asString(entry?.category_id);
        if (!id) return null;
        return {
          id,
          name: asString(entry?.category_name) ?? 'Unnamed',
          kind,
          parentId: asString(entry?.parent_id),
        };
      })
      .filter((entry): entry is Category => entry !== null);
  }

  async getLiveCategories(): Promise<Category[]> {
    return this.mapCategories(await this.call<unknown>({ action: 'get_live_categories' }), 'live');
  }

  async getVodCategories(): Promise<Category[]> {
    return this.mapCategories(await this.call<unknown>({ action: 'get_vod_categories' }), 'movie');
  }

  async getSeriesCategories(): Promise<Category[]> {
    return this.mapCategories(
      await this.call<unknown>({ action: 'get_series_categories' }),
      'series',
    );
  }

  // --- Streams -----------------------------------------------------------

  async getLiveStreams(categoryId?: string): Promise<Channel[]> {
    const raw = await this.call<unknown>({
      action: 'get_live_streams',
      category_id: categoryId ?? undefined,
    });
    if (!Array.isArray(raw)) return [];

    return (raw as RawLiveStream[])
      .map((entry): Channel | null => {
        const streamId = asString(entry?.stream_id);
        if (!streamId) return null;

        // Panels frequently set direct_source to the raw MPEG-TS endpoint, and
        // trusting it breaks playback on iOS: AVFoundation cannot play a
        // progressive TS live stream and fails with CoreMedia -12939, "byte
        // range and no content length". Since panels set it on some channels
        // and not others, honouring it produces a playlist where seemingly
        // random channels refuse to play. Only take direct_source when it is
        // already HLS; otherwise build the .m3u8 URL.
        const directSource = asString(entry?.direct_source);
        const streamUrl =
          directSource && isHlsUrl(directSource)
            ? directSource
            : this.buildLiveStreamUrl(streamId);

        return {
          id: `live:${streamId}`,
          name: asString(entry?.name) ?? 'Unnamed',
          kind: 'live',
          categoryId: asString(entry?.category_id),
          logo: asString(entry?.stream_icon),
          epgChannelId: asString(entry?.epg_channel_id),
          streamId,
          streamUrl,
          number: asNumber(entry?.num),
          hasArchive: asNumber(entry?.tv_archive) === 1,
        };
      })
      .filter((entry): entry is Channel => entry !== null);
  }

  async getVodStreams(categoryId?: string): Promise<Channel[]> {
    const raw = await this.call<unknown>({
      action: 'get_vod_streams',
      category_id: categoryId ?? undefined,
    });
    if (!Array.isArray(raw)) return [];

    return (raw as RawVodStream[])
      .map((entry): Channel | null => {
        const streamId = asString(entry?.stream_id);
        if (!streamId) return null;
        const extension = asString(entry?.container_extension) ?? 'mp4';
        return {
          id: `movie:${streamId}`,
          name: asString(entry?.name) ?? 'Unnamed',
          kind: 'movie',
          categoryId: asString(entry?.category_id),
          logo: asString(entry?.stream_icon),
          streamId,
          containerExtension: extension,
          // Unlike live, a progressive file is what VOD actually is, so a
          // direct_source here is fine to use as given.
          streamUrl: asString(entry?.direct_source) ?? this.buildVodStreamUrl(streamId, extension),
          number: asNumber(entry?.num),
          plot: asString(entry?.plot),
          rating: asNumber(entry?.rating),
        };
      })
      .filter((entry): entry is Channel => entry !== null);
  }

  /** Series entries are browsable, not directly playable — no `streamUrl`. */
  async getSeries(categoryId?: string): Promise<Channel[]> {
    const raw = await this.call<unknown>({
      action: 'get_series',
      category_id: categoryId ?? undefined,
    });
    if (!Array.isArray(raw)) return [];

    return (raw as RawSeries[])
      .map((entry): Channel | null => {
        const seriesId = asString(entry?.series_id);
        if (!seriesId) return null;
        return {
          id: `series:${seriesId}`,
          name: asString(entry?.name) ?? 'Unnamed',
          kind: 'series',
          categoryId: asString(entry?.category_id),
          logo: asString(entry?.cover),
          seriesId,
          streamUrl: null,
          number: asNumber(entry?.num),
          plot: asString(entry?.plot),
          rating: asNumber(entry?.rating),
        };
      })
      .filter((entry): entry is Channel => entry !== null);
  }

  async getSeriesInfo(seriesId: string): Promise<SeriesDetail> {
    const raw = await this.call<Record<string, unknown>>({
      action: 'get_series_info',
      series_id: seriesId,
    });

    const info = (raw?.['info'] ?? {}) as Record<string, unknown>;
    const episodesBySeason = (raw?.['episodes'] ?? {}) as Record<string, unknown>;

    const seasons: SeriesSeason[] = Object.keys(episodesBySeason)
      .map((seasonKey) => {
        const list = episodesBySeason[seasonKey];
        if (!Array.isArray(list)) return null;

        const episodes: SeriesEpisode[] = list
          .map((item): SeriesEpisode | null => {
            const episode = item as Record<string, unknown>;
            const id = asString(episode['id']);
            if (!id) return null;
            const extension = asString(episode['container_extension']) ?? 'mp4';
            const episodeInfo = (episode['info'] ?? {}) as Record<string, unknown>;
            const parsedSeasonKey = Number(seasonKey);
            const seasonNumber =
              asNumber(episode['season']) ?? (Number.isFinite(parsedSeasonKey) ? parsedSeasonKey : 0);
            const episodeNumber = asNumber(episode['episode_num']) ?? 0;
            return {
              id,
              title: asString(episode['title']) ?? `Episode ${episodeNumber}`,
              season: seasonNumber,
              episode: episodeNumber,
              plot: asString(episodeInfo['plot']),
              durationSeconds: asNumber(episodeInfo['duration_secs']),
              image: asString(episodeInfo['movie_image']),
              containerExtension: extension,
              streamUrl: this.buildSeriesStreamUrl(id, extension),
            };
          })
          .filter((item): item is SeriesEpisode => item !== null)
          .sort((a, b) => a.episode - b.episode);

        if (episodes.length === 0) return null;
        const seasonKeyNumber = Number(seasonKey);
        const season = Number.isFinite(seasonKeyNumber)
          ? seasonKeyNumber
          : (episodes[0]?.season ?? 0);
        return { season, episodes };
      })
      .filter((entry): entry is SeriesSeason => entry !== null)
      .sort((a, b) => a.season - b.season);

    return {
      seriesId,
      name: asString(info['name']) ?? 'Unnamed',
      plot: asString(info['plot']),
      cover: asString(info['cover']),
      genre: asString(info['genre']),
      cast: asString(info['cast']),
      releaseDate: asString(info['releaseDate']) ?? asString(info['release_date']),
      seasons,
    };
  }

  // --- EPG ---------------------------------------------------------------

  /** `get_short_epg` — the handful of upcoming programmes for one channel. */
  async getShortEpg(streamId: string, limit = 4): Promise<EpgEntry[]> {
    const raw = await this.call<Record<string, unknown>>({
      action: 'get_short_epg',
      stream_id: streamId,
      limit,
    });

    const listings = raw?.['epg_listings'];
    if (!Array.isArray(listings)) return [];

    return (listings as RawEpgListing[])
      .map((entry): EpgEntry | null => {
        const start = secondsToMs(entry?.start_timestamp) ?? parsePanelDate(entry?.start);
        const end =
          secondsToMs(entry?.stop_timestamp) ??
          parsePanelDate(entry?.end) ??
          parsePanelDate(entry?.stop);
        if (start === null || end === null) return null;
        return {
          channelId: asString(entry?.channel_id) ?? streamId,
          title: decodeMaybeBase64(entry?.title) || 'No title',
          description: decodeMaybeBase64(entry?.description) || null,
          start,
          end,
          lang: asString(entry?.lang),
        };
      })
      .filter((entry): entry is EpgEntry => entry !== null)
      .sort((a, b) => a.start - b.start);
  }

  /** Full XMLTV guide as raw text. Feed it to `parseXmltv`. */
  async getXmltv(): Promise<string> {
    const url = buildUrl(`${this.baseUrl}/xmltv.php`, {
      username: this.username,
      password: this.password,
    });
    return httpGetText(url, { ...this.http, headers: { Accept: 'application/xml' } });
  }

  /** The provider's own full M3U export, for debugging or M3U-only fallback. */
  buildPlaylistUrl(type: 'm3u_plus' | 'm3u' = 'm3u_plus', output: 'ts' | 'm3u8' = 'm3u8'): string {
    return buildUrl(`${this.baseUrl}/get.php`, {
      username: this.username,
      password: this.password,
      type,
      output,
    });
  }
}
