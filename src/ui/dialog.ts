/**
 * Alert.alert that also works in the browser. react-native-web's Alert does nothing, which silently
 * broke every confirmation (delete, remove, record a dose) and every error message on the web build.
 * On the web a question with a Cancel button becomes window.confirm and anything else window.alert;
 * on phones this is the system dialog, unchanged.
 */
import { Alert, Platform, type AlertButton } from 'react-native';

export function showAlert(title: string, message?: string, buttons?: AlertButton[]): void {
  if (Platform.OS !== 'web') {
    Alert.alert(title, message, buttons);
    return;
  }
  const text = message ? `${title}\n\n${message}` : title;
  const cancel = buttons?.find((b) => b.style === 'cancel');
  const action = buttons?.find((b) => b.style !== 'cancel');
  if (cancel && action) {
    if (globalThis.confirm(text)) action.onPress?.();
    else cancel.onPress?.();
    return;
  }
  globalThis.alert(text);
  (action ?? cancel)?.onPress?.();
}
