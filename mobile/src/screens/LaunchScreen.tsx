import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';

import { branding } from '../theme/branding';

const { colors, spacing, typography } = branding;

/**
 * Branded launch screen, shown while saved sources are read back from storage.
 *
 * It reuses the same artwork as the native splash in `app.json`, so the handoff
 * from the OS splash to the JS app is seamless rather than a flash of empty
 * navigation chrome.
 */
export function LaunchScreen() {
  return (
    <View style={styles.container}>
      <Image
        source={branding.assets.splash}
        contentFit="cover"
        style={StyleSheet.absoluteFill}
        accessibilityIgnoresInvertColors
      />

      <View style={styles.footer}>
        <ActivityIndicator color={colors.primary} size="large" />
        <Text style={styles.label}>Loading your playlists…</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'flex-end',
  },
  footer: {
    alignItems: 'center',
    gap: spacing(1.5),
    paddingBottom: spacing(8),
  },
  label: {
    color: colors.textMuted,
    fontSize: typography.label,
    letterSpacing: 0.4,
  },
});
