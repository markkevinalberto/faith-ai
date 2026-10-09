/**
 * Browser build: there is no secure store, so the key lives in this origin's localStorage. The
 * settings screen says so. (The browser build keeps no encrypted records either.)
 */
const PREFIX = 'faith.secret.';

export async function getSecret(name: string): Promise<string | null> {
  try {
    return globalThis.localStorage?.getItem(PREFIX + name) ?? null;
  } catch {
    return null;
  }
}

export async function setSecret(name: string, value: string | null): Promise<void> {
  try {
    if (value === null || value === '') globalThis.localStorage?.removeItem(PREFIX + name);
    else globalThis.localStorage?.setItem(PREFIX + name, value);
  } catch {
    // Private windows may block storage; the key then lasts for this session only.
  }
}
