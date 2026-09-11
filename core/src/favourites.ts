import { JsonStore, type Storage } from './storage';
import type { Channel } from './types';

/**
 * Favourites, scoped per source so switching accounts does not mix them up.
 *
 * The whole channel is stored rather than just an id: a favourite has to
 * render (and play) on the Favourites screen before that source's catalogue
 * has been loaded.
 */
export class FavouritesRepository {
  private readonly store: JsonStore;

  constructor(storage: Storage, namespace = 'iptv-ninja') {
    this.store = new JsonStore(storage, namespace);
  }

  private keyFor(sourceId: string): string {
    return `favourites:${sourceId}`;
  }

  async list(sourceId: string): Promise<Channel[]> {
    return this.store.read<Channel[]>(this.keyFor(sourceId), []);
  }

  async has(sourceId: string, channelId: string): Promise<boolean> {
    const list = await this.list(sourceId);
    return list.some((entry) => entry.id === channelId);
  }

  /** Adds or removes the channel; resolves to its new favourite state. */
  async toggle(sourceId: string, channel: Channel): Promise<boolean> {
    const list = await this.list(sourceId);
    const index = list.findIndex((entry) => entry.id === channel.id);

    if (index >= 0) {
      list.splice(index, 1);
      await this.store.write(this.keyFor(sourceId), list);
      return false;
    }

    list.unshift(channel);
    await this.store.write(this.keyFor(sourceId), list);
    return true;
  }

  async clear(sourceId: string): Promise<void> {
    await this.store.remove(this.keyFor(sourceId));
  }
}
