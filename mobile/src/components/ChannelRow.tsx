import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { formatClock, programmeProgress, type Channel, type NowNext } from '@iptv-ninja/core';

import { branding } from '../theme/branding';
import { Focusable } from './Focusable';

const { colors, radii, spacing, typography } = branding;

export interface ChannelRowProps {
  channel: Channel;
  nowNext?: NowNext;
  favourite?: boolean;
  onPress: (channel: Channel) => void;
  onToggleFavourite?: (channel: Channel) => void;
}

/** One channel in a list: logo, name, inline now/next and a favourite toggle. */
export function ChannelRow({
  channel,
  nowNext,
  favourite,
  onPress,
  onToggleFavourite,
}: ChannelRowProps) {
  const now = nowNext?.now;
  const next = nowNext?.next;
  const progress = now ? programmeProgress(now) : 0;

  return (
    <View style={styles.container}>
      <Focusable
        accessibilityRole="button"
        accessibilityLabel={
          now ? `${channel.name}. Now: ${now.title}` : channel.name
        }
        onPress={() => onPress(channel)}
        style={styles.row}
      >
        <Image
          source={channel.logo ? { uri: channel.logo } : branding.channelPlaceholder}
          placeholder={branding.channelPlaceholder}
          contentFit="contain"
          transition={120}
          style={styles.logo}
        />

        <View style={styles.body}>
          <Text style={styles.name} numberOfLines={1}>
            {channel.number ? `${channel.number}. ` : ''}
            {channel.name}
          </Text>

          {now ? (
            <>
              <Text style={styles.now} numberOfLines={1}>
                {formatClock(now.start)} {now.title}
              </Text>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
              </View>
            </>
          ) : null}

          {next ? (
            <Text style={styles.next} numberOfLines={1}>
              Next {formatClock(next.start)} {next.title}
            </Text>
          ) : null}

          {!now && !next && channel.categoryName ? (
            <Text style={styles.next} numberOfLines={1}>
              {channel.categoryName}
            </Text>
          ) : null}
        </View>
      </Focusable>

      {onToggleFavourite ? (
        <Focusable
          accessibilityRole="button"
          accessibilityLabel={
            favourite ? `Remove ${channel.name} from favourites` : `Add ${channel.name} to favourites`
          }
          accessibilityState={{ selected: favourite }}
          onPress={() => onToggleFavourite(channel)}
          style={styles.favourite}
        >
          <Text style={[styles.favouriteIcon, favourite && styles.favouriteIconOn]}>
            {favourite ? '★' : '☆'}
          </Text>
        </Focusable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing(1),
  },
  row: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(1.5),
    padding: spacing(1),
    borderRadius: radii.md,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  logo: {
    width: 52,
    height: 52,
    borderRadius: radii.sm,
    backgroundColor: colors.surface,
  },
  body: {
    flex: 1,
    gap: 2,
  },
  name: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: '600',
  },
  now: {
    color: colors.textMuted,
    fontSize: typography.label,
  },
  next: {
    color: colors.textFaint,
    fontSize: typography.caption,
  },
  progressTrack: {
    height: 3,
    borderRadius: radii.pill,
    backgroundColor: colors.border,
    overflow: 'hidden',
    marginVertical: 3,
  },
  progressFill: {
    height: 3,
    backgroundColor: colors.primary,
  },
  favourite: {
    width: 46,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.md,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  favouriteIcon: {
    color: colors.textFaint,
    fontSize: 22,
  },
  favouriteIconOn: {
    color: colors.warning,
  },
});
