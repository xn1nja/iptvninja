import React from 'react';
import { FlatList, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { Channel } from '@iptv-ninja/core';

import { ChannelRow } from '../components/ChannelRow';
import { EmptyState, Screen } from '../components/ui';
import { useAppState } from '../state/AppState';
import { useNowNext } from '../state/useNowNext';
import { branding } from '../theme/branding';
import type { RootStackParamList } from '../navigation/types';

const { spacing } = branding;

/**
 * Favourites for the active source.
 *
 * Core stores the whole channel rather than just its id, so this screen works
 * before (and even without) the catalogue finishing its load.
 */
export function FavouritesScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { favourites, activeSource, catalog, toggleFavourite } = useAppState();

  const nowNext = useNowNext(catalog, favourites);

  const openChannel = (channel: Channel) => {
    if (channel.kind === 'series') {
      navigation.navigate('SeriesDetail', { channel });
      return;
    }
    navigation.navigate('Player', { channel });
  };

  if (!activeSource) {
    return (
      <EmptyState
        title={branding.copy.emptySourcesTitle}
        body={branding.copy.emptySourcesBody}
        actionLabel="Add a playlist"
        onAction={() => navigation.navigate('AddSource')}
      />
    );
  }

  return (
    <Screen>
      <FlatList
        data={favourites}
        keyExtractor={(channel) => channel.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <EmptyState
            title="No favourites yet"
            body="Tap the star next to a channel to keep it here."
          />
        }
        renderItem={({ item }) => (
          <ChannelRow
            channel={item}
            nowNext={nowNext[item.id]}
            favourite
            onPress={openChannel}
            onToggleFavourite={(channel) => {
              void toggleFavourite(channel);
            }}
          />
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: {
    paddingVertical: spacing(1),
    flexGrow: 1,
  },
});
