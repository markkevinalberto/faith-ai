/**
 * Push-to-talk microphone capture: 16 kHz mono 16-bit PCM collected in memory only (never written
 * to disk), then handed to on-device Whisper. Android-first; requires the RECORD_AUDIO permission.
 */
import { PermissionsAndroid, Platform } from 'react-native';

import { base64ToBytes, concatBytes, peakLevel } from './wav';

interface LiveAudioStream {
  init(options: { sampleRate: number; channels: number; bitsPerSample: number; audioSource?: number; bufferSize?: number; wavFile: string }): void;
  start(): void;
  stop(): Promise<string>;
  on(event: 'data', callback: (base64: string) => void): { remove(): void } | undefined;
}

export const SAMPLE_RATE = 16000;
export const MAX_RECORDING_SECONDS = 20;

export interface Recording {
  /** Stops capture and returns the PCM audio. */
  stop(): Promise<Uint8Array>;
  /** Stops capture and discards the audio. */
  cancel(): Promise<void>;
}

let active = false;

async function ensurePermission(): Promise<void> {
  if (Platform.OS !== 'android') return;
  const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, {
    title: 'Microphone',
    message: 'FAITH listens only while you hold the voice button. Audio is turned into text on this phone and is never saved or sent.',
    buttonPositive: 'Allow',
    buttonNegative: 'Not now',
  });
  if (granted !== PermissionsAndroid.RESULTS.GRANTED) throw new Error('Microphone permission was not granted. You can type instead.');
}

export async function startRecording(onLevel?: (level: number) => void): Promise<Recording> {
  if (Platform.OS === 'web') throw new Error('Voice input needs the Android or iOS app.');
  if (active) throw new Error('Already listening.');
  await ensurePermission();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const stream = (require('@fugood/react-native-audio-pcm-stream') as { default: LiveAudioStream }).default;
  const chunks: Uint8Array[] = [];
  stream.init({ sampleRate: SAMPLE_RATE, channels: 1, bitsPerSample: 16, audioSource: 6, bufferSize: 4096, wavFile: '' });
  const sub = stream.on('data', (b64) => {
    const bytes = base64ToBytes(b64);
    chunks.push(bytes);
    onLevel?.(peakLevel(bytes));
  });
  active = true;
  stream.start();
  const finish = async () => {
    if (!active) return;
    active = false;
    try {
      await stream.stop();
    } finally {
      sub?.remove();
    }
  };
  return {
    async stop() {
      await finish();
      return concatBytes(chunks);
    },
    async cancel() {
      await finish();
      chunks.length = 0;
    },
  };
}
