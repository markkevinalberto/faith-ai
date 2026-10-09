/**
 * One-tap offer of FAITH's shared online assistant, shown once at the top of Ask FAITH. Nothing is
 * sent anywhere until the person taps "Turn on"; "Not now" hides it for good (Settings keeps it).
 */
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { loadOnlineSettings, saveOnlineSettings, useOnlineSettings } from '@/ai/inference/onlineAssistant';
import { SETTINGS, getSetting, setSetting } from '@/db/repo/profiles';
import { useApp } from '@/state/AppState';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Layout';
import { AppText } from '@/ui/Text';
import { SPACE } from '@/ui/theme';

export function OnlineOfferCard() {
  const { db } = useApp();
  const s = useOnlineSettings();
  const [dismissed, setDismissed] = useState<boolean | null>(null);

  useEffect(() => {
    void loadOnlineSettings(db).catch(() => undefined);
    getSetting(db, SETTINGS.onlineOffer)
      .then((v) => setDismissed(v === 'dismissed'))
      .catch(() => setDismissed(true));
  }, [db]);

  if (!s || dismissed !== false || s.enabled) return null;

  const done = () => {
    setDismissed(true);
    void setSetting(db, SETTINGS.onlineOffer, 'dismissed').catch(() => undefined);
  };
  const turnOn = () => {
    void saveOnlineSettings(db, { enabled: true, provider: 'faith' }).catch(() => undefined);
    done();
  };

  return (
    <Card tone="info" style={{ gap: SPACE.md }}>
      <AppText variant="heading">Clearer answers when you’re online?</AppText>
      <AppText variant="body">
        FAITH can use a bigger model over the internet for Ask FAITH and her notes. Your question and the facts shown under each answer go to FAITH’s relay and then to Groq, and nothing is stored there. Offline, FAITH keeps answering on this device. You can change this any time in Settings.
      </AppText>
      <View style={{ flexDirection: 'row', gap: SPACE.sm }}>
        <Button title="Turn on" icon="cloud-outline" onPress={turnOn} style={{ flex: 1 }} />
        <Button title="Not now" variant="ghost" onPress={done} style={{ flex: 1 }} />
      </View>
    </Card>
  );
}
