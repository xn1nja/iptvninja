import { normaliseForSearch } from './text';
import type { Channel } from './types';

export interface SearchOptions {
  limit?: number;
}

/**
 * Ranked substring search over channel names.
 *
 * Every token of the query has to appear somewhere in the channel name or its
 * category; results starting with the query rank first, then whole-word hits,
 * then the rest. Good enough for tens of thousands of channels without an
 * index, which is the realistic size of a provider playlist.
 */
export function searchChannels(
  channels: readonly Channel[],
  query: string,
  options: SearchOptions = {},
): Channel[] {
  const needle = normaliseForSearch(query);
  if (!needle) return [];

  const tokens = needle.split(' ').filter(Boolean);
  const limit = options.limit ?? 200;
  const scored: Array<{ channel: Channel; score: number }> = [];

  for (const channel of channels) {
    const name = normaliseForSearch(channel.name);
    const haystack = channel.categoryName
      ? `${name} ${normaliseForSearch(channel.categoryName)}`
      : name;

    if (!tokens.every((token) => haystack.includes(token))) continue;

    let score = 3;
    if (name.includes(needle)) score = 2;
    if (name.startsWith(needle)) score = 0;
    else if (name.includes(` ${needle}`)) score = 1;

    scored.push({ channel, score });
    // Cheap guard against pathological playlists; we still sort what we kept.
    if (scored.length >= limit * 4) break;
  }

  return scored
    .sort((a, b) => a.score - b.score || a.channel.name.localeCompare(b.channel.name))
    .slice(0, limit)
    .map((entry) => entry.channel);
}
