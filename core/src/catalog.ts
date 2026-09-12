import { EpgIndex } from './epg';
import { IptvError } from './errors';
import { httpGetText, type HttpClientOptions } from './http';
import { parseM3uStrict } from './m3u';
import { XtreamClient } from './xtream';
import { parseXmltvAsync } from './xmltv';
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
  /**
   * The URL to play for a channel, rebuilt from the source rather than trusted.
   *
   * Favourites persist the whole channel, so a stored `streamUrl` can outlive
   * the logic that produced it. Rebuilding here means a change to URL
   * construction reaches saved channels instead of leaving them broken.
   */
  resolveStreamUrl(channel: Channel): string | null;
}

export interface OpenCatalogOptions extends HttpClientOptions {
  /** Skip the XMLTV download on open. The guide then loads on first use. */
  deferEpg?: boolean;
}

/**
 * Guides beyond this many characters are skipped rather than parsed.
 *
 * A runaway guide would otherwise be held in memory as one string and walked
 * by regex; per-channel `get_short_epg` is the better answer at that size.
 */
const MAX_GUIDE_CHARS = 32_000_000;

/** Window kept from a guide: enough for "now/next" plus a couple of days. */
const GUIDE_PAST_MS = 6 * 60 * 60 * 1000;
const GUIDE_FUTURE_MS = 3 * 24 * 60 * 60 * 1000;

async function parseGuide(xml: string) {
  if (xml.length > MAX_GUIDE_CHARS) {
    throw new IptvError('invalid_response', 'The XMLTV guide is too large to parse on device.');
  }
  const now = Date.now();
  return parseXmltvAsync(xml, {
    from: now - GUIDE_PAST_MS,
    to: now + GUIDE_FUTURE_MS,
  });
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
        const parsed = await parseGuide(xml);
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

    // Only consult XMLTV if it happens to be loaded already. Priming it here
    // would mean a list row triggering a multi-megabyte download and parse.
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

    const cached = this.epgIndex?.entriesFor(channel) ?? [];
    if (cached.length > 0) return cached;

    // The guide screen is an explicit user action with its own loading state,
    // so a per-channel request here is proportionate.
    if (channel.streamId) {
      const listings = await this.client
        .getShortEpg(channel.streamId, 24)
        .catch((): EpgEntry[] => []);
      if (listings.length > 0) return listings;
    }

    // Last resort: the full XMLTV guide, parsed in chunks.
    await this.primeEpg();
    return this.epgIndex?.entriesFor(channel) ?? [];
  }

  async getSeriesDetail(channel: Channel): Promise<SeriesDetail> {
    if (!channel.seriesId) {
      throw new IptvError('not_found', 'This entry is not a series.');
    }
    return this.client.getSeriesInfo(channel.seriesId);
  }

  resolveStreamUrl(channel: Channel): string | null {
    if (channel.streamId) {
      if (channel.kind === 'live') return this.client.buildLiveStreamUrl(channel.streamId);
      if (channel.kind === 'movie') {
        return this.client.buildVodStreamUrl(
          channel.streamId,
          channel.containerExtension ?? 'mp4',
        );
      }
    }
    return channel.streamUrl ?? null;
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
        const parsed = await parseGuide(xml);
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

  resolveStreamUrl(channel: Channel): string | null {
    // A playlist entry's URL is the only thing there is; nothing to rebuild.
    return channel.streamUrl ?? null;
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
