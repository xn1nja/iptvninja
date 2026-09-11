import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';

import { branding } from '../theme/branding';

const { colors, radii, spacing, typography } = branding;

export interface BrandHeaderTitleProps {
  /**
   * Screen name to show next to the mark. Omit on the home screen, where the
   * product name stands on its own.
   */
  label?: string;
}

/**
 * Header title: the logo mark plus a label.
 *
 * Used as `headerTitle` for every tab so the brand is present on each screen
 * rather than only in the launcher. The mark is an image and the text comes
 * from `branding.copy.appName`, so re-skinning still means editing one file.
 */
export function BrandHeaderTitle({ label }: BrandHeaderTitleProps) {
  const showsProductName = label === undefined;

  return (
    <View style={styles.row}>
      <Image
        source={branding.assets.logoMark}
        contentFit="contain"
        style={styles.mark}
        accessibilityIgnoresInvertColors
      />
      {showsProductName ? (
        <View style={styles.nameBlock}>
          <Text style={styles.name} numberOfLines={1}>
            {branding.copy.appName}
          </Text>
          <Text style={styles.tagline} numberOfLines={1}>
            {branding.copy.tagline}
          </Text>
        </View>
      ) : (
        <Text style={styles.label} numberOfLines={1}>
          {label}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(1),
  },
  mark: {
    width: 30,
    height: 30,
    borderRadius: radii.sm,
  },
  nameBlock: {
    justifyContent: 'center',
  },
  name: {
    color: colors.text,
    fontSize: typography.heading,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  tagline: {
    color: colors.textFaint,
    fontSize: typography.caption,
    letterSpacing: 0.4,
  },
  label: {
    color: colors.text,
    fontSize: typography.heading,
    fontWeight: '700',
  },
});
