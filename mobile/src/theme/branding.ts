import type { ImageSourcePropType } from 'react-native';

/**
 * The only place in /mobile allowed to hardcode a product name, colour or logo.
 *
 * This app is meant to be re-skinned per client, so every user-visible string
 * and every colour is read from here. If you find yourself typing "IPTV Ninja"
 * or a hex code anywhere else under /mobile, put it in this file instead.
 */

export interface BrandingPalette {
  background: string;
  surface: string;
  surfaceRaised: string;
  border: string;
  primary: string;
  primaryMuted: string;
  onPrimary: string;
  text: string;
  textMuted: string;
  textFaint: string;
  danger: string;
  success: string;
  warning: string;
  /** Scrim behind player overlays. */
  overlay: string;
  /** Ring drawn around the focused element (remote/d-pad navigation later). */
  focusRing: string;
}

export interface BrandingCopy {
  appName: string;
  tagline: string;
  /** Shown on the empty state before any playlist is added. */
  emptySourcesTitle: string;
  emptySourcesBody: string;
  /**
   * The app ships with no channels of its own — this line keeps that explicit
   * wherever the user is asked for a playlist.
   */
  bringYourOwnNotice: string;
  supportUrl?: string;
}

export interface BrandingAssets {
  /** Full lockup — mark plus wordmark. The app icon artwork. */
  logo: ImageSourcePropType;
  /** Mark only, transparent background. For headers and other compact spots. */
  logoMark: ImageSourcePropType;
  /** Full-bleed portrait artwork for the launch screen. */
  splash: ImageSourcePropType;
  /** Wide banner with the tagline. */
  banner: ImageSourcePropType;
}

export interface Branding {
  copy: BrandingCopy;
  colors: BrandingPalette;
  /**
   * Full lockup. Kept at the top level because it is the one every screen
   * reaches for; the rest of the artwork lives under `assets`.
   */
  logo: ImageSourcePropType;
  assets: BrandingAssets;
  /** Placeholder for channels with no `tvg-logo`. */
  channelPlaceholder: ImageSourcePropType;
  radii: { sm: number; md: number; lg: number; pill: number };
  spacing: (steps: number) => number;
  typography: {
    title: number;
    heading: number;
    body: number;
    label: number;
    caption: number;
  };
}

const palette: BrandingPalette = {
  background: '#0B0D12',
  surface: '#141821',
  surfaceRaised: '#1C2130',
  border: '#262C3A',
  primary: '#4CC9F0',
  primaryMuted: '#1E4C5C',
  onPrimary: '#04121A',
  text: '#F2F5FA',
  textMuted: '#A3AEC2',
  textFaint: '#6B7689',
  danger: '#FF6B6B',
  success: '#4ADE80',
  warning: '#FBBF24',
  overlay: 'rgba(6, 8, 12, 0.72)',
  focusRing: '#4CC9F0',
};

export const branding: Branding = {
  copy: {
    appName: 'IPTV Ninja',
    tagline: 'Your playlists, your channels.',
    emptySourcesTitle: 'No playlists yet',
    emptySourcesBody:
      'Add your provider’s Xtream Codes login or an M3U playlist URL to start watching.',
    bringYourOwnNotice:
      'IPTV Ninja ships with no channels of its own. You supply your own provider credentials or playlist.',
  },
  colors: palette,
  // Asset filenames here deliberately avoid an `@1x`/`@2x` suffix: React
  // Native reserves that for pixel-density variants, so `Wordmark@1x.png`
  // cannot be required directly.
  logo: require('../../assets/icon.png') as ImageSourcePropType,
  assets: {
    logo: require('../../assets/icon.png') as ImageSourcePropType,
    logoMark: require('../../assets/icon-mark.png') as ImageSourcePropType,
    splash: require('../../assets/splash-icon.png') as ImageSourcePropType,
    banner: require('../../assets/header.png') as ImageSourcePropType,
  },
  // Transparent mark sits better than the full lockup in a small rounded tile.
  channelPlaceholder: require('../../assets/icon-mark.png') as ImageSourcePropType,
  radii: { sm: 6, md: 12, lg: 18, pill: 999 },
  spacing: (steps: number) => steps * 8,
  typography: {
    title: 26,
    heading: 19,
    body: 15,
    label: 13,
    caption: 11,
  },
};

export type { Branding as BrandingConfig };
