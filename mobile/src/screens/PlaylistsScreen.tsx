import React from 'react';
import { Alert, FlatList, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { Source } from '@iptv-ninja/core';

import { Badge, Button, EmptyState, Loading, Screen } from '../components/ui';
import { Focusable } from '../components/Focusable';
import { useAppState } from '../state/AppState';
import { branding } from '../theme/branding';
import type { RootStackParamList } from '../navigation/types';

const { colors, radii, spacing, typography } = branding;

function describeSource(source: Source): string {
  if (source.config.kind === 'xtream') {
    return `${source.config.username} @ ${source.config.serverUrl}`;
  }
  return source.config.url ?? 'Imported playlist file';
}

/** Saved accounts and playlists: switch between them, add and delete. */
export function PlaylistsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { ready, sources, activeSource, selectSource, removeSource, catalogStatus, catalogError } =
    useAppState();

  if (!ready) return <Loading label="Loading your playlists…" />;

  const confirmRemove = (source: Source) => {
    Alert.alert(
      `Delete "${source.name}"?`,
      'Its favourites are deleted too. Your provider account is not affected.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void removeSource(source.id);
          },
        },
      ],
    );
  };

  return (
    <Screen>
      <FlatList
        data={sources}
        keyExtractor={(source) => source.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.notice}>{branding.copy.bringYourOwnNotice}</Text>
            <Button
              label="Add playlist or account"
              onPress={() => navigation.navigate('AddSource')}
            />
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            title={branding.copy.emptySourcesTitle}
            body={branding.copy.emptySourcesBody}
          />
        }
        renderItem={({ item }) => {
          const active = item.id === activeSource?.id;
          return (
            <View style={[styles.card, active && styles.cardActive]}>
              <Focusable
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`Use ${item.name}`}
                onPress={() => {
                  void selectSource(item.id);
                }}
                style={styles.cardBody}
              >
                <View style={styles.cardTitleRow}>
                  <Text style={styles.cardTitle} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Badge
                    label={item.config.kind === 'xtream' ? 'Xtream' : 'M3U'}
                    tone="neutral"
                  />
                  {active ? <Badge label="Active" tone="positive" /> : null}
                </View>
                <Text style={styles.cardSubtitle} numberOfLines={2}>
                  {describeSource(item)}
                </Text>
                {active && catalogStatus === 'loading' ? (
                  <Text style={styles.cardStatus}>Loading channels…</Text>
                ) : null}
                {active && catalogStatus === 'error' && catalogError ? (
                  <Text style={styles.cardError}>{catalogError}</Text>
                ) : null}
              </Focusable>

              <Button
                label="Delete"
                variant="danger"
                onPress={() => confirmRemove(item)}
                style={styles.deleteButton}
              />
            </View>
          );
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: {
    padding: spacing(2),
    gap: spacing(1.5),
    flexGrow: 1,
  },
  header: {
    gap: spacing(1.5),
    marginBottom: spacing(1),
  },
  notice: {
    color: colors.textMuted,
    fontSize: typography.label,
    lineHeight: typography.label * 1.5,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 2,
    borderColor: colors.border,
    padding: spacing(1.5),
    gap: spacing(1),
  },
  cardActive: {
    borderColor: colors.primary,
  },
  cardBody: {
    gap: spacing(0.5),
    borderRadius: radii.md,
    borderWidth: 2,
    borderColor: 'transparent',
    padding: spacing(0.5),
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(1),
    flexWrap: 'wrap',
  },
  cardTitle: {
    color: colors.text,
    fontSize: typography.heading,
    fontWeight: '700',
    flexShrink: 1,
  },
  cardSubtitle: {
    color: colors.textFaint,
    fontSize: typography.caption,
  },
  cardStatus: {
    color: colors.primary,
    fontSize: typography.caption,
    marginTop: spacing(0.5),
  },
  cardError: {
    color: colors.danger,
    fontSize: typography.caption,
    marginTop: spacing(0.5),
  },
  deleteButton: {
    alignSelf: 'flex-start',
  },
});
