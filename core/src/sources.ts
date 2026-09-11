import { IptvError } from './errors';
import { normaliseBaseUrl } from './http';
import { JsonStore, type Storage } from './storage';
import type { M3uSourceConfig, Source, SourceConfig, XtreamSourceConfig } from './types';

const SOURCES_KEY = 'sources';
const ACTIVE_SOURCE_KEY = 'active-source';

/** Time-ordered, collision-resistant enough for a local list of accounts. */
function generateId(): string {
  const random = Math.random().toString(36).slice(2, 10);
  return `src_${Date.now().toString(36)}_${random}`;
}

export function validateXtreamConfig(config: XtreamSourceConfig): XtreamSourceConfig {
  const serverUrl = normaliseBaseUrl(config.serverUrl);
  const username = config.username.trim();
  const password = config.password;
  if (!username || !password) {
    throw new IptvError('invalid_credentials', 'Username and password are both required.');
  }
  return { kind: 'xtream', serverUrl, username, password };
}

export function validateM3uConfig(config: M3uSourceConfig): M3uSourceConfig {
  const content = config.content?.trim();
  const url = config.url?.trim();

  if (!content && !url) {
    throw new IptvError('invalid_url', 'Provide either a playlist URL or playlist contents.');
  }

  const result: M3uSourceConfig = { kind: 'm3u' };
  // A pasted playlist wins; the URL is then only kept if it is also valid.
  if (content) result.content = content;
  if (url) result.url = normaliseUrlKeepingPath(url);
  if (config.epgUrl?.trim()) result.epgUrl = normaliseUrlKeepingPath(config.epgUrl.trim());
  return result;
}

/** Like `normaliseBaseUrl` but keeps the query string, which playlists need. */
function normaliseUrlKeepingPath(input: string): string {
  const raw = input.trim();
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`;
  if (!/^https?:\/\/[^/?#\s]+/i.test(withScheme)) {
    throw new IptvError('invalid_url', `"${input}" is not a valid URL.`);
  }
  return withScheme;
}

export function validateSourceConfig(config: SourceConfig): SourceConfig {
  return config.kind === 'xtream' ? validateXtreamConfig(config) : validateM3uConfig(config);
}

/**
 * The saved-accounts list plus which one is active.
 *
 * Persistence goes through the injected `Storage`, so the same repository backs
 * the mobile app (AsyncStorage) and any future TV client (localStorage/Tizen).
 */
export class SourceRepository {
  private readonly store: JsonStore;

  constructor(storage: Storage, namespace = 'iptv-ninja') {
    this.store = new JsonStore(storage, namespace);
  }

  async list(): Promise<Source[]> {
    const sources = await this.store.read<Source[]>(SOURCES_KEY, []);
    return Array.isArray(sources) ? sources : [];
  }

  async get(id: string): Promise<Source | null> {
    const sources = await this.list();
    return sources.find((source) => source.id === id) ?? null;
  }

  async add(name: string, config: SourceConfig): Promise<Source> {
    const trimmedName = name.trim();
    if (!trimmedName) {
      throw new IptvError('invalid_url', 'Give this playlist a name.');
    }

    const source: Source = {
      id: generateId(),
      name: trimmedName,
      createdAt: Date.now(),
      config: validateSourceConfig(config),
    };

    const sources = await this.list();
    sources.push(source);
    await this.store.write(SOURCES_KEY, sources);

    // First source added becomes the active one, so the app has something to show.
    const active = await this.getActiveId();
    if (!active) await this.setActiveId(source.id);

    return source;
  }

  async update(id: string, patch: { name?: string; config?: SourceConfig }): Promise<Source> {
    const sources = await this.list();
    const index = sources.findIndex((source) => source.id === id);
    const existing = sources[index];
    if (index < 0 || !existing) {
      throw new IptvError('not_found', 'That playlist no longer exists.');
    }

    const updated: Source = {
      ...existing,
      ...(patch.name !== undefined ? { name: patch.name.trim() || existing.name } : {}),
      ...(patch.config !== undefined ? { config: validateSourceConfig(patch.config) } : {}),
    };
    sources[index] = updated;
    await this.store.write(SOURCES_KEY, sources);
    return updated;
  }

  async remove(id: string): Promise<void> {
    const sources = await this.list();
    const remaining = sources.filter((source) => source.id !== id);
    await this.store.write(SOURCES_KEY, remaining);

    if ((await this.getActiveId()) === id) {
      const next = remaining[0];
      if (next) await this.setActiveId(next.id);
      else await this.store.remove(ACTIVE_SOURCE_KEY);
    }
  }

  async getActiveId(): Promise<string | null> {
    return this.store.read<string | null>(ACTIVE_SOURCE_KEY, null);
  }

  async setActiveId(id: string): Promise<void> {
    await this.store.write(ACTIVE_SOURCE_KEY, id);
  }

  /** The active source, falling back to the first one if the pointer is stale. */
  async getActive(): Promise<Source | null> {
    const sources = await this.list();
    if (sources.length === 0) return null;

    const activeId = await this.getActiveId();
    const active = sources.find((source) => source.id === activeId);
    if (active) return active;

    const first = sources[0] ?? null;
    if (first) await this.setActiveId(first.id);
    return first;
  }
}
