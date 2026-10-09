/** RFC 4122 v4 UUIDs. Uses Web Crypto when present (Node/tests), otherwise expo-crypto (native). */
export function newId(): string {
  const webCrypto = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (webCrypto?.randomUUID) return webCrypto.randomUUID();
  // Required lazily so pure Node tests never load the native module.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ExpoCrypto = require('expo-crypto') as typeof import('expo-crypto');
  return ExpoCrypto.randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}
