import { useEffect, useRef, useState } from 'react';
import { InteractionManager } from 'react-native';
import type { Catalog, Channel, NowNext } from '@iptv-ninja/core';

/** Requests in flight at once. Enough to fill a screen without flooding the panel. */
const CONCURRENCY = 6;

/**
 * Resolves now/next for a list of channels, keyed by channel id.
 *
 * Pass only the channels actually on screen: on an Xtream source each lookup is
 * its own request, so handing this a whole 2,000-channel category would queue
 * 2,000 of them. Results are cached per catalogue, so scrolling back over a row
 * costs nothing.
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

    // Let navigation transitions and the first paint finish before adding
    // network work; a half-drawn list that cannot be tapped is worse than a
    // list whose EPG arrives a moment later.
    const interaction = InteractionManager.runAfterInteractions(() => {
      void (async () => {
        for (let index = 0; index < wanted.length; index += CONCURRENCY) {
          if (cancelled) return;

          const batch = wanted.slice(index, index + CONCURRENCY);
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
    });

    return () => {
      cancelled = true;
      interaction.cancel();
    };
  }, [catalog, channels, enabled]);

  return map;
}
