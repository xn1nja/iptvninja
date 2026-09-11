import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { describeError, type Category, type MediaKind } from '@iptv-ninja/core';

import { EmptyState, ErrorState, Loading, Screen, SegmentedControl } from '../components/ui';
import { Focusable } from '../components/Focusable';
import { useAppState } from '../state/AppState';
import { branding } from '../theme/branding';
import type { RootStackParamList } from '../navigation/types';

const { colors, radii, spacing, typography } = branding;

const KIND_LABELS: Record<MediaKind, string> = {
  live: 'Live TV',
  movie: 'Movies',
  series: 'Series',
};

/** Categories for the active source, split by what that source actually offers. */
export function BrowseScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { catalog, catalogStatus, catalogError, reloadCatalog, activeSource, ready } =
    useAppState();

  const [kind, setKind] = useState<MediaKind>('live');
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const availableKinds = useMemo<MediaKind[]>(() => {
    if (!catalog) return [];
    const kinds: MediaKind[] = [];
    if (catalog.capabilities.live) kinds.push('live');
    if (catalog.capabilities.movie) kinds.push('movie');
    if (catalog.capabilities.series) kinds.push('series');
    return kinds;
  }, [catalog]);

  // Keep the selected tab valid when switching to a source with fewer sections.
  useEffect(() => {
    if (availableKinds.length > 0 && !availableKinds.includes(kind)) {
      setKind(availableKinds[0] as MediaKind);
    }
  }, [availableKinds, kind]);

  useEffect(() => {
    if (!catalog) {
      setCategories(null);
      return;
    }

    let cancelled = false;
    setCategories(null);
    setError(null);

    void (async () => {
      try {
        const loaded = await catalog.getCategories(kind);
        if (!cancelled) setCategories(loaded);
      } catch (loadError) {
        if (!cancelled) setError(describeError(loadError));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [catalog, kind]);

  if (!ready) return <Loading />;

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

  if (catalogStatus === 'loading') return <Loading label="Loading channels…" />;

  if (catalogStatus === 'error') {
    return (
      <ErrorState
        message={catalogError ?? 'The playlist could not be loaded.'}
        onRetry={() => {
          void reloadCatalog();
        }}
      />
    );
  }

  if (availableKinds.length === 0) {
    return <EmptyState title="Nothing to show" body="This source returned no categories." />;
  }

  return (
    <Screen>
      {availableKinds.length > 1 ? (
        <SegmentedControl<MediaKind>
          value={kind}
          onChange={setKind}
          options={availableKinds.map((value) => ({ value, label: KIND_LABELS[value] }))}
        />
      ) : null}

      {error ? (
        <ErrorState message={error} />
      ) : categories === null ? (
        <Loading />
      ) : (
        <FlatList
          data={categories}
          keyExtractor={(category) => category.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <EmptyState title={`No ${KIND_LABELS[kind].toLowerCase()} categories`} />
          }
          renderItem={({ item }) => (
            <Focusable
              accessibilityRole="button"
              accessibilityLabel={item.name}
              onPress={() =>
                navigation.navigate('ChannelList', {
                  kind,
                  categoryId: item.id,
                  categoryName: item.name,
                })
              }
              style={styles.row}
            >
              <View style={styles.rowBody}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {item.name}
                </Text>
                {item.count !== undefined ? (
                  <Text style={styles.rowCount}>
                    {item.count} {item.count === 1 ? 'channel' : 'channels'}
                  </Text>
                ) : null}
              </View>
              <Text style={styles.chevron}>›</Text>
            </Focusable>
          )}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: {
    padding: spacing(1.5),
    gap: spacing(1),
    flexGrow: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(1),
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 2,
    borderColor: 'transparent',
    paddingHorizontal: spacing(2),
    paddingVertical: spacing(2),
    minHeight: 58,
  },
  rowBody: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: '600',
  },
  rowCount: {
    color: colors.textFaint,
    fontSize: typography.caption,
  },
  chevron: {
    color: colors.textFaint,
    fontSize: 24,
  },
});
