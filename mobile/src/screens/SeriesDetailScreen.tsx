import React, { useEffect, useState } from 'react';
import { SectionList, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Image } from 'expo-image';
import { describeError, type SeriesDetail, type SeriesEpisode } from '@iptv-ninja/core';

import { ErrorState, Loading, Screen } from '../components/ui';
import { Focusable } from '../components/Focusable';
import { useAppState } from '../state/AppState';
import { branding } from '../theme/branding';
import type { RootStackParamList } from '../navigation/types';

const { colors, radii, spacing, typography } = branding;

function formatDuration(seconds: number | null | undefined): string | null {
  if (!seconds || seconds <= 0) return null;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

/** Seasons and episodes for one series; picking an episode opens the player. */
export function SeriesDetailScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'SeriesDetail'>>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { channel } = route.params;
  const { catalog } = useAppState();

  const [detail, setDetail] = useState<SeriesDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    navigation.setOptions({ title: channel.name });
  }, [navigation, channel.name]);

  useEffect(() => {
    if (!catalog) return;
    let cancelled = false;

    void (async () => {
      try {
        const loaded = await catalog.getSeriesDetail(channel);
        if (!cancelled) setDetail(loaded);
      } catch (loadError) {
        if (!cancelled) setError(describeError(loadError));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [catalog, channel]);

  const openEpisode = (episode: SeriesEpisode) => {
    navigation.navigate('Player', {
      channel: {
        id: `episode:${episode.id}`,
        name: `${channel.name} — S${episode.season}E${episode.episode}`,
        kind: 'movie',
        logo: episode.image ?? channel.logo ?? null,
        streamUrl: episode.streamUrl ?? null,
        containerExtension: episode.containerExtension ?? null,
      },
      title: episode.title,
    });
  };

  if (error) return <ErrorState message={error} />;
  if (!detail) return <Loading label="Loading episodes…" />;

  return (
    <Screen>
      <SectionList
        sections={detail.seasons.map((season) => ({
          title: season.name ?? `Season ${season.season}`,
          data: season.episodes,
        }))}
        keyExtractor={(episode) => episode.id}
        contentContainerStyle={styles.list}
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={
          <View style={styles.header}>
            <Image
              source={detail.cover ? { uri: detail.cover } : branding.channelPlaceholder}
              contentFit="cover"
              style={styles.cover}
            />
            <View style={styles.headerBody}>
              <Text style={styles.headerTitle}>{detail.name}</Text>
              {detail.genre ? <Text style={styles.headerMeta}>{detail.genre}</Text> : null}
              {detail.releaseDate ? (
                <Text style={styles.headerMeta}>{detail.releaseDate}</Text>
              ) : null}
              {detail.plot ? (
                <Text style={styles.plot} numberOfLines={6}>
                  {detail.plot}
                </Text>
              ) : null}
            </View>
          </View>
        }
        renderSectionHeader={({ section }) => (
          <Text style={styles.sectionHeader}>{section.title}</Text>
        )}
        renderItem={({ item }) => {
          const duration = formatDuration(item.durationSeconds);
          return (
            <Focusable
              accessibilityRole="button"
              accessibilityLabel={`Play ${item.title}`}
              onPress={() => openEpisode(item)}
              style={styles.episode}
            >
              <Text style={styles.episodeNumber}>{item.episode}</Text>
              <View style={styles.episodeBody}>
                <Text style={styles.episodeTitle} numberOfLines={1}>
                  {item.title}
                </Text>
                {duration ? <Text style={styles.episodeMeta}>{duration}</Text> : null}
                {item.plot ? (
                  <Text style={styles.episodeMeta} numberOfLines={2}>
                    {item.plot}
                  </Text>
                ) : null}
              </View>
              <Text style={styles.play}>▶</Text>
            </Focusable>
          );
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: {
    padding: spacing(1.5),
    paddingBottom: spacing(4),
  },
  header: {
    flexDirection: 'row',
    gap: spacing(1.5),
    marginBottom: spacing(2),
  },
  cover: {
    width: 110,
    height: 165,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
  },
  headerBody: {
    flex: 1,
    gap: spacing(0.5),
  },
  headerTitle: {
    color: colors.text,
    fontSize: typography.heading,
    fontWeight: '700',
  },
  headerMeta: {
    color: colors.textFaint,
    fontSize: typography.caption,
  },
  plot: {
    color: colors.textMuted,
    fontSize: typography.label,
    lineHeight: typography.label * 1.45,
    marginTop: spacing(0.5),
  },
  sectionHeader: {
    color: colors.textMuted,
    fontSize: typography.label,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    paddingVertical: spacing(1),
  },
  episode: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(1.5),
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 2,
    borderColor: 'transparent',
    padding: spacing(1.5),
    marginBottom: spacing(1),
  },
  episodeNumber: {
    color: colors.textFaint,
    fontSize: typography.heading,
    fontWeight: '700',
    width: 28,
    textAlign: 'center',
  },
  episodeBody: {
    flex: 1,
    gap: 2,
  },
  episodeTitle: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: '600',
  },
  episodeMeta: {
    color: colors.textFaint,
    fontSize: typography.caption,
  },
  play: {
    color: colors.primary,
    fontSize: 18,
  },
});
