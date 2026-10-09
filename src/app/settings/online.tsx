/**
 * Optional online assistant settings: off by default. The person brings their own API key (Groq's
 * free plan by default, or any OpenAI-compatible service). When on and online, Ask FAITH and FAITH's
 * note use it instead of the on-device model: the same facts, the same guard. See
 * ai/inference/onlineAssistant.ts.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { Linking, Platform, Pressable, View } from 'react-native';

import { PROVIDERS, loadOnlineSettings, saveOnlineSettings, testOnlineAssistant, useOnlineSettings, type OnlineSettings } from '@/ai/inference/onlineAssistant';
import { useApp } from '@/state/AppState';
import { friendlyError } from '@/state/hooks';
import { Button } from '@/ui/Button';
import { Banner, InlineLoading } from '@/ui/Feedback';
import { SegmentedControl, TextField, ToggleRow } from '@/ui/Fields';
import { Card, Screen, Section } from '@/ui/Layout';
import { AppText } from '@/ui/Text';
import { SPACE, useTheme } from '@/ui/theme';

const WEB = Platform.OS === 'web';

type Notice = { tone: 'success' | 'danger'; title: string; message: string } | null;

export default function OnlineAssistantSettings() {
  const { db } = useApp();
  const { c } = useTheme();
  const s = useOnlineSettings();
  const [key, setKey] = useState('');
  const [baseUrl, setBaseUrl] = useState<string | null>(null);
  const [model, setModel] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    void loadOnlineSettings(db).catch(() => undefined);
  }, [db]);

  if (!s) return <InlineLoading />;

  const provider = PROVIDERS[s.provider];
  const save = (patch: Partial<Omit<OnlineSettings, 'hasKey'>>, apiKey?: string) =>
    saveOnlineSettings(db, patch, apiKey).catch((e) => setNotice({ tone: 'danger', title: "Couldn't save", message: friendlyError(e) }));

  const saveKey = async () => {
    await save({}, key);
    setKey('');
    setNotice({ tone: 'success', title: 'Key saved', message: WEB ? 'Kept in this browser’s storage.' : 'Kept in your phone’s secure storage.' });
  };

  const test = async () => {
    setTesting(true);
    const r = await testOnlineAssistant(db);
    setTesting(false);
    setNotice({ tone: r.ok ? 'success' : 'danger', title: r.ok ? 'Connected' : 'Not connected', message: r.message });
  };

  return (
    <Screen edges={[]} keyboard>
      <Banner
        tone="info"
        icon="cloud-outline"
        title="Optional, off by default"
        message="When this is on and you have internet, FAITH uses a bigger online model for clearer answers in Ask FAITH and in her notes. To do that it sends your question, the facts it computed from your records (the ones shown under each answer) and the library excerpts to that service. With no internet, or if the service fails, FAITH uses the on-device model as before."
      />

      <Card padded={false} style={{ paddingHorizontal: SPACE.lg }}>
        <ToggleRow
          label="Use the online assistant"
          description={provider.requiresKey && !s.hasKey ? 'Paste an API key below first.' : 'Only when the internet is reachable. Every online answer is marked.'}
          value={s.enabled}
          onValueChange={(v) => void save({ enabled: v })}
        />
      </Card>

      <Section title="Service">
        <SegmentedControl
          options={[
            { value: 'faith', label: 'FAITH’s' },
            { value: 'groq', label: 'Own Groq key' },
            { value: 'custom', label: 'Custom' },
          ]}
          value={s.provider}
          onChange={(v) => void save({ provider: v })}
        />
        {s.provider === 'faith' ? (
          <Card style={{ gap: SPACE.sm }}>
            <AppText variant="bodyStrong">{provider.models[0].label} through FAITH’s relay</AppText>
            <AppText variant="body" tone="muted">
              Nothing to set up: no account and no key. {provider.limits}
            </AppText>
            <AppText variant="caption" tone="muted">
              {provider.privacy}
            </AppText>
            <Button title="Groq’s data policy" icon="open-outline" variant="ghost" size="sm" onPress={() => void Linking.openURL(provider.dataUrl as string)} style={{ alignSelf: 'flex-start' }} />
          </Card>
        ) : s.provider === 'groq' ? (
          <Card style={{ gap: SPACE.sm }}>
            <AppText variant="label">Model</AppText>
            <View accessibilityRole="radiogroup">
              {provider.models.map((m) => {
                const selected = s.model === m.id;
                return (
                  <Pressable
                    key={m.id}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    aria-checked={selected}
                    accessibilityLabel={`${m.label}, ${m.note}`}
                    onPress={() => void save({ model: m.id })}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, minHeight: 52 }}>
                    <Ionicons name={selected ? 'radio-button-on' : 'radio-button-off'} size={22} color={selected ? c.primary : c.textSubtle} />
                    <View style={{ flex: 1 }}>
                      <AppText variant="bodyStrong">{m.label}</AppText>
                      <AppText variant="caption" tone="muted">
                        {m.note} · {m.id}
                      </AppText>
                    </View>
                  </Pressable>
                );
              })}
            </View>
            <AppText variant="caption" tone="muted">
              {provider.limits}
            </AppText>
            <AppText variant="caption" tone="muted">
              {provider.privacy}
            </AppText>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm }}>
              <Button title="Get a free Groq key" icon="key-outline" variant="secondary" size="sm" onPress={() => void Linking.openURL(provider.keyUrl as string)} />
              <Button title="Groq’s data policy" icon="open-outline" variant="ghost" size="sm" onPress={() => void Linking.openURL(provider.dataUrl as string)} />
            </View>
          </Card>
        ) : (
          <Card style={{ gap: SPACE.md }}>
            <TextField label="Service address" value={baseUrl ?? s.baseUrl} onChangeText={setBaseUrl} placeholder="https://example.com/v1" autoCapitalize="none" helper="The part of the address before /chat/completions." />
            <TextField label="Model name" value={model ?? s.model} onChangeText={setModel} placeholder="e.g. gpt-4o-mini" autoCapitalize="none" />
            <Button title="Save service" variant="secondary" size="sm" onPress={() => void save({ baseUrl: (baseUrl ?? s.baseUrl).trim(), model: (model ?? s.model).trim() })} style={{ alignSelf: 'flex-start' }} />
            <AppText variant="caption" tone="muted">
              {provider.privacy}
            </AppText>
          </Card>
        )}
      </Section>

      {provider.requiresKey ? (
        <Section title="API key" hint={WEB ? 'Kept in this browser’s storage, not in FAITH’s database.' : 'Kept in your phone’s secure storage, not in FAITH’s database, and never shown again after saving.'}>
          <Card style={{ gap: SPACE.md }}>
            {s.hasKey ? <Banner tone="success" icon="key" message="A key is saved. Paste a new one to replace it." /> : null}
            <TextField label={s.hasKey ? 'New API key' : 'API key'} value={key} onChangeText={setKey} secureTextEntry autoCapitalize="none" placeholder="Paste your key" />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm }}>
              <Button title="Save key" icon="checkmark" disabled={!key.trim()} onPress={() => void saveKey()} />
              {s.hasKey ? <Button title="Remove key" icon="trash-outline" variant="danger" onPress={() => void save({ enabled: false }, '')} /> : null}
            </View>
            <Button title="Test connection" icon="flash-outline" variant="soft" loading={testing} disabled={!s.hasKey} onPress={() => void test()} />
          </Card>
        </Section>
      ) : (
        <Button title="Test connection" icon="flash-outline" variant="soft" loading={testing} onPress={() => void test()} />
      )}

      {notice ? <Banner tone={notice.tone} title={notice.title} message={notice.message} /> : null}

      <AppText variant="caption" tone="subtle">
        The online model gets the same rules as the on-device one: it may only reword the facts FAITH computed, it must not diagnose or change medicines, and FAITH checks every answer before showing it. Answers written online are marked as such.
      </AppText>
    </Screen>
  );
}
