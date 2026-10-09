/**
 * Tiny, dependency-free helpers for recorded audio: the microphone stream delivers base64 chunks of
 * 16 kHz mono 16-bit PCM, which are joined in memory and handed straight to Whisper — no audio file
 * is ever written to disk.
 */
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const LOOKUP = (() => {
  const t = new Int16Array(256).fill(-1);
  for (let i = 0; i < B64.length; i++) t[B64.charCodeAt(i)] = i;
  return t;
})();

export function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i + 1 < clean.length; i += 4) {
    const a = LOOKUP[clean.charCodeAt(i)];
    const b = LOOKUP[clean.charCodeAt(i + 1)];
    const c = i + 2 < clean.length ? LOOKUP[clean.charCodeAt(i + 2)] : -1;
    const d = i + 3 < clean.length ? LOOKUP[clean.charCodeAt(i + 3)] : -1;
    out[o++] = (a << 2) | (b >> 4);
    if (c >= 0) out[o++] = ((b & 15) << 4) | (c >> 2);
    if (d >= 0) out[o++] = ((c & 3) << 6) | d;
  }
  return out.subarray(0, o);
}

export function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((s, c) => s + c.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

/** Peak level (0–1) of a little-endian 16-bit PCM chunk, for the recording meter. */
export function peakLevel(pcm: Uint8Array): number {
  let peak = 0;
  for (let i = 0; i + 1 < pcm.length; i += 2) {
    const s = Math.abs((pcm[i] | (pcm[i + 1] << 8)) << 16 >> 16);
    if (s > peak) peak = s;
  }
  return peak / 32768;
}

export function durationSeconds(pcmBytes: number, sampleRate = 16000, channels = 1, bitsPerSample = 16): number {
  return pcmBytes / (sampleRate * channels * (bitsPerSample / 8));
}
