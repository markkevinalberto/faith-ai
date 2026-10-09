/**
 * Tap-to-talk button: records from the microphone (in memory), transcribes with on-device Whisper,
 * and hands back the text. Hidden on web. If no voice model is installed, offers to open settings.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, View } from 'react-native';

import { localModels } from '@/ai/inference/localModels';
import { MAX_RECORDING_SECONDS, startRecording, type Recording } from '@/ai/voice/recorder';
import { durationSeconds } from '@/ai/voice/wav';
import { friendlyError } from '@/state/hooks';
import { showAlert } from '@/ui/dialog';
import { AppText } from '@/ui/Text';
import { RADIUS, SPACE, useTheme } from '@/ui/theme';

type Phase = 'idle' | 'listening' | 'transcribing';

export type VoicePhase = Phase;

export function VoiceButton({
  onTranscript,
  onPhaseChange,
  label = 'Speak',
  size = 44,
  showLabel = false,
  showStatus = true,
}: {
  onTranscript: (text: string) => void;
  onPhaseChange?: (phase: Phase) => void;
  label?: string;
  size?: number;
  showLabel?: boolean;
  showStatus?: boolean;
}) {
  const { c } = useTheme();
  const [phase, setPhaseState] = useState<Phase>('idle');
  const setPhase = (p: Phase) => {
    setPhaseState(p);
    onPhaseChange?.(p);
  };
  const [level, setLevel] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const recording = useRef<Recording | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearInterval(timer.current);
      void recording.current?.cancel();
    },
    [],
  );

  if (Platform.OS === 'web') return null;

  const stop = async () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    const rec = recording.current;
    recording.current = null;
    if (!rec) return;
    setPhase('transcribing');
    try {
      const pcm = await rec.stop();
      if (durationSeconds(pcm.length) < 0.5) throw new Error('That was too short — tap the microphone, speak, then tap again.');
      const text = await localModels.transcribe(pcm);
      if (!text) throw new Error("FAITH didn't catch any words. Try again a little closer to the phone.");
      onTranscript(text);
    } catch (e) {
      showAlert('Voice input', friendlyError(e));
    } finally {
      setPhase('idle');
      setLevel(0);
    }
  };

  const start = async () => {
    if (!(await localModels.hasModel('speech'))) {
      showAlert('Voice needs the on-device Whisper model', 'Download it once in Settings → On-device AI (about 78–148 MB). After that, voice works with no internet.', [
        { text: 'Not now', style: 'cancel' },
        { text: 'Open settings', onPress: () => router.push('/settings/model') },
      ]);
      return;
    }
    try {
      recording.current = await startRecording((l) => setLevel(l));
      setSeconds(0);
      setPhase('listening');
      const startedAt = Date.now();
      timer.current = setInterval(() => {
        const s = Math.floor((Date.now() - startedAt) / 1000);
        setSeconds(s);
        if (s >= MAX_RECORDING_SECONDS) void stop();
      }, 250);
    } catch (e) {
      recording.current = null;
      showAlert('Voice input', friendlyError(e));
    }
  };

  const listening = phase === 'listening';
  const ring = listening ? 4 + Math.round(Math.min(1, level * 3) * 8) : 0;
  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={listening ? 'Stop listening' : phase === 'transcribing' ? 'Transcribing' : label}
        accessibilityHint={listening ? 'Turns your speech into text on this phone' : 'Starts listening. Tap again when you finish speaking.'}
        accessibilityState={{ busy: phase === 'transcribing' }}
        disabled={phase === 'transcribing'}
        onPress={() => void (listening ? stop() : start())}
        style={({ pressed }) => [
          styles.button,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: listening ? c.danger : pressed ? c.primaryPressed : c.primarySoft,
            borderWidth: ring,
            borderColor: listening ? c.dangerSoft : 'transparent',
          },
        ]}>
        {phase === 'transcribing' ? <ActivityIndicator color={c.primary} /> : <Ionicons name={listening ? 'stop' : 'mic'} size={size * 0.45} color={listening ? c.onPrimary : c.primary} />}
      </Pressable>
      {showLabel || (showStatus && phase !== 'idle') ? (
        <AppText variant="caption" tone={listening ? 'danger' : 'muted'} style={{ flexShrink: 1 }}>
          {listening ? `Listening… ${seconds}s · tap to stop` : phase === 'transcribing' ? 'Transcribing on this phone…' : label}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  button: { alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS.pill },
});
