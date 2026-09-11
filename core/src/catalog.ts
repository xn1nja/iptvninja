import { EpgIndex } from './epg';
import { IptvError } from './errors';
import { httpGetText, type HttpClientOptions } from './http';
import { parseM3uStrict } from './m3u';
import { XtreamClient } from './xtream';
import { parseXmltv } from './xmltv';
import type {
  Category,
  Channel,
  EpgEntry,
  MediaKind,
  NowNext,
  SeriesDetail,
  Source,
  SourceCapabilities,
  XtreamAuth,
} from './types';

/**
 * What the UI talks to. One interface over both source kinds, so screens never
 * branch on Xtream vs M3U and the Tizen client can reuse the same flow.
 */
export interface Catalog {
  readonly source: Source;
  readonly capabilities: SourceCapabilities;
  /** Populated for Xtream sources after `openCatalog` authenticates. */
  readonly auth?: XtreamAuth;

  getCategories(kind: MediaKind): Promise<Category[]>;
  getChannels(kind: MediaKind, categoryId?: string): Promise<Channel[]>;
  /** Everything, for global search and favourites resolution. */
  getAllChannels(): Promise<Channel[]>;
  getNowNext(channel: Channel): Promise<NowNext>;
  /** Programmes for a guide view. Empty when the source has no EPG. */
  getGuide(channel: Channel): Promise<EpgEntry[]>;
  getSeriesDetail(channel: Channel): Promise<SeriesDetail>;
  /** Preloads the XMLTV guide. Safe to skip; called lazily otherwise. */
  primeEpg(): Promise<void>;
}

export interface OpenCatalogOptions extends HttpClientOptions {
  /** Skip the XMLTV download on open. The guide then loads on first use. */
  deferEpg?: boolean;
}

function emptyCapabilities(): SourceCapabilities {
  return { live: false, movie: false, series: false, epg: false };
}

/** Xtream-backed catalogue. Categories and streams come from `player_api.php`. */
class XtreamCatalog implements Catalog {
  readonly capabilities: SourceCapabilities = emptyCapabilities();
  auth?: XtreamAuth;

  private readonly categoryCache = new Map<MediaKind, Category[]>();
  private readonly channelCache = new Map<string, Channel[]>();
  private epgIndex: EpgIndex | null = null;
  private epgLoad: Promise<void> | null = null;

  constructor(
    readonly source: Source,
    private readonly client: XtreamClient,
    private readonly options: OpenCatalogOptions,
  ) {}

  async initialise(): Promise<void> {
    this.auth = await this.client.authenticate();

    // Panels advertise nothing about which sections exist, so probe them.
    // A failure here is not fatal: the section is simply hidden.
    const [live, movie, series] = await Promise.all([
      this.client.getLiveCategories().catch(() => null),
      this.client.getVodCategories().catch(() => null),
      this.client.getSeriesCategories().catch(() => null),
    ]);

    if (live) this.categoryCache.set('live', live);
    if (movie) this.categoryCache.set('movie', movie);
    if (series) this.categoryCache.set('series', series);

    this.capabilities.live = (live?.length ?? 0) > 0;
    this.capabilities.movie = (movie?.length ?? 0) > 0;
    this.capabilities.series = (series?.length ?? 0) > 0;
    // Xtream always offers get_short_epg, even when XMLTV is unavailable.
    this.capabilities.epg = true;

    if (!this.options.deferEpg) await this.primeEpg();
  }

  async getCategories(kind: MediaKind): Promise<Category[]> {
    const cached = this.categoryCache.get(kind);
    if (cached) return cached;

    const categories =
      kind === 'live'
        ? await this.client.getLiveCategories()
        : kind === 'movie'
          ? await this.client.getVodCategories()
          : await this.client.getSeriesCategories();

    this.categoryCache.set(kind, categories);
    return categories;
  }

  async getChannels(kind: MediaKind, categoryId?: string): Promise<Channel[]> {
    const cacheKey = `${kind}:${categoryId ?? 'all'}`;
    const cached = this.channelCache.get(cacheKey);
    if (cached) return cached;

    const channels =
      kind === 'live'
        ? await this.client.getLiveStreams(categoryId)
        : kind === 'movie'
          ? await this.client.getVodStreams(categoryId)
          : await this.client.getSeries(categoryId);

    // Category names make search results readable and are cheap to attach here.
    const categories = await this.getCategories(kind).catch((): Category[] => []);
    const namesById = new Map(categories.map((category) => [category.id, category.name]));
    const enriched = channels.map((channel) => ({
      ...channel,
      categoryName: channel.categoryId ? (namesById.get(channel.categoryId) ?? null) : null,
    }));

    this.channelCache.set(cacheKey, enriched);
    return enriched;
  }

  async getAllChannels(): Promise<Channel[]> {
    const kinds: MediaKind[] = [];
    if (this.capabilities.live) kinds.push('live');
    if (this.capabilities.movie) kinds.push('movie');
    if (this.capabilities.series) kinds.push('series');

    const lists = await Promise.all(
      kinds.map((kind) => this.getChannels(kind).catch((): Channel[] => [])),
    );
    return lists.flat();
  }

  /**
   * XMLTV is a single large download, so it is fetched at most once and
   * shared. Providers frequently 404 it; that is not an error worth surfacing.
   */
  async primeEpg(): Promise<void> {
    if (this.epgIndex) return;
    if (this.epgLoad) return this.epgLoad;

    this.epgLoad = (async () => {
      try {
        const xml = await this.client.getXmltv();
        const parsed = parseXmltv(xml);
        const aliases: Record<string, string[]> = {};
        for (const channel of parsed.channels) {
          if (channel.displayNames.length > 0) aliases[channel.id] = channel.displayNames;
        }
        this.epgIndex = new EpgIndex(parsed.programmes, aliases);
      } catch {
        // Fall back to per-channel get_short_epg.
        this.epgIndex = new EpgIndex([]);
      } finally {
        this.epgLoad = null;
      }
    })();

    return this.epgLoad;
  }

  async getNowNext(channel: Channel): Promise<NowNext> {
    if (channel.kind !== 'live') return {};

    await this.primeEpg();
    const fromXmltv = this.epgIndex?.nowNextFor(channel) ?? {};
    if (fromXmltv.now || fromXmltv.next) return fromXmltv;

    if (!channel.streamId) return {};
    try {
      const listings = await this.client.getShortEpg(channel.streamId, 4);
      const now = Date.now();
      const current = listings.find((entry) => entry.start <= now && entry.end > now);
      const upcoming = listings.find((entry) => entry.start > now);
      return {
        ...(current ? { now: current } : {}),
        ...(upcoming ? { next: upcoming } : {}),
      };
    } catch {
      return {};
    }
  }

  async getGuide(channel: Channel): Promise<EpgEntry[]> {
    if (channel.kind !== 'live') return [];

    await this.primeEpg();
    const fromXmltv = this.epgIndex?.entriesFor(channel) ?? [];
    if (fromXmltv.length > 0) return fromXmltv;

    if (!channel.streamId) return [];
    return this.client.getShortEpg(channel.streamId, 24).catch((): EpgEntry[] => []);
  }

  async getSeriesDetail(channel: Channel): Promise<SeriesDetail> {
    if (!channel.seriesId) {
      throw new IptvError('not_found', 'This entry is not a series.');
    }
    return this.client.getSeriesInfo(channel.seriesId);
  }
}

/** M3U-backed catalogue. One playlist download, grouped by `group-title`. */
class M3uCatalog implements Catalog {
  readonly capabilities: SourceCapabilities = emptyCapabilities();

  private channels: Channel[] = [];
  private categories: Category[] = [];
  private epgIndex: EpgIndex | null = null;
  private epgUrl: string | null = null;
  private epgLoad: Promise<void> | null = null;

  constructor(
    readonly source: Source,
    private readonly options: OpenCatalogOptions,
  ) {}

  async initialise(): Promise<void> {
    const config = this.source.config;
    if (config.kind !== 'm3u') {
      throw new IptvError('invalid_response', 'Expected an M3U source.');
    }

    const text = config.content
      ? config.content
      : await httpGetText(config.url as string, this.options);

    const playlist = parseM3uStrict(text);
    this.channels = playlist.channels;
    this.categories = playlist.categories;
    this.epgUrl = config.epgUrl ?? playlist.epgUrl ?? null;

    this.capabilities.live = playlist.categories.some((category) => category.kind === 'live');
    this.capabilities.movie = playlist.categories.some((category) => category.kind === 'movie');
    this.capabilities.series = playlist.categories.some((category) => category.kind === 'series');
    this.capabilities.epg = Boolean(this.epgUrl);

    if (this.epgUrl && !this.options.deferEpg) await this.primeEpg();
  }

  async getCategories(kind: MediaKind): Promise<Category[]> {
    return this.categories.filter((category) => category.kind === kind);
  }

  async getChannels(kind: MediaKind, categoryId?: string): Promise<Channel[]> {
    return this.channels.filter(
      (channel) =>
        channel.kind === kind && (categoryId === undefined || channel.categoryId === categoryId),
    );
  }

  async getAllChannels(): Promise<Channel[]> {
    return this.channels;
  }

  async primeEpg(): Promise<void> {
    if (this.epgIndex || !this.epgUrl) return;
    if (this.epgLoad) return this.epgLoad;

    this.epgLoad = (async () => {
      try {
        const xml = await httpGetText(this.epgUrl as string, this.options);
        const parsed = parseXmltv(xml);
        const aliases: Record<string, string[]> = {};
        for (const channel of parsed.channels) {
          if (channel.displayNames.length > 0) aliases[channel.id] = channel.displayNames;
        }
        this.epgIndex = new EpgIndex(parsed.programmes, aliases);
      } catch {
        this.epgIndex = new EpgIndex([]);
      } finally {
        this.epgLoad = null;
      }
    })();

    return this.epgLoad;
  }

  async getNowNext(channel: Channel): Promise<NowNext> {
    if (channel.kind !== 'live' || !this.epgUrl) return {};
    await this.primeEpg();
    return this.epgIndex?.nowNextFor(channel) ?? {};
  }

  async getGuide(channel: Channel): Promise<EpgEntry[]> {
    if (channel.kind !== 'live' || !this.epgUrl) return [];
    await this.primeEpg();
    return this.epgIndex?.entriesFor(channel) ?? [];
  }

  async getSeriesDetail(): Promise<SeriesDetail> {
    throw new IptvError(
      'not_found',
      'Plain M3U playlists do not expose seasons and episodes.',
    );
  }
}

/**
 * Loads a saved source into a ready-to-browse catalogue.
 *
 * Throws IptvError with a specific `code` for bad credentials, an expired
 * subscription, an unreachable server or an unusable playlist.
 */
export async function openCatalog(
  source: Source,
  options: OpenCatalogOptions = {},
): Promise<Catalog> {
  if (source.config.kind === 'xtream') {
    const client = new XtreamClient({
      serverUrl: source.config.serverUrl,
      username: source.config.username,
      password: source.config.password,
      ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
      ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
      ...(options.headers ? { headers: options.headers } : {}),
    });
    const catalog = new XtreamCatalog(source, client, options);
    await catalog.initialise();
    return catalog;
  }

  const catalog = new M3uCatalog(source, options);
  await catalog.initialise();
  return catalog;
}
