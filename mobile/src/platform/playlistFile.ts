import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';

export interface PickedPlaylist {
  name: string;
  content: string;
}

/**
 * Lets the user pick an `.m3u`/`.m3u8` file and returns its contents.
 *
 * Reading a file off the device is platform glue, so it lives here rather than
 * in core — core only ever sees the resulting playlist text.
 *
 * Resolves to null when the user cancels.
 */
export async function pickPlaylistFile(): Promise<PickedPlaylist | null> {
  const result = await DocumentPicker.getDocumentAsync({
    // Pickers report M3U files as octet-stream, text/plain or the real MIME
    // type depending on the device, so accept anything and let the parser
    // reject what it cannot read.
    type: ['audio/x-mpegurl', 'application/x-mpegurl', 'text/plain', '*/*'],
    copyToCacheDirectory: true,
    multiple: false,
  });

  if (result.canceled) return null;

  const asset = result.assets[0];
  if (!asset) return null;

  const content = await new File(asset.uri).text();
  return { name: asset.name ?? 'playlist.m3u', content };
}
