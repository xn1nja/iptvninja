/**
 * The one persistence seam between core and a platform.
 *
 * Mobile plugs in AsyncStorage; a Tizen/webOS build plugs in localStorage or
 * the Tizen key/value store. Core never imports either.
 */
export interface Storage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

/** In-memory implementation, used by tests and as a no-persistence fallback. */
export class MemoryStorage implements Storage {
  private readonly map = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.map.has(key) ? (this.map.get(key) as string) : null;
  }

  async set(key: string, value: string): Promise<void> {
    this.map.set(key, value);
  }

  async remove(key: string): Promise<void> {
    this.map.delete(key);
  }
}

/**
 * Namespaced JSON access on top of a `Storage`.
 *
 * Reads never throw: a corrupt or half-written value falls back to the caller's
 * default rather than bricking the app on launch.
 */
export class JsonStore {
  constructor(
    private readonly storage: Storage,
    private readonly namespace = 'iptv-ninja',
  ) {}

  key(name: string): string {
    return `${this.namespace}:${name}`;
  }

  async read<T>(name: string, fallback: T): Promise<T> {
    try {
      const raw = await this.storage.get(this.key(name));
      if (raw === null || raw === '') return fallback;
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }

  async write(name: string, value: unknown): Promise<void> {
    await this.storage.set(this.key(name), JSON.stringify(value));
  }

  async remove(name: string): Promise<void> {
    await this.storage.remove(this.key(name));
  }
}
