import React, { useEffect, useState } from 'react';
import { FlatList, StyleSheet } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { describeError, type Channel } from '@iptv-ninja/core';

import { ChannelRow } from '../components/ChannelRow';
import { EmptyState, ErrorState, Loading, Screen } from '../components/ui';
import { useAppState } from '../state/AppState';
import { useNowNext } from '../state/useNowNext';
import { branding } from '../theme/branding';
import type { RootStackParamList } from '../navigation/types';

const { spacing } = branding;

/** The channels inside one category. */
export function ChannelListScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'ChannelList'>>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { kind, categoryId, categoryName } = route.params;

  const { catalog, isFavourite, toggleFavourite } = useAppState();
  const [channels, setChannels] = useState<Channel[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    navigation.setOptions({ title: categoryName });
  }, [navigation, categoryName]);

  useEffect(() => {
    if (!catalog) return;
    let cancelled = false;

    void (async () => {
      try {
        const loaded = await catalog.getChannels(kind, categoryId);
        if (!cancelled) setChannels(loaded);
      } catch (loadError) {
        if (!cancelled) setError(describeError(loadError));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [catalog, kind, categoryId]);

  const nowNext = useNowNext(catalog, channels ?? [], kind === 'live');

  const openChannel = (channel: Channel) => {
    if (channel.kind === 'series') {
      navigation.navigate('SeriesDetail', { channel });
      return;
    }
    navigation.navigate('Player', { channel });
  };

  if (error) return <ErrorState message={error} />;
  if (channels === null) return <Loading />;

  return (
    <Screen>
      <FlatList
        data={channels}
        keyExtractor={(channel) => channel.id}
        contentContainerStyle={styles.list}
        initialNumToRender={16}
        windowSize={9}
        removeClippedSubviews
        ListEmptyComponent={<EmptyState title="This category is empty" />}
        renderItem={({ item }) => (
          <ChannelRow
            channel={item}
            nowNext={nowNext[item.id]}
            favourite={isFavourite(item.id)}
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
