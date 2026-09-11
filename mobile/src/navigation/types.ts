import type { Channel, MediaKind } from '@iptv-ninja/core';

export type RootStackParamList = {
  Tabs: undefined;
  ChannelList: { kind: MediaKind; categoryId: string; categoryName: string };
  Player: { channel: Channel; title?: string };
  Guide: { channel: Channel };
  SeriesDetail: { channel: Channel };
  AddSource: undefined;
};

export type TabParamList = {
  Browse: undefined;
  Search: undefined;
  Favourites: undefined;
  Playlists: undefined;
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
