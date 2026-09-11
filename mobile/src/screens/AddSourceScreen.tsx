import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { describeError, type SourceConfig } from '@iptv-ninja/core';

import { Button, Field, Screen, SegmentedControl } from '../components/ui';
import { pickPlaylistFile } from '../platform/playlistFile';
import { useAppState } from '../state/AppState';
import { branding } from '../theme/branding';

const { colors, radii, spacing, typography } = branding;

type Mode = 'xtream' | 'url' | 'file';

/**
 * Adds a source. The three modes all end up calling `addSource` with a core
 * `SourceConfig`, so validation and normalisation happen in core, not here.
 */
export function AddSourceScreen() {
  const navigation = useNavigation();
  const { addSource } = useAppState();

  const [mode, setMode] = useState<Mode>('xtream');
  const [name, setName] = useState('');
  const [serverUrl, setServerUrl] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [playlistUrl, setPlaylistUrl] = useState('');
  const [epgUrl, setEpgUrl] = useState('');
  const [playlistText, setPlaylistText] = useState('');
  const [pickedFileName, setPickedFileName] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePickFile = async () => {
    setError(null);
    try {
      const picked = await pickPlaylistFile();
      if (!picked) return;
      setPlaylistText(picked.content);
      setPickedFileName(picked.name);
      if (!name) setName(picked.name.replace(/\.(m3u8?|txt)$/i, ''));
    } catch (pickError) {
      setError(describeError(pickError));
    }
  };

  const buildConfig = (): SourceConfig => {
    if (mode === 'xtream') {
      return { kind: 'xtream', serverUrl, username, password };
    }
    if (mode === 'url') {
      return {
        kind: 'm3u',
        url: playlistUrl,
        ...(epgUrl.trim() ? { epgUrl } : {}),
      };
    }
    return { kind: 'm3u', content: playlistText };
  };

  const handleSave = async () => {
    setBusy(true);
    setError(null);
    try {
      const fallbackName =
        mode === 'xtream' ? username || 'Xtream account' : pickedFileName || 'My playlist';
      await addSource(name.trim() || fallbackName, buildConfig());
      navigation.goBack();
    } catch (saveError) {
      setError(describeError(saveError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.notice}>{branding.copy.bringYourOwnNotice}</Text>

          <SegmentedControl<Mode>
            value={mode}
            onChange={(next) => {
              setMode(next);
              setError(null);
            }}
            options={[
              { value: 'xtream', label: 'Xtream Codes' },
              { value: 'url', label: 'M3U URL' },
              { value: 'file', label: 'Paste / file' },
            ]}
          />

          <View style={styles.form}>
            <Field
              label="Name"
              placeholder={mode === 'xtream' ? 'My provider' : 'My playlist'}
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
            />

            {mode === 'xtream' ? (
              <>
                <Field
                  label="Server URL"
                  placeholder="http://example.com:8080"
                  hint="The panel address your provider gave you. http:// is added if you leave it out."
                  value={serverUrl}
                  onChangeText={setServerUrl}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  inputMode="url"
                />
                <Field
                  label="Username"
                  value={username}
                  onChangeText={setUsername}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <Field
                  label="Password"
                  value={password}
                  onChangeText={setPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  secureTextEntry
                />
              </>
            ) : null}

            {mode === 'url' ? (
              <>
                <Field
                  label="Playlist URL"
                  placeholder="http://example.com/get.php?username=…&type=m3u_plus"
                  value={playlistUrl}
                  onChangeText={setPlaylistUrl}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  inputMode="url"
                />
                <Field
                  label="XMLTV guide URL (optional)"
                  placeholder="http://example.com/xmltv.php?username=…"
                  hint="Leave blank to use the url-tvg value from the playlist, if it has one."
                  value={epgUrl}
                  onChangeText={setEpgUrl}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  inputMode="url"
                />
              </>
            ) : null}

            {mode === 'file' ? (
              <>
                <Button label="Choose an .m3u file" variant="secondary" onPress={handlePickFile} />
                {pickedFileName ? (
                  <Text style={styles.fileName}>Loaded {pickedFileName}</Text>
                ) : null}
                <View style={styles.spacer} />
                <Field
                  label="Or paste the playlist"
                  placeholder={'#EXTM3U\n#EXTINF:-1 tvg-id="…",Channel\nhttp://…'}
                  value={playlistText}
                  onChangeText={setPlaylistText}
                  autoCapitalize="none"
                  autoCorrect={false}
                  multiline
                />
              </>
            ) : null}

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Button
              label={mode === 'xtream' ? 'Sign in and load channels' : 'Load playlist'}
              onPress={() => {
                void handleSave();
              }}
              busy={busy}
            />
            <Button label="Cancel" variant="secondary" onPress={() => navigation.goBack()} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    padding: spacing(2),
    paddingBottom: spacing(6),
  },
  notice: {
    color: colors.textMuted,
    fontSize: typography.label,
    lineHeight: typography.label * 1.5,
    marginBottom: spacing(1),
  },
  form: {
    marginTop: spacing(2),
    gap: spacing(1),
  },
  spacer: {
    height: spacing(1),
  },
  fileName: {
    color: colors.success,
    fontSize: typography.caption,
    marginTop: spacing(0.5),
  },
  error: {
    color: colors.danger,
    fontSize: typography.body,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 2,
    borderColor: colors.danger,
    padding: spacing(1.5),
    marginBottom: spacing(1),
  },
});
