import { Platform, View } from 'react-native';

import { SETTINGS, setSetting } from '@/db/repo/profiles';
import { useApp } from '@/state/AppState';
import { SegmentedControl } from '@/ui/Fields';
import { AppText } from '@/ui/Text';
import { TEXT_SIZES, setTextSize, useTextSize, type TextSizeId } from '@/ui/textSize';
import { SPACE } from '@/ui/theme';

/** Text size choice (Standard / Large / Extra large). Applies at once everywhere and is saved on this device. */
export function TextSizePicker({ hint = true }: { hint?: boolean }) {
  const { db } = useApp();
  const { id } = useTextSize();
  const choose = (next: TextSizeId) => {
    setTextSize(next);
    // A failed save only means the choice resets next launch; nothing to report.
    void setSetting(db, SETTINGS.textSize, next).catch(() => undefined);
  };
  return (
    <View style={{ gap: SPACE.sm }}>
      <SegmentedControl label="Text size" options={TEXT_SIZES.map((s) => ({ value: s.id, label: s.label }))} value={id} onChange={choose} />
      {hint ? (
        <AppText variant="caption" tone="muted">
          Changes the size of all text in FAITH. {Platform.OS === 'web' ? 'Your browser zoom also applies.' : 'Your phone’s own font size setting also applies.'}
        </AppText>
      ) : null}
    </View>
  );
}
