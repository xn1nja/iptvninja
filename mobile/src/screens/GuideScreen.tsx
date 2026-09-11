import React, { useEffect, useMemo, useState } from 'react';
import { SectionList, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { formatClock, programmeProgress, type EpgEntry } from '@iptv-ninja/core';

import { EmptyState, Loading, Screen } from '../components/ui';
import { useAppState } from '../state/AppState';
import { branding } from '../theme/branding';
import type { RootStackParamList } from '../navigation/types';

const { colors, radii, spacing, typography } = branding;

function dayLabel(timestamp: number): string {
  const date = new Date(timestamp);
  const today = new Date();
  const sameDay =
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate();
  if (sameDay) return 'Today';

  try {
    return date.toLocaleDateString(undefined, {
      weekday: 'long',
      day: 'numeric',
      month: 'short',
    });
  } catch {
    return date.toDateString();
  }
}

/** A simple day-grouped guide for one channel. */
export function GuideScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'Guide'>>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { channel } = route.params;
  const { catalog } = useAppState();

  const [entries, setEntries] = useState<EpgEntry[] | null>(null);

  useEffect(() => {
    navigation.setOptions({ title: `${channel.name} — Guide` });
  }, [navigation, channel.name]);

  useEffect(() => {
    if (!catalog) {
      setEntries([]);
      return;
    }
    let cancelled = false;

    void (async () => {
      try {
        const loaded = await catalog.getGuide(channel);
        if (!cancelled) setEntries(loaded);
      } catch {
        if (!cancelled) setEntries([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [catalog, channel]);

  const sections = useMemo(() => {
    if (!entries) return [];
    const byDay = new Map<string, EpgEntry[]>();

    // Past programmes are noise on a guide screen; keep the last hour for context.
    const cutoff = Date.now() - 60 * 60 * 1000;
    for (const entry of entries) {
      if (entry.end < cutoff) continue;
      const key = dayLabel(entry.start);
      const bucket = byDay.get(key);
      if (bucket) bucket.push(entry);
      else byDay.set(key, [entry]);
    }

    return [...byDay.entries()].map(([title, data]) => ({ title, data }));
  }, [entries]);

  if (entries === null) return <Loading label="Loading the guide…" />;

  if (sections.length === 0) {
    return (
      <EmptyState
        title="No guide data"
        body="This source did not return EPG data for this channel. Add an XMLTV URL to the playlist, or ask your provider whether they publish one."
      />
    );
  }

  const now = Date.now();

  return (
    <Screen>
      <SectionList
        sections={sections}
        keyExtractor={(item, index) => `${item.start}-${index}`}
        contentContainerStyle={styles.list}
        stickySectionHeadersEnabled
        renderSectionHeader={({ section }) => (
          <Text style={styles.sectionHeader}>{section.title}</Text>
        )}
        renderItem={({ item }) => {
          const live = item.start <= now && item.end > now;
          return (
            <View style={[styles.row, live && styles.rowLive]}>
              <Text style={[styles.time, live && styles.timeLive]}>{formatClock(item.start)}</Text>
              <View style={styles.body}>
                <Text style={[styles.title, live && styles.titleLive]} numberOfLines={2}>
                  {item.title}
                </Text>
                {item.description ? (
                  <Text style={styles.description} numberOfLines={3}>
                    {item.description}
                  </Text>
                ) : null}
                {live ? (
                  <View style={styles.progressTrack}>
                    <View
                      style={[styles.progressFill, { width: `${programmeProgress(item, now) * 100}%` }]}
                    />
                  </View>
                ) : null}
              </View>
            </View>
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
  sectionHeader: {
    color: colors.textMuted,
    fontSize: typography.label,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    backgroundColor: colors.background,
    paddingVertical: spacing(1),
  },
  row: {
    flexDirection: 'row',
    gap: spacing(1.5),
    paddingVertical: spacing(1.25),
    paddingHorizontal: spacing(1),
    borderRadius: radii.md,
  },
  rowLive: {
    backgroundColor: colors.surface,
  },
  time: {
    color: colors.textFaint,
    fontSize: typography.label,
    fontVariant: ['tabular-nums'],
    width: 48,
    paddingTop: 2,
  },
  timeLive: {
    color: colors.primary,
    fontWeight: '700',
  },
  body: {
    flex: 1,
    gap: 3,
  },
  title: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: '600',
  },
  titleLive: {
    color: colors.primary,
  },
  description: {
    color: colors.textFaint,
    fontSize: typography.caption,
    lineHeight: typography.caption * 1.5,
  },
  progressTrack: {
    height: 3,
    borderRadius: radii.pill,
    backgroundColor: colors.border,
    overflow: 'hidden',
    marginTop: 4,
  },
  progressFill: {
    height: 3,
    backgroundColor: colors.primary,
  },
});
