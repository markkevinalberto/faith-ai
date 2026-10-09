import DateTimePicker, { DateTimePickerAndroid, type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Switch, TextInput, View, type KeyboardTypeOptions } from 'react-native';

import { AppText } from './Text';
import { MIN_TOUCH, RADIUS, SPACE, TYPE, useTheme } from './theme';

export interface TextFieldProps {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  helper?: string;
  error?: string | null;
  keyboardType?: KeyboardTypeOptions;
  multiline?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  suffix?: string;
  maxLength?: number;
  testID?: string;
  autoFocus?: boolean;
}

export function TextField({ label, value, onChangeText, placeholder, helper, error, keyboardType, multiline, autoCapitalize, suffix, maxLength, testID, autoFocus }: TextFieldProps) {
  const { c } = useTheme();
  const [focused, setFocused] = useState(false);
  const borderColor = error ? c.danger : focused ? c.primary : c.borderStrong;
  return (
    <View style={{ gap: SPACE.xs }}>
      <AppText variant="label">{label}</AppText>
      <View style={[styles.inputWrap, { borderColor, backgroundColor: c.surface, minHeight: multiline ? 104 : 52 }, focused && { borderWidth: 2 }]}>
        <TextInput
          testID={testID}
          accessibilityLabel={label}
          accessibilityHint={helper}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={c.textSubtle}
          keyboardType={keyboardType}
          multiline={multiline}
          autoCapitalize={autoCapitalize}
          maxLength={maxLength}
          autoFocus={autoFocus}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          maxFontSizeMultiplier={1.8}
          style={[TYPE.body, styles.input, { color: c.text, textAlignVertical: multiline ? 'top' : 'center' }]}
        />
        {suffix ? (
          <AppText variant="label" tone="muted" style={{ marginLeft: SPACE.sm }}>
            {suffix}
          </AppText>
        ) : null}
      </View>
      {error ? (
        <AppText variant="caption" tone="danger" accessibilityLiveRegion="polite">
          {error}
        </AppText>
      ) : helper ? (
        <AppText variant="caption" tone="subtle">
          {helper}
        </AppText>
      ) : null}
    </View>
  );
}

export interface Option<T extends string | number> {
  value: T;
  label: string;
}

export function SegmentedControl<T extends string | number>({ options, value, onChange, label }: { options: Option<T>[]; value: T; onChange: (v: T) => void; label?: string }) {
  const { c } = useTheme();
  return (
    <View style={{ gap: SPACE.xs }}>
      {label ? <AppText variant="label">{label}</AppText> : null}
      <View accessibilityRole="radiogroup" accessibilityLabel={label} style={[styles.segment, { backgroundColor: c.surfaceMuted }]}>
        {options.map((o) => {
          const selected = o.value === value;
          return (
            <Pressable
              key={String(o.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={o.label}
              onPress={() => onChange(o.value)}
              style={[styles.segmentItem, selected && { backgroundColor: c.surface, borderColor: c.border }]}>
              <AppText variant="label" tone={selected ? 'primary' : 'muted'} numberOfLines={1}>
                {o.label}
              </AppText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function ChipSelect<T extends string | number>({
  options,
  selected,
  onToggle,
  label,
  helper,
}: {
  options: Option<T>[];
  selected: T[];
  onToggle: (v: T) => void;
  label?: string;
  helper?: string;
}) {
  const { c } = useTheme();
  return (
    <View style={{ gap: SPACE.xs }}>
      {label ? <AppText variant="label">{label}</AppText> : null}
      <View style={styles.chips}>
        {options.map((o) => {
          const on = selected.includes(o.value);
          return (
            <Pressable
              key={String(o.value)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              accessibilityLabel={o.label}
              onPress={() => onToggle(o.value)}
              style={[styles.chip, { backgroundColor: on ? c.primarySoft : c.surface, borderColor: on ? c.primary : c.borderStrong }]}>
              {on ? <Ionicons name="checkmark" size={16} color={c.primary} /> : null}
              <AppText variant="label" tone={on ? 'primary' : 'default'}>
                {o.label}
              </AppText>
            </Pressable>
          );
        })}
      </View>
      {helper ? (
        <AppText variant="caption" tone="subtle">
          {helper}
        </AppText>
      ) : null}
    </View>
  );
}

export function ToggleRow({ label, description, value, onValueChange, disabled }: { label: string; description?: string; value: boolean; onValueChange: (v: boolean) => void; disabled?: boolean }) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      accessibilityLabel={label}
      accessibilityHint={description}
      disabled={disabled}
      onPress={() => onValueChange(!value)}
      style={styles.toggle}>
      <View style={{ flex: 1 }}>
        <AppText variant="bodyStrong">{label}</AppText>
        {description ? (
          <AppText variant="caption" tone="muted">
            {description}
          </AppText>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ true: c.primary, false: c.borderStrong }}
        thumbColor={Platform.OS === 'android' ? c.surface : undefined}
        importantForAccessibility="no"
      />
    </Pressable>
  );
}

function pad(n: number) {
  return n < 10 ? `0${n}` : String(n);
}

export function DateTimeField({
  label,
  value,
  onChange,
  mode,
  locale,
  maximumDate,
  minimumDate,
  helper,
}: {
  label: string;
  value: Date;
  onChange: (d: Date) => void;
  mode: 'date' | 'time' | 'datetime';
  locale: string;
  maximumDate?: Date;
  minimumDate?: Date;
  helper?: string;
}) {
  const { c } = useTheme();
  const [webText, setWebText] = useState<string | null>(null);
  const display =
    mode === 'date'
      ? value.toLocaleDateString(locale, { dateStyle: 'medium' })
      : mode === 'time'
        ? value.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' })
        : `${value.toLocaleDateString(locale, { dateStyle: 'medium' })} · ${value.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' })}`;

  if (Platform.OS === 'web') {
    const fmt = `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}${mode !== 'date' ? ` ${pad(value.getHours())}:${pad(value.getMinutes())}` : ''}`;
    const shown = mode === 'time' ? `${pad(value.getHours())}:${pad(value.getMinutes())}` : fmt;
    return (
      <TextField
        label={label}
        value={webText ?? shown}
        helper={helper ?? (mode === 'time' ? 'HH:MM' : mode === 'date' ? 'YYYY-MM-DD' : 'YYYY-MM-DD HH:MM')}
        onChangeText={(t) => {
          setWebText(t);
          const m = /^(?:(\d{4})-(\d{2})-(\d{2}))?\s*(?:(\d{2}):(\d{2}))?$/.exec(t.trim());
          if (!m) return;
          const d = new Date(value);
          if (m[1]) d.setFullYear(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
          if (m[4]) d.setHours(Number(m[4]), Number(m[5]), 0, 0);
          if (!Number.isNaN(d.getTime())) onChange(d);
        }}
      />
    );
  }

  const openAndroid = () => {
    const pick = (m: 'date' | 'time', base: Date, then?: (d: Date) => void) =>
      DateTimePickerAndroid.open({
        value: base,
        mode: m,
        is24Hour: !/(AM|PM)/i.test(new Date(2000, 0, 1, 13).toLocaleTimeString(locale)),
        maximumDate: m === 'date' ? maximumDate : undefined,
        minimumDate: m === 'date' ? minimumDate : undefined,
        onChange: (event: DateTimePickerEvent, d?: Date) => {
          if (event.type !== 'set' || !d) return;
          const merged = new Date(base);
          if (m === 'date') merged.setFullYear(d.getFullYear(), d.getMonth(), d.getDate());
          else merged.setHours(d.getHours(), d.getMinutes(), 0, 0);
          if (then) then(merged);
          else onChange(merged);
        },
      });
    if (mode === 'datetime') pick('date', value, (d) => pick('time', d));
    else pick(mode, value);
  };

  if (Platform.OS === 'ios') {
    return (
      <View style={{ gap: SPACE.xs }}>
        <AppText variant="label">{label}</AppText>
        <DateTimePicker value={value} mode={mode} display="compact" locale={locale} maximumDate={maximumDate} minimumDate={minimumDate} onChange={(_, d) => d && onChange(d)} />
      </View>
    );
  }

  return (
    <View style={{ gap: SPACE.xs }}>
      <AppText variant="label">{label}</AppText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${display}`}
        accessibilityHint="Opens a picker"
        onPress={openAndroid}
        style={[styles.inputWrap, { borderColor: c.borderStrong, backgroundColor: c.surface, minHeight: 52 }]}>
        <Ionicons name={mode === 'time' ? 'time-outline' : 'calendar-outline'} size={20} color={c.primary} />
        <AppText variant="body" style={{ marginLeft: SPACE.sm, flex: 1 }}>
          {display}
        </AppText>
        <Ionicons name="chevron-down" size={18} color={c.textSubtle} />
      </Pressable>
      {helper ? (
        <AppText variant="caption" tone="subtle">
          {helper}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  inputWrap: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: RADIUS.md, paddingHorizontal: SPACE.md },
  input: { flex: 1, paddingVertical: SPACE.md, minHeight: 48 },
  segment: { flexDirection: 'row', borderRadius: RADIUS.md, padding: 4, gap: 4 },
  segmentItem: { flex: 1, minHeight: 44, borderRadius: RADIUS.sm, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'transparent', paddingHorizontal: SPACE.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44, paddingHorizontal: SPACE.md, borderRadius: RADIUS.pill, borderWidth: 1 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, minHeight: MIN_TOUCH + 8, paddingVertical: SPACE.xs },
});
