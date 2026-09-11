import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';

/**
 * Whether the app is running inside Expo Go rather than its own build.
 *
 * This matters for IPTV specifically: Expo Go runs under its own Info.plist and
 * AndroidManifest, so the cleartext-HTTP permissions this app declares in
 * `app.json` do not apply there. Most Xtream panels are plain `http://`, which
 * iOS blocks by default, so a stream that fails in Expo Go may be fine in a
 * development build.
 */
export const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

/** True when plain-HTTP media is likely blocked by the OS rather than broken. */
export function cleartextLikelyBlocked(url: string): boolean {
  return isExpoGo && Platform.OS === 'ios' && url.startsWith('http://');
}
