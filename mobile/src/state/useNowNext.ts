import { useEffect, useRef, useState } from 'react';
import type { Catalog, Channel, NowNext } from '@iptv-ninja/core';

/**
 * Resolves now/next for a list of channels, keyed by channel id.
 *
 * Guide lookups are cheap once XMLTV is parsed but expensive on an Xtream
 * panel that only offers `get_short_epg` (one request per channel), so this
 * fetches in small batches and caches per catalogue.
 */
export function useNowNext(
  catalog: Catalog | null,
  channels: readonly Channel[],
  enabled = true,
): Record<string, NowNext> {
  const [map, setMap] = useState<Record<string, NowNext>>({});
  const cache = useRef<{ catalog: Catalog | null; entries: Record<string, NowNext> }>({
    catalog: null,
    entries: {},
  });

  useEffect(() => {
    if (cache.current.catalog !== catalog) {
      cache.current = { catalog, entries: {} };
      setMap({});
    }
  }, [catalog]);

  useEffect(() => {
    if (!catalog || !enabled) return;

    const wanted = channels.filter(
      (channel) => channel.kind === 'live' && cache.current.entries[channel.id] === undefined,
    );
    if (wanted.length === 0) return;

    let cancelled = false;

    void (async () => {
      const BATCH = 12;
      for (let index = 0; index < wanted.length; index += BATCH) {
        if (cancelled) return;
        const batch = wanted.slice(index, index + BATCH);
        const results = await Promise.all(
          batch.map(async (channel) => {
            try {
              return [channel.id, await catalog.getNowNext(channel)] as const;
            } catch {
              return [channel.id, {} as NowNext] as const;
            }
          }),
        );
        if (cancelled) return;

        for (const [id, nowNext] of results) {
          cache.current.entries[id] = nowNext;
        }
        setMap({ ...cache.current.entries });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [catalog, channels, enabled]);

  return map;
}
