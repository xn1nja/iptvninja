import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  FavouritesRepository,
  SourceRepository,
  describeError,
  openCatalog,
  type Catalog,
  type Channel,
  type Source,
  type SourceConfig,
} from '@iptv-ninja/core';

import { mobileStorage } from '../platform/storage';

/**
 * The app's single store.
 *
 * Everything here is a thin wrapper over core: this file owns React state and
 * nothing else, so the same flow can be rebuilt on a TV client against the
 * same repositories without porting any logic.
 */

export type CatalogStatus = 'idle' | 'loading' | 'ready' | 'error';

interface AppStateValue {
  ready: boolean;

  sources: Source[];
  activeSource: Source | null;
  addSource: (name: string, config: SourceConfig) => Promise<Source>;
  removeSource: (id: string) => Promise<void>;
  selectSource: (id: string) => Promise<void>;

  catalog: Catalog | null;
  catalogStatus: CatalogStatus;
  catalogError: string | null;
  reloadCatalog: () => Promise<void>;

  favourites: Channel[];
  isFavourite: (channelId: string) => boolean;
  toggleFavourite: (channel: Channel) => Promise<void>;
}

const AppStateContext = createContext<AppStateValue | null>(null);

const sourceRepository = new SourceRepository(mobileStorage);
const favouritesRepository = new FavouritesRepository(mobileStorage);

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [sources, setSources] = useState<Source[]>([]);
  const [activeSource, setActiveSource] = useState<Source | null>(null);

  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [catalogStatus, setCatalogStatus] = useState<CatalogStatus>('idle');
  const [catalogError, setCatalogError] = useState<string | null>(null);

  const [favourites, setFavourites] = useState<Channel[]>([]);

  // Guards against a slow catalogue load landing after the user has already
  // switched to a different source.
  const loadToken = useRef(0);

  const loadCatalogFor = useCallback(async (source: Source | null) => {
    const token = (loadToken.current += 1);

    if (!source) {
      setCatalog(null);
      setCatalogStatus('idle');
      setCatalogError(null);
      return;
    }

    setCatalogStatus('loading');
    setCatalogError(null);

    try {
      // The XMLTV guide can be tens of megabytes, so it is never fetched as
      // part of opening a source.
      const loaded = await openCatalog(source, { deferEpg: true, timeoutMs: 25_000 });
      if (token !== loadToken.current) return;
      setCatalog(loaded);
      setCatalogStatus('ready');
      // Deliberately not priming the EPG here. The full XMLTV guide can run to
      // tens of megabytes, and parsing it on the single JS thread froze the UI
      // the moment a playlist finished loading. Now/next comes from the far
      // cheaper per-channel endpoint instead, and the guide screen loads the
      // full document on demand.
    } catch (error) {
      if (token !== loadToken.current) return;
      setCatalog(null);
      setCatalogStatus('error');
      setCatalogError(describeError(error));
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const [storedSources, active] = await Promise.all([
        sourceRepository.list(),
        sourceRepository.getActive(),
      ]);
      if (cancelled) return;

      setSources(storedSources);
      setActiveSource(active);
      setReady(true);

      if (active) {
        setFavourites(await favouritesRepository.list(active.id));
        await loadCatalogFor(active);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loadCatalogFor]);

  const selectSource = useCallback(
    async (id: string) => {
      await sourceRepository.setActiveId(id);
      const next = await sourceRepository.get(id);
      setActiveSource(next);
      setFavourites(next ? await favouritesRepository.list(next.id) : []);
      await loadCatalogFor(next);
    },
    [loadCatalogFor],
  );

  const addSource = useCallback(
    async (name: string, config: SourceConfig) => {
      const source = await sourceRepository.add(name, config);
      setSources(await sourceRepository.list());
      // A freshly added playlist is what the user wants to look at next.
      await selectSource(source.id);
      return source;
    },
    [selectSource],
  );

  const removeSource = useCallback(
    async (id: string) => {
      await sourceRepository.remove(id);
      await favouritesRepository.clear(id);

      const [remaining, active] = await Promise.all([
        sourceRepository.list(),
        sourceRepository.getActive(),
      ]);
      setSources(remaining);
      setActiveSource(active);
      setFavourites(active ? await favouritesRepository.list(active.id) : []);
      await loadCatalogFor(active);
    },
    [loadCatalogFor],
  );

  const reloadCatalog = useCallback(async () => {
    await loadCatalogFor(activeSource);
  }, [activeSource, loadCatalogFor]);

  const favouriteIds = useMemo(
    () => new Set(favourites.map((channel) => channel.id)),
    [favourites],
  );

  const isFavourite = useCallback(
    (channelId: string) => favouriteIds.has(channelId),
    [favouriteIds],
  );

  const toggleFavourite = useCallback(
    async (channel: Channel) => {
      if (!activeSource) return;
      await favouritesRepository.toggle(activeSource.id, channel);
      setFavourites(await favouritesRepository.list(activeSource.id));
    },
    [activeSource],
  );

  const value = useMemo<AppStateValue>(
    () => ({
      ready,
      sources,
      activeSource,
      addSource,
      removeSource,
      selectSource,
      catalog,
      catalogStatus,
      catalogError,
      reloadCatalog,
      favourites,
      isFavourite,
      toggleFavourite,
    }),
    [
      ready,
      sources,
      activeSource,
      addSource,
      removeSource,
      selectSource,
      catalog,
      catalogStatus,
      catalogError,
      reloadCatalog,
      favourites,
      isFavourite,
      toggleFavourite,
    ],
  );

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState(): AppStateValue {
  const value = useContext(AppStateContext);
  if (!value) {
    throw new Error('useAppState must be used inside <AppStateProvider>.');
  }
  return value;
}
