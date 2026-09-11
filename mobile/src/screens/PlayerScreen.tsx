import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StatusBar, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView, type VideoPlayer } from 'expo-video';
import { useEvent } from 'expo';
import {
  alternateLiveExtension,
  formatClock,
  probeStream,
  programmeProgress,
  swapStreamExtension,
  type NowNext,
  type StreamProbe,
} from '@iptv-ninja/core';

import { Focusable } from '../components/Focusable';
import { Button } from '../components/ui';
import { useAppState } from '../state/AppState';
import { cleartextLikelyBlocked, isExpoGo } from '../platform/runtime';
import { branding } from '../theme/branding';
import type { RootStackParamList } from '../navigation/types';

const { colors, radii, spacing, typography } = branding;

const OVERLAY_TIMEOUT_MS = 4_000;

/**
 * Playback screen.
 *
 * expo-video handles HLS natively on both platforms, which is what live IPTV
 * streams are. Everything on screen is a tap/focus target — no swipe-only
 * controls — so the same layout can be driven by a remote later.
 */
export function PlayerScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'Player'>>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { channel, title } = route.params;

  const { catalog, isFavourite, toggleFavourite } = useAppState();

  const [nowNext, setNowNext] = useState<NowNext>({});
  const [overlayVisible, setOverlayVisible] = useState(true);
  const [fullscreenHint, setFullscreenHint] = useState(false);
  const videoRef = useRef<React.ComponentRef<typeof VideoView>>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [streamUrl, setStreamUrl] = useState(channel.streamUrl ?? null);
  const [probe, setProbe] = useState<StreamProbe | null>(null);
  const [probing, setProbing] = useState(false);

  const player = useVideoPlayer(channel.streamUrl ?? null, (instance: VideoPlayer) => {
    instance.loop = false;
    // Live streams have no meaningful position to restore; just start.
    instance.play();
  });

  const status = useEvent(player, 'statusChange', { status: player.status });
  const playing = useEvent(player, 'playingChange', { isPlaying: player.playing });

  const isLoading = status.status === 'loading';
  const playbackError =
    status.status === 'error' ? (status.error?.message ?? 'Playback failed.') : null;

  const alternate = streamUrl ? alternateLiveExtension(streamUrl) : null;
  const alternateUrl =
    streamUrl && alternate ? swapStreamExtension(streamUrl, alternate) : null;

  // Providers fail in a lot of different ways and the player only ever reports
  // "playback failed", so ask the server directly what it is serving.
  useEffect(() => {
    if (!playbackError || !streamUrl || probe?.url === streamUrl) return;
    let cancelled = false;

    setProbing(true);
    void (async () => {
      const result = await probeStream(streamUrl);
      if (!cancelled) {
        setProbe(result);
        setProbing(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [playbackError, streamUrl, probe?.url]);

  const switchContainer = useCallback(() => {
    if (!alternateUrl) return;
    setProbe(null);
    setStreamUrl(alternateUrl);
    void player.replaceAsync(alternateUrl);
  }, [alternateUrl, player]);

  const revealOverlay = useCallback(() => {
    setOverlayVisible(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setOverlayVisible(false), OVERLAY_TIMEOUT_MS);
  }, []);

  useEffect(() => {
    revealOverlay();
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [revealOverlay]);

  useEffect(() => {
    navigation.setOptions({ title: title ?? channel.name });
  }, [navigation, channel.name, title]);

  useEffect(() => {
    if (!catalog || channel.kind !== 'live') return;
    let cancelled = false;

    void (async () => {
      try {
        const result = await catalog.getNowNext(channel);
        if (!cancelled) setNowNext(result);
      } catch {
        // A missing guide is not worth interrupting playback for.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [catalog, channel]);

  const favourite = isFavourite(channel.id);
  const now = nowNext.now;

  if (!streamUrl) {
    return (
      <View style={styles.container}>
        <View style={styles.centered}>
          <Text style={styles.errorTitle}>Nothing to play</Text>
          <Text style={styles.errorBody}>
            This entry has no stream URL. Series need an episode picked first.
          </Text>
          <Button label="Back" variant="secondary" onPress={() => navigation.goBack()} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar hidden={!overlayVisible} />

      <Focusable
        accessibilityRole="button"
        accessibilityLabel="Show or hide playback controls"
        onPress={() => (overlayVisible ? setOverlayVisible(false) : revealOverlay())}
        style={styles.videoTapTarget}
      >
        <VideoView
          ref={videoRef}
          player={player}
          style={styles.video}
          contentFit="contain"
          nativeControls={false}
          fullscreenOptions={{ enable: true }}
          allowsPictureInPicture
          onFullscreenEnter={() => setFullscreenHint(true)}
          onFullscreenExit={() => setFullscreenHint(false)}
        />
      </Focusable>

      {isLoading ? (
        <View pointerEvents="none" style={styles.loadingLayer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : null}

      {playbackError ? (
        <View style={styles.errorLayer}>
          <Text style={styles.errorTitle}>This stream would not play</Text>

          {probing ? (
            <Text style={styles.errorBody}>Checking what the server is sending…</Text>
          ) : (
            <Text style={styles.errorBody}>{probe?.detail ?? playbackError}</Text>
          )}

          {cleartextLikelyBlocked(streamUrl ?? '') ? (
            <Text style={styles.errorHint}>
              You are running in Expo Go, which uses its own network permissions, so iOS blocks
              plain http:// streams here regardless of this app&apos;s settings. Install a
              development build to play them.
            </Text>
          ) : probe?.diagnosis === 'not_a_stream' ? (
            <Text style={styles.errorHint}>
              Check the account on the Playlists tab: an expired line or too many simultaneous
              connections both look like this.
            </Text>
          ) : alternate ? (
            <Text style={styles.errorHint}>
              {alternate === 'ts'
                ? 'Some panels only serve MPEG-TS. Note that iOS can play HLS only, so TS is worth trying on Android rather than here.'
                : 'HLS is the format iOS can play, so it is worth trying if MPEG-TS failed.'}
            </Text>
          ) : null}

          <View style={styles.errorActions}>
            <Button label="Retry" onPress={() => player.replay()} />
            {alternateUrl ? (
              <Button
                label={alternate === 'ts' ? 'Try MPEG-TS' : 'Try HLS'}
                variant="secondary"
                onPress={switchContainer}
              />
            ) : null}
            <Button label="Back" variant="secondary" onPress={() => navigation.goBack()} />
          </View>

          {isExpoGo ? <Text style={styles.errorMeta}>Running in Expo Go</Text> : null}
        </View>
      ) : null}

      {overlayVisible ? (
        <View style={styles.overlay} pointerEvents="box-none">
          <View style={styles.topBar}>
            <Focusable
              accessibilityRole="button"
              accessibilityLabel="Back"
              onPress={() => navigation.goBack()}
              style={styles.iconButton}
            >
              <Text style={styles.iconLabel}>‹</Text>
            </Focusable>

            <Image
              source={channel.logo ? { uri: channel.logo } : branding.logo}
              contentFit="contain"
              style={styles.overlayLogo}
            />

            <View style={styles.titleBlock}>
              <Text style={styles.channelName} numberOfLines={1}>
                {channel.name}
              </Text>
              {now ? (
                <Text style={styles.programme} numberOfLines={1}>
                  {formatClock(now.start)}–{formatClock(now.end)} {now.title}
                </Text>
              ) : (
                <Text style={styles.programme} numberOfLines={1}>
                  {channel.categoryName ?? branding.copy.appName}
                </Text>
              )}
            </View>

            <Focusable
              accessibilityRole="button"
              accessibilityLabel={favourite ? 'Remove from favourites' : 'Add to favourites'}
              accessibilityState={{ selected: favourite }}
              onPress={() => {
                void toggleFavourite(channel);
              }}
              style={styles.iconButton}
            >
              <Text style={[styles.iconLabel, favourite && styles.iconLabelOn]}>
                {favourite ? '★' : '☆'}
              </Text>
            </Focusable>
          </View>

          {now ? (
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${programmeProgress(now) * 100}%` }]} />
            </View>
          ) : null}

          <View style={styles.bottomBar}>
            <Focusable
              accessibilityRole="button"
              accessibilityLabel={playing.isPlaying ? 'Pause' : 'Play'}
              onPress={() => {
                if (playing.isPlaying) player.pause();
                else player.play();
                revealOverlay();
              }}
              style={styles.controlButton}
            >
              <Text style={styles.controlLabel}>{playing.isPlaying ? '❚❚' : '▶'}</Text>
            </Focusable>

            {channel.kind === 'live' ? (
              <Focusable
                accessibilityRole="button"
                accessibilityLabel="Jump to live edge"
                onPress={() => {
                  player.replay();
                  revealOverlay();
                }}
                style={styles.controlButton}
              >
                <Text style={styles.controlSmallLabel}>LIVE</Text>
              </Focusable>
            ) : null}

            {catalog && channel.kind === 'live' ? (
              <Focusable
                accessibilityRole="button"
                accessibilityLabel="Open the TV guide for this channel"
                onPress={() => navigation.navigate('Guide', { channel })}
                style={styles.controlButton}
              >
                <Text style={styles.controlSmallLabel}>GUIDE</Text>
              </Focusable>
            ) : null}

            <Focusable
              accessibilityRole="button"
              accessibilityLabel={fullscreenHint ? 'Exit fullscreen' : 'Enter fullscreen'}
              onPress={() => {
                if (fullscreenHint) void videoRef.current?.exitFullscreen();
                else void videoRef.current?.enterFullscreen();
                revealOverlay();
              }}
              style={styles.controlButton}
            >
              <Text style={styles.controlLabel}>⛶</Text>
            </Focusable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

// RN's own `absoluteFillObject` is not in the current type definitions, so the
// overlay fill is spelled out here once and reused.
const FILL = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } as const;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  videoTapTarget: {
    ...FILL,
  },
  video: {
    flex: 1,
  },
  loadingLayer: {
    ...FILL,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorLayer: {
    ...FILL,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.overlay,
    padding: spacing(3),
    gap: spacing(1),
  },
  errorActions: {
    flexDirection: 'row',
    gap: spacing(1),
    marginTop: spacing(2),
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing(3),
    gap: spacing(1.5),
  },
  errorTitle: {
    color: colors.danger,
    fontSize: typography.heading,
    fontWeight: '700',
    textAlign: 'center',
  },
  errorBody: {
    color: colors.text,
    fontSize: typography.body,
    textAlign: 'center',
  },
  errorMeta: {
    color: colors.textFaint,
    fontSize: typography.caption,
    marginTop: spacing(1.5),
  },
  errorHint: {
    color: colors.textMuted,
    fontSize: typography.label,
    textAlign: 'center',
    lineHeight: typography.label * 1.5,
  },
  overlay: {
    ...FILL,
    justifyContent: 'space-between',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(1),
    padding: spacing(1.5),
    paddingTop: spacing(5),
    backgroundColor: colors.overlay,
  },
  overlayLogo: {
    width: 36,
    height: 36,
    borderRadius: radii.sm,
  },
  titleBlock: {
    flex: 1,
  },
  channelName: {
    color: colors.text,
    fontSize: typography.heading,
    fontWeight: '700',
  },
  programme: {
    color: colors.textMuted,
    fontSize: typography.label,
  },
  progressTrack: {
    height: 3,
    backgroundColor: colors.border,
    marginTop: -3,
  },
  progressFill: {
    height: 3,
    backgroundColor: colors.primary,
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing(2),
    padding: spacing(2),
    paddingBottom: spacing(4),
    backgroundColor: colors.overlay,
  },
  iconButton: {
    width: 46,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.md,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  iconLabel: {
    color: colors.text,
    fontSize: 26,
  },
  iconLabelOn: {
    color: colors.warning,
  },
  controlButton: {
    minWidth: 60,
    height: 48,
    paddingHorizontal: spacing(1.5),
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.md,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  controlLabel: {
    color: colors.text,
    fontSize: 20,
  },
  controlSmallLabel: {
    color: colors.text,
    fontSize: typography.label,
    fontWeight: '700',
    letterSpacing: 1,
  },
});
