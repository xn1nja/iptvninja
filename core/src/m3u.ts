import { IptvError } from './errors';
import { decodeEntities } from './text';
import type { Category, Channel, MediaKind } from './types';

export interface M3uPlaylist {
  channels: Channel[];
  categories: Category[];
  /** `url-tvg` / `x-tvg-url` from the `#EXTM3U` header, when present. */
  epgUrl?: string;
}

export interface ParseM3uOptions {
  /**
   * Category name used for entries with no `group-title`.
   * Defaults to "Uncategorised".
   */
  fallbackGroup?: string;
}

const UNCATEGORISED = 'Uncategorised';

/**
 * Pulls `key="value"`, `key='value'` and bare `key=value` pairs out of an
 * `#EXTINF` line. Playlists in the wild use all three, sometimes in one file.
 */
export function parseExtinfAttributes(line: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const pattern = /([A-Za-z0-9_-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s,]+))/g;

  let match: RegExpExecArray | null = pattern.exec(line);
  while (match !== null) {
    const key = (match[1] ?? '').toLowerCase();
    const value = match[2] ?? match[3] ?? match[4] ?? '';
    if (key) attributes[key] = decodeEntities(value.trim());
    match = pattern.exec(line);
  }
  return attributes;
}

/**
 * Guesses the media kind from the stream URL.
 *
 * Xtream-backed playlists put `/live/`, `/movie/` and `/series/` in the path,
 * which is the only reliable signal a flat M3U gives us. Everything else is
 * treated as live, which is the safe default for a player.
 */
export function inferMediaKind(url: string, groupTitle = ''): MediaKind {
  const lowerUrl = url.toLowerCase();
  if (/\/series\//.test(lowerUrl)) return 'series';
  if (/\/movie(s)?\//.test(lowerUrl)) return 'movie';

  // VOD exposed as a plain file rather than a stream.
  if (/\.(mp4|mkv|avi|mov|m4v)(\?|$)/.test(lowerUrl)) {
    return /series|season|s\d{1,2}\s?e\d{1,2}/i.test(groupTitle) ? 'series' : 'movie';
  }
  return 'live';
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'group';
}

/**
 * Parses an M3U/M3U8 playlist into channels grouped by `group-title`.
 *
 * Tolerant by design — real provider playlists contain BOMs, CRLF line endings,
 * `#EXTGRP`, `#EXTVLCOPT`, `#KODIPROP` and blank lines between entries.
 */
export function parseM3u(text: string, options: ParseM3uOptions = {}): M3uPlaylist {
  const fallbackGroup = options.fallbackGroup ?? UNCATEGORISED;
  const stripped = text.replace(/^﻿/, '');
  const lines = stripped.split(/\r\n|\r|\n/);

  const channels: Channel[] = [];
  const categoryOrder: string[] = [];
  const categoryCounts = new Map<string, { name: string; kind: MediaKind; count: number }>();
  const seenIds = new Set<string>();

  let epgUrl: string | undefined;
  let pending: { name: string; attributes: Record<string, string> } | null = null;
  let pendingGroupOverride: string | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (/^#EXTM3U/i.test(line)) {
      const header = parseExtinfAttributes(line);
      epgUrl = header['url-tvg'] || header['x-tvg-url'] || header['tvg-url'] || epgUrl;
      continue;
    }

    if (/^#EXTINF/i.test(line)) {
      const commaIndex = line.indexOf(',');
      const attributePart = commaIndex >= 0 ? line.slice(0, commaIndex) : line;
      const displayName = commaIndex >= 0 ? line.slice(commaIndex + 1).trim() : '';
      pending = {
        name: decodeEntities(displayName),
        attributes: parseExtinfAttributes(attributePart),
      };
      pendingGroupOverride = null;
      continue;
    }

    if (/^#EXTGRP\s*:/i.test(line)) {
      pendingGroupOverride = line.replace(/^#EXTGRP\s*:/i, '').trim() || null;
      continue;
    }

    // #EXTVLCOPT, #KODIPROP, #PLAYLIST, comments — nothing we act on yet.
    if (line.startsWith('#')) continue;

    if (!pending) {
      // A bare URL with no preceding #EXTINF. Still playable, so keep it.
      pending = { name: line.split('/').pop() || line, attributes: {} };
    }

    const attributes = pending.attributes;
    const url = line;
    const groupTitle = attributes['group-title'] || pendingGroupOverride || fallbackGroup;
    const kind = inferMediaKind(url, groupTitle);
    const categoryId = `${kind}:${slugify(groupTitle)}`;
    const name = pending.name || attributes['tvg-name'] || 'Unnamed';

    let id = attributes['tvg-id'] || attributes['tvg-name'] || `${categoryId}:${name}`;
    if (seenIds.has(id)) {
      // tvg-id is not guaranteed unique; keep every entry addressable anyway.
      id = `${id}#${channels.length}`;
    }
    seenIds.add(id);

    const numberRaw = attributes['tvg-chno'] || attributes['channel-number'] || attributes['tvg-num'];
    const parsedNumber = numberRaw ? Number.parseInt(numberRaw, 10) : Number.NaN;

    channels.push({
      id,
      name,
      kind,
      categoryId,
      categoryName: groupTitle,
      logo: attributes['tvg-logo'] || null,
      epgChannelId: attributes['tvg-id'] || null,
      streamUrl: url,
      number: Number.isFinite(parsedNumber) ? parsedNumber : null,
    });

    const existing = categoryCounts.get(categoryId);
    if (existing) {
      existing.count += 1;
    } else {
      categoryCounts.set(categoryId, { name: groupTitle, kind, count: 1 });
      categoryOrder.push(categoryId);
    }

    pending = null;
    pendingGroupOverride = null;
  }

  const categories: Category[] = categoryOrder.map((id) => {
    const entry = categoryCounts.get(id);
    return {
      id,
      name: entry?.name ?? UNCATEGORISED,
      kind: entry?.kind ?? 'live',
      count: entry?.count ?? 0,
    };
  });

  return epgUrl ? { channels, categories, epgUrl } : { channels, categories };
}

/** `parseM3u`, but an empty result is an error rather than an empty screen. */
export function parseM3uStrict(text: string, options: ParseM3uOptions = {}): M3uPlaylist {
  if (!/#EXTM3U/i.test(text) && !/#EXTINF/i.test(text)) {
    throw new IptvError(
      'invalid_response',
      'That does not look like an M3U playlist (no #EXTM3U or #EXTINF found).',
    );
  }
  const playlist = parseM3u(text, options);
  if (playlist.channels.length === 0) {
    throw new IptvError('empty_playlist', 'The playlist contained no channels.');
  }
  return playlist;
}
