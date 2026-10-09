import { parseVoiceReading } from '@/ai/voice/voiceCommands';
import { base64ToBytes, concatBytes, durationSeconds, peakLevel } from '@/ai/voice/wav';

describe('voice reading parser', () => {
  it.each([
    ['Blood pressure 130 over 85, pulse 72', { type: 'blood_pressure', systolic: 130, diastolic: 85, pulse: 72 }],
    ['my BP is 142/91', { type: 'blood_pressure', systolic: 142, diastolic: 91, pulse: null }],
    ['sugar 145 fasting', { type: 'glucose', value: 145, unit: null, context: 'fasting' }],
    ['glucose 7.8 mmol after lunch', { type: 'glucose', value: 7.8, unit: 'mmol/L', context: 'after_meal' }],
    ['weight 72.5 kilos', { type: 'weight', value: 72.5, unit: 'kg' }],
    ['I weigh 160 pounds', { type: 'weight', value: 160, unit: 'lb' }],
    ['temperature 38.2 celsius', { type: 'temperature', value: 38.2, unit: 'C' }],
    ['oxygen 97', { type: 'spo2', value: 97 }],
    ['heart rate 88', { type: 'pulse', value: 88 }],
  ])('%p', (text, expected) => {
    expect(parseVoiceReading(text)).toEqual(expected);
  });

  it('returns null for unrelated speech', () => {
    expect(parseVoiceReading('what is HbA1c')).toBeNull();
  });
});

describe('PCM helpers', () => {
  it('decodes base64 like Node does', () => {
    const data = Uint8Array.from([0, 1, 2, 250, 251, 255, 128, 64]);
    const b64 = Buffer.from(data).toString('base64');
    expect(Array.from(base64ToBytes(b64))).toEqual(Array.from(data));
  });

  it('joins chunks and measures duration and level of 16 kHz mono 16-bit PCM', () => {
    const pcm = concatBytes([new Uint8Array(16000), new Uint8Array(16000)]);
    expect(pcm.length).toBe(32000);
    expect(durationSeconds(pcm.length)).toBe(1);
    expect(peakLevel(new Uint8Array(4))).toBe(0);
    // samples: +16384 (0x4000) and -32768 (0x8000), little-endian
    expect(peakLevel(Uint8Array.from([0x00, 0x40, 0x00, 0x80]))).toBe(1);
    expect(peakLevel(Uint8Array.from([0x00, 0x40]))).toBe(0.5);
  });
});
