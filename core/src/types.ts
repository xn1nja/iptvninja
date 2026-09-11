/**
 * Shared, platform-agnostic domain types.
 *
 * Nothing in this file (or anywhere else under /core) may import React,
 * React Native, Expo, or any other platform SDK. The Tizen/webOS client that
 * is planned later consumes this package as-is.
 */

/** The kind of catalogue a stream belongs to. */
export type MediaKind = 'live' | 'movie' | 'series';

export const MEDIA_KINDS: readonly MediaKind[] = ['live', 'movie', 'series'];

/** How a source gets its channel list. */
export type SourceKind = 'xtream' | 'm3u';

/** Credentials for an Xtream Codes panel (`player_api.php`). */
export interface XtreamSourceConfig {
  kind: 'xtream';
  /** Panel base URL, e.g. `http://example.com:8080`. Stored normalised. */
  serverUrl: string;
  username: string;
  password: string;
}

/** An M3U/M3U8 playlist, either remote (`url`) or pasted/imported (`content`). */
export interface M3uSourceConfig {
  kind: 'm3u';
  /** Remote playlist URL. Mutually exclusive with `content` in practice. */
  url?: string;
  /** Inline playlist text, for pasted or file-imported playlists. */
  content?: string;
  /** Optional XMLTV URL for EPG. `url-tvg` in the playlist header wins if absent. */
  epgUrl?: string;
}

export type SourceConfig = XtreamSourceConfig | M3uSourceConfig;

/** A saved account/playlist the user can switch between. */
export interface Source {
  id: string;
  /** User-facing label, e.g. "Living room provider". */
  name: string;
  createdAt: number;
  config: SourceConfig;
}

export interface Category {
  id: string;
  name: string;
  kind: MediaKind;
  parentId?: string | null;
  /** Number of channels in this category, when cheaply known. */
  count?: number;
}

/**
 * One playable (or browsable, for series) entry.
 *
 * `id` is only unique within a single source; the UI keys favourites on
 * `${sourceId}:${channel.id}`.
 */
export interface Channel {
  id: string;
  name: string;
  kind: MediaKind;
  categoryId?: string | null;
  /** `group-title` for M3U, category name for Xtream. Kept for display/search. */
  categoryName?: string | null;
  logo?: string | null;
  /** `tvg-id` / `epg_channel_id`. Links the channel to XMLTV data. */
  epgChannelId?: string | null;
  /** Fully-resolved playable URL. Null for series (pick an episode first). */
  streamUrl?: string | null;
  /** Xtream numeric stream id, used for `get_short_epg`. */
  streamId?: string | null;
  /** Xtream series id, used for `get_series_info`. */
  seriesId?: string | null;
  /** Channel number as presented by the provider. */
  number?: number | null;
  containerExtension?: string | null;
  plot?: string | null;
  rating?: number | null;
  /** Provider-declared catch-up/archive support (live only). */
  hasArchive?: boolean;
}

export interface SeriesEpisode {
  id: string;
  title: string;
  season: number;
  episode: number;
  plot?: string | null;
  durationSeconds?: number | null;
  image?: string | null;
  containerExtension?: string | null;
  streamUrl?: string | null;
}

export interface SeriesSeason {
  season: number;
  name?: string | null;
  episodes: SeriesEpisode[];
}

export interface SeriesDetail {
  seriesId: string;
  name: string;
  plot?: string | null;
  cover?: string | null;
  genre?: string | null;
  cast?: string | null;
  releaseDate?: string | null;
  seasons: SeriesSeason[];
}

/** A single programme in the guide. Times are epoch milliseconds, UTC. */
export interface EpgEntry {
  /** XMLTV channel id / Xtream `epg_channel_id`. */
  channelId: string;
  title: string;
  description?: string | null;
  start: number;
  end: number;
  lang?: string | null;
}

export interface NowNext {
  now?: EpgEntry;
  next?: EpgEntry;
}

/** Result of authenticating against an Xtream panel. */
export interface XtreamUserInfo {
  username: string;
  /** Raw provider status string, e.g. "Active", "Expired", "Banned". */
  status: string;
  isActive: boolean;
  isTrial: boolean;
  /** Subscription expiry, epoch ms. Null means "unlimited" per the panel. */
  expiresAt: number | null;
  createdAt: number | null;
  activeConnections: number;
  maxConnections: number;
  allowedOutputFormats: string[];
  message?: string | null;
}

export interface XtreamServerInfo {
  url?: string | null;
  port?: string | null;
  httpsPort?: string | null;
  serverProtocol?: string | null;
  timezone?: string | null;
  /** Panel clock, epoch ms, when reported. */
  timeNow: number | null;
}

export interface XtreamAuth {
  user: XtreamUserInfo;
  server: XtreamServerInfo;
}

/** Everything a source can offer, discovered once at load time. */
export interface SourceCapabilities {
  live: boolean;
  movie: boolean;
  series: boolean;
  epg: boolean;
}
