import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { RootNavigator } from './src/navigation/RootNavigator';
import { AppStateProvider } from './src/state/AppState';

export default function App() {
  return (
    <SafeAreaProvider>
      <AppStateProvider>
        <StatusBar style="light" />
        <RootNavigator />
      </AppStateProvider>
    </SafeAreaProvider>
  );
}
