/** Small secrets (the online assistant's API key) in the phone's secure storage. See secret.web.ts for the browser. */
import * as SecureStore from 'expo-secure-store';

const opts: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

export async function getSecret(name: string): Promise<string | null> {
  return SecureStore.getItemAsync(name, opts);
}

export async function setSecret(name: string, value: string | null): Promise<void> {
  if (value === null || value === '') await SecureStore.deleteItemAsync(name, opts);
  else await SecureStore.setItemAsync(name, value, opts);
}
