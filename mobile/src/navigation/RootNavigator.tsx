import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { NavigationContainer, type Theme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import { BrandHeaderTitle } from '../components/BrandHeaderTitle';
import { AddSourceScreen } from '../screens/AddSourceScreen';
import { BrowseScreen } from '../screens/BrowseScreen';
import { ChannelListScreen } from '../screens/ChannelListScreen';
import { FavouritesScreen } from '../screens/FavouritesScreen';
import { GuideScreen } from '../screens/GuideScreen';
import { PlayerScreen } from '../screens/PlayerScreen';
import { PlaylistsScreen } from '../screens/PlaylistsScreen';
import { SearchScreen } from '../screens/SearchScreen';
import { SeriesDetailScreen } from '../screens/SeriesDetailScreen';
import { branding } from '../theme/branding';
import type { RootStackParamList, TabParamList } from './types';

const { colors, typography } = branding;

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tabs = createBottomTabNavigator<TabParamList>();

const navigationTheme: Theme = {
  dark: true,
  colors: {
    primary: colors.primary,
    background: colors.background,
    card: colors.surface,
    text: colors.text,
    border: colors.border,
    notification: colors.primary,
  },
  fonts: {
    regular: { fontFamily: 'System', fontWeight: '400' },
    medium: { fontFamily: 'System', fontWeight: '500' },
    bold: { fontFamily: 'System', fontWeight: '700' },
    heavy: { fontFamily: 'System', fontWeight: '800' },
  },
};

/**
 * Tab icons are text glyphs on purpose: no icon font to bundle, and the label
 * stays legible when this is re-skinned for a client.
 */
const TAB_GLYPHS: Record<keyof TabParamList, string> = {
  Browse: '☰',
  Search: '⌕',
  Favourites: '★',
  Playlists: '⛁',
};

function TabsNavigator() {
  return (
    <Tabs.Navigator
      screenOptions={({ route }) => ({
        headerStyle: styles.header,
        headerTitleStyle: styles.headerTitle,
        headerTintColor: colors.text,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textFaint,
        tabBarLabelStyle: styles.tabLabel,
        tabBarIcon: ({ color }) => (
          <Text style={[styles.tabGlyph, { color }]}>{TAB_GLYPHS[route.name]}</Text>
        ),
      })}
    >
      <Tabs.Screen
        name="Browse"
        component={BrowseScreen}
        options={{
          title: branding.copy.appName,
          // No label: the home screen shows the product name and tagline.
          headerTitle: () => <BrandHeaderTitle />,
        }}
      />
      <Tabs.Screen
        name="Search"
        component={SearchScreen}
        options={{ headerTitle: () => <BrandHeaderTitle label="Search" /> }}
      />
      <Tabs.Screen
        name="Favourites"
        component={FavouritesScreen}
        options={{ headerTitle: () => <BrandHeaderTitle label="Favourites" /> }}
      />
      <Tabs.Screen
        name="Playlists"
        component={PlaylistsScreen}
        options={{ headerTitle: () => <BrandHeaderTitle label="Playlists" /> }}
      />
    </Tabs.Navigator>
  );
}

export function RootNavigator() {
  return (
    <NavigationContainer theme={navigationTheme}>
      <Stack.Navigator
        screenOptions={{
          headerStyle: styles.header,
          headerTitleStyle: styles.headerTitle,
          headerTintColor: colors.text,
          contentStyle: styles.content,
        }}
      >
        <Stack.Screen name="Tabs" component={TabsNavigator} options={{ headerShown: false }} />
        <Stack.Screen name="ChannelList" component={ChannelListScreen} />
        <Stack.Screen name="SeriesDetail" component={SeriesDetailScreen} />
        <Stack.Screen name="Guide" component={GuideScreen} />
        <Stack.Screen
          name="Player"
          component={PlayerScreen}
          options={{ headerShown: false, orientation: 'default' }}
        />
        <Stack.Screen
          name="AddSource"
          component={AddSourceScreen}
          options={{ title: 'Add a playlist', presentation: 'modal' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: colors.surface,
  },
  headerTitle: {
    color: colors.text,
    fontSize: typography.heading,
    fontWeight: '700',
  },
  content: {
    backgroundColor: colors.background,
  },
  tabBar: {
    backgroundColor: colors.surface,
    borderTopColor: colors.border,
  },
  tabLabel: {
    fontSize: typography.caption,
    fontWeight: '600',
  },
  tabGlyph: {
    fontSize: 18,
  },
});
