import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { RootNavigator } from './src/navigation/RootNavigator';
import { LaunchScreen } from './src/screens/LaunchScreen';
import { AppStateProvider, useAppState } from './src/state/AppState';

/**
 * Holds the branded launch screen until saved sources have been read back,
 * so the app never shows empty navigation chrome on a cold start.
 */
function AppContent() {
  const { ready } = useAppState();
  return ready ? <RootNavigator /> : <LaunchScreen />;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppStateProvider>
        <StatusBar style="light" />
        <AppContent />
      </AppStateProvider>
    </SafeAreaProvider>
  );
}
