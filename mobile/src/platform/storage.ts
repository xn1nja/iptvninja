import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Storage } from '@iptv-ninja/core';

/**
 * The mobile implementation of core's `Storage` interface.
 *
 * This file is the entire persistence surface for the app. A Tizen/webOS
 * client swaps in a localStorage-backed version and reuses everything else.
 */
export const mobileStorage: Storage = {
  async get(key) {
    return AsyncStorage.getItem(key);
  },
  async set(key, value) {
    await AsyncStorage.setItem(key, value);
  },
  async remove(key) {
    await AsyncStorage.removeItem(key);
  },
};
