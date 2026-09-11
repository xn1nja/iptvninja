import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { searchChannels, type Channel } from '@iptv-ninja/core';

import { ChannelRow } from '../components/ChannelRow';
import { EmptyState, Field, Loading, Screen } from '../components/ui';
import { useAppState } from '../state/AppState';
import { branding } from '../theme/branding';
import type { RootStackParamList } from '../navigation/types';

const { colors, spacing, typography } = branding;

/** Global search across every channel, movie and series in the active source. */
export function SearchScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { catalog, isFavourite, toggleFavourite } = useAppState();

  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [allChannels, setAllChannels] = useState<Channel[] | null>(null);

  // Loading every category of a large provider takes a moment; do it once when
  // the user first opens search rather than on every keystroke.
  useEffect(() => {
    if (!catalog) {
      setAllChannels(null);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const loaded = await catalog.getAllChannels();
        if (!cancelled) setAllChannels(loaded);
      } catch {
        if (!cancelled) setAllChannels([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [catalog]);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query), 200);
    return () => clearTimeout(timer);
  }, [query]);

  const results = useMemo(() => {
    if (!allChannels || debounced.trim().length < 2) return [];
    return searchChannels(allChannels, debounced, { limit: 150 });
  }, [allChannels, debounced]);

  const openChannel = (channel: Channel) => {
    if (channel.kind === 'series') {
      navigation.navigate('SeriesDetail', { channel });
      return;
    }
    navigation.navigate('Player', { channel });
  };

  return (
    <Screen>
      <View style={styles.searchBar}>
        <Field
          label="Search"
          placeholder="Channel, movie or series name"
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
      </View>

      {allChannels === null ? (
        <Loading label="Indexing channels…" />
      ) : debounced.trim().length < 2 ? (
        <EmptyState
          title="Search everything"
          body={`Type at least two characters to search ${allChannels.length.toLocaleString()} entries.`}
        />
      ) : results.length === 0 ? (
        <EmptyState title="No matches" body={`Nothing matched “${debounced.trim()}”.`} />
      ) : (
        <FlatList
          data={results}
          keyExtractor={(channel) => channel.id}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={14}
          ListHeaderComponent={
            <Text style={styles.count}>
              {results.length} {results.length === 1 ? 'result' : 'results'}
            </Text>
          }
          renderItem={({ item }) => (
            <ChannelRow
              channel={item}
              favourite={isFavourite(item.id)}
              onPress={openChannel}
              onToggleFavourite={(channel) => {
                void toggleFavourite(channel);
              }}
            />
          )}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  searchBar: {
    paddingHorizontal: spacing(2),
    paddingTop: spacing(2),
  },
  list: {
    paddingBottom: spacing(2),
    flexGrow: 1,
  },
  count: {
    color: colors.textFaint,
    fontSize: typography.caption,
    paddingHorizontal: spacing(2),
    paddingBottom: spacing(1),
  },
});
