import { normaliseForSearch } from './text';
import type { Channel, EpgEntry, NowNext } from './types';

/** Picks the programme airing at `at`, plus the one after it. */
export function nowNext(entries: readonly EpgEntry[], at: number = Date.now()): NowNext {
  const sorted = [...entries].sort((a, b) => a.start - b.start);
  const result: NowNext = {};

  for (let i = 0; i < sorted.length; i += 1) {
    const entry = sorted[i];
    if (!entry) continue;
    if (entry.start <= at && entry.end > at) {
      result.now = entry;
      const following = sorted[i + 1];
      if (following) result.next = following;
      return result;
    }
    if (entry.start > at) {
      // Nothing is on right now (gap in the guide) — report the next thing up.
      result.next = entry;
      return result;
    }
  }
  return result;
}

/** 0..1 progress through the current programme, for a progress bar. */
export function programmeProgress(entry: EpgEntry, at: number = Date.now()): number {
  const span = entry.end - entry.start;
  if (span <= 0) return 0;
  const ratio = (at - entry.start) / span;
  return Math.min(1, Math.max(0, ratio));
}

/**
 * A lookup over a parsed XMLTV guide.
 *
 * Channels are indexed by `tvg-id` and, as a fallback, by normalised display
 * name — plenty of playlists ship a `tvg-id` that does not appear in the
 * guide, and matching on name recovers most of those.
 */
export class EpgIndex {
  private readonly byChannelId = new Map<string, EpgEntry[]>();
  private readonly aliasToChannelId = new Map<string, string>();

  constructor(entries: readonly EpgEntry[] = [], aliases: Record<string, string[]> = {}) {
    for (const entry of entries) {
      const bucket = this.byChannelId.get(entry.channelId);
      if (bucket) bucket.push(entry);
      else this.byChannelId.set(entry.channelId, [entry]);
    }
    for (const bucket of this.byChannelId.values()) {
      bucket.sort((a, b) => a.start - b.start);
    }
    for (const [channelId, names] of Object.entries(aliases)) {
      for (const name of names) {
        const key = normaliseForSearch(name);
        if (key && !this.aliasToChannelId.has(key)) this.aliasToChannelId.set(key, channelId);
      }
    }
  }

  get size(): number {
    return this.byChannelId.size;
  }

  private resolve(channel: Pick<Channel, 'name' | 'epgChannelId'>): string | null {
    const direct = channel.epgChannelId;
    if (direct && this.byChannelId.has(direct)) return direct;
    const alias = this.aliasToChannelId.get(normaliseForSearch(channel.name));
    if (alias && this.byChannelId.has(alias)) return alias;
    return null;
  }

  entriesFor(channel: Pick<Channel, 'name' | 'epgChannelId'>): EpgEntry[] {
    const id = this.resolve(channel);
    if (!id) return [];
    return this.byChannelId.get(id) ?? [];
  }

  nowNextFor(channel: Pick<Channel, 'name' | 'epgChannelId'>, at: number = Date.now()): NowNext {
    return nowNext(this.entriesFor(channel), at);
  }

  /** Programmes overlapping the `[from, to)` window, for a guide grid. */
  windowFor(
    channel: Pick<Channel, 'name' | 'epgChannelId'>,
    from: number,
    to: number,
  ): EpgEntry[] {
    return this.entriesFor(channel).filter((entry) => entry.end > from && entry.start < to);
  }
}

/** `20:30` in the device's locale, with a 24h fallback for odd runtimes. */
export function formatClock(timestamp: number, locale?: string): string {
  const date = new Date(timestamp);
  try {
    return date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: false });
  } catch {
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  }
}
