/**
 * Photo capture + on-device text recognition (Google ML Kit, bundled model — works offline).
 * The photo stays in the app's cache unless the user chooses to attach it to a record.
 */
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

import { linesToRows, type OcrLine } from './layout';

export type ImageSource = 'camera' | 'library';

export interface CapturedImage {
  uri: string;
  width: number;
  height: number;
  mimeType: string | null;
}

export async function captureImage(source: ImageSource): Promise<CapturedImage | null> {
  if (Platform.OS === 'web') throw new Error('Scanning needs the Android or iOS app.');
  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) throw new Error('Camera permission was not granted. You can pick a photo from your gallery instead.');
  }
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.9, allowsEditing: false, exif: false };
  const result = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled || !result.assets?.[0]) return null;
  const a = result.assets[0];
  return { uri: a.uri, width: a.width, height: a.height, mimeType: a.mimeType ?? 'image/jpeg' };
}

export interface OcrResult {
  /** Text rebuilt row by row (table columns re-joined). */
  text: string;
  rows: string[];
  durationMs: number;
}

interface MlKitResult {
  text: string;
  blocks: { lines: OcrLine[] }[];
}

export async function recognizeText(uri: string): Promise<OcrResult> {
  const started = Date.now();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const TextRecognition = (require('@react-native-ml-kit/text-recognition') as { default: { recognize(uri: string): Promise<MlKitResult> } }).default;
  const result = await TextRecognition.recognize(uri);
  const rows = linesToRows(result.blocks.flatMap((b) => b.lines));
  return { text: rows.join('\n'), rows, durationMs: Date.now() - started };
}
