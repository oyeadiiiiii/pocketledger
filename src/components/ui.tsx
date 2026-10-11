import React, { ReactNode, useEffect, useRef } from 'react';
import {
  Animated, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
  type StyleProp, type TextInputProps, type ViewStyle,
} from 'react-native';
import { type Edge, SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeProvider';
import { radius } from '../theme/theme';

export type IconName = React.ComponentProps<typeof Ionicons>['name'];

export function asIcon(name: string | null | undefined, fallback: IconName = 'pricetag'): IconName {
  return name && Object.prototype.hasOwnProperty.call(Ionicons.glyphMap, name) ? (name as IconName) : fallback;
}

export const errorMessage = (e: unknown): string => (e instanceof Error ? e.message : String(e));

// ---------------- Screen ----------------
export function Screen({
  title, subtitle, right, children, scroll = true, edges = ['top'], contentStyle,
}: {
  title?: string;
  subtitle?: string;
  right?: ReactNode;
  children?: ReactNode;
  scroll?: boolean;
  edges?: Edge[];
  contentStyle?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const header = title ? (
    <View style={s.header}>
      <View style={{ flex: 1 }}>
        <Text style={[s.title, { color: t.text }]} accessibilityRole="header">{title}</Text>
        {subtitle ? <Text style={[s.subtitle, { color: t.textMuted }]}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  ) : null;

  return (
    <SafeAreaView edges={edges} style={{ flex: 1, backgroundColor: t.bg }}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={[s.scroll, contentStyle]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          automaticallyAdjustKeyboardInsets
        >
          {header}
          {children}
        </ScrollView>
      ) : (
        <View style={{ flex: 1 }}>
          {header ? <View style={s.headerPad}>{header}</View> : null}
          {children}
        </View>
      )}
    </SafeAreaView>
  );
}

// ---------------- Card ----------------
export function Card({
  children, style, onPress, accessibilityLabel,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  const t = useTheme();
  const base: StyleProp<ViewStyle> = [s.card, { backgroundColor: t.card, borderColor: t.border, shadowColor: t.shadow }, style];
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={({ pressed }) => [base, pressed ? { opacity: 0.85, transform: [{ scale: 0.99 }] } : null]}
      >
        {children}
      </Pressable>
    );
  }
  return <View style={base}>{children}</View>;
}

export function SectionLabel({ children, right }: { children: ReactNode; right?: ReactNode }) {
  const t = useTheme();
  return (
    <View style={s.sectionRow}>
      <Text style={[s.section, { color: t.textMuted }]} accessibilityRole="header">{children}</Text>
      {right}
    </View>
  );
}

export function ErrorText({ children }: { children?: string }) {
  const t = useTheme();
  if (!children) return null;
  return <Text style={[s.error, { color: t.expense }]} accessibilityLiveRegion="polite">{children}</Text>;
}

// ---------------- Buttons ----------------
type Tone = 'primary' | 'success' | 'danger' | 'ghost';

export function PrimaryButton({
  label, onPress, icon, tone = 'primary', disabled, style, accessibilityHint,
}: {
  label: string;
  onPress: () => void;
  icon?: IconName;
  tone?: Tone;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
}) {
  const t = useTheme();
  const bg = tone === 'primary' ? t.primary : tone === 'success' ? t.income : tone === 'danger' ? t.expense : 'transparent';
  const fg = tone === 'primary' ? t.onPrimary : tone === 'ghost' ? t.text : '#FFFFFF';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [
        s.button,
        { backgroundColor: bg, borderColor: tone === 'ghost' ? t.border : bg, opacity: disabled ? 0.45 : pressed ? 0.85 : 1 },
        style,
      ]}
    >
      {icon ? <Ionicons name={icon} size={20} color={fg} /> : null}
      <Text style={[s.buttonText, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

export function IconButton({ icon, onPress, label, size = 22 }: { icon: IconName; onPress: () => void; label: string; size?: number }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      style={({ pressed }) => [s.iconButton, { backgroundColor: t.cardAlt, opacity: pressed ? 0.7 : 1 }]}
    >
      <Ionicons name={icon} size={size} color={t.text} />
    </Pressable>
  );
}

export function Fab({ onPress, label = 'Add transaction' }: { onPress: () => void; label?: string }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [s.fab, { backgroundColor: t.accent, shadowColor: t.shadow, transform: [{ scale: pressed ? 0.94 : 1 }] }]}
    >
      <Ionicons name="add" size={34} color="#FFFFFF" />
    </Pressable>
  );
}

// ---------------- Chips & segmented ----------------
export function Chip({
  label, selected, onPress, icon, color,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: IconName;
  color?: string;
}) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!selected }}
      style={({ pressed }) => [
        s.chip,
        { backgroundColor: selected ? t.primary : t.card, borderColor: selected ? t.primary : t.border, opacity: pressed ? 0.8 : 1 },
      ]}
    >
      {icon ? <Ionicons name={icon} size={16} color={selected ? t.onPrimary : color ?? t.textMuted} /> : null}
      <Text style={[s.chipText, { color: selected ? t.onPrimary : t.text }]}>{label}</Text>
    </Pressable>
  );
}

export function Segmented<T extends string>({
  value, options, onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  const t = useTheme();
  return (
    <View style={[s.segment, { backgroundColor: t.cardAlt }]} accessibilityRole="tablist">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            style={[s.segmentItem, on ? { backgroundColor: t.card, shadowColor: t.shadow } : null]}
          >
            <Text style={[s.segmentText, { color: on ? t.text : t.textMuted }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ---------------- Inputs ----------------
export function Field({ label, error, style, ...props }: TextInputProps & { label: string; error?: string }) {
  const t = useTheme();
  return (
    <View>
      <Text style={[s.fieldLabel, { color: t.textMuted }]}>{label}</Text>
      <TextInput
        placeholderTextColor={t.textMuted}
        accessibilityLabel={label}
        {...props}
        style={[
          s.input,
          { backgroundColor: t.card, color: t.text, borderColor: error ? t.expense : t.border },
          props.multiline ? { minHeight: 88, textAlignVertical: 'top', paddingTop: 14 } : null,
          style,
        ]}
      />
      <ErrorText>{error}</ErrorText>
    </View>
  );
}

// ---------------- Misc ----------------
export function Badge({ label, tone = 'neutral' }: { label: string; tone?: 'income' | 'expense' | 'warning' | 'accent' | 'neutral' }) {
  const t = useTheme();
  const map = {
    income: [t.incomeSoft, t.income],
    expense: [t.expenseSoft, t.expense],
    warning: [t.warningSoft, t.warning],
    accent: [t.accentSoft, t.accent],
    neutral: [t.cardAlt, t.textMuted],
  } as const;
  const [bg, fg] = map[tone];
  return (
    <View style={[s.badge, { backgroundColor: bg }]}>
      <Text style={[s.badgeText, { color: fg }]}>{label}</Text>
    </View>
  );
}

export function IconCircle({ name, color, size = 42 }: { name: IconName; color: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color + '22', alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name={name} size={size * 0.5} color={color} />
    </View>
  );
}

export function EmptyState({ icon, title, message }: { icon: IconName; title: string; message?: string }) {
  const t = useTheme();
  return (
    <View style={s.empty}>
      <Ionicons name={icon} size={36} color={t.textMuted} />
      <Text style={[s.emptyTitle, { color: t.text }]}>{title}</Text>
      {message ? <Text style={[s.emptyMsg, { color: t.textMuted }]}>{message}</Text> : null}
    </View>
  );
}

export function FadeIn({ children, delay = 0, style }: { children: ReactNode; delay?: number; style?: StyleProp<ViewStyle> }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(a, { toValue: 1, duration: 380, delay, useNativeDriver: true }).start();
  }, [a, delay]);
  return (
    <Animated.View style={[style, { opacity: a, transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }]}>
      {children}
    </Animated.View>
  );
}

const s = StyleSheet.create({
  scroll: { padding: 16, paddingBottom: 48, gap: 14 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  headerPad: { paddingHorizontal: 16, paddingTop: 16 },
  title: { fontSize: 32, fontWeight: '800', letterSpacing: -0.5 },
  subtitle: { fontSize: 15, marginTop: 2 },
  card: {
    borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, padding: 16,
    shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
  },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  section: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
  error: { fontSize: 14, marginTop: 6, fontWeight: '600' },
  button: {
    minHeight: 54, borderRadius: radius.md, borderWidth: 1, paddingHorizontal: 18,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  buttonText: { fontSize: 17, fontWeight: '700' },
  iconButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  fab: {
    position: 'absolute', right: 20, bottom: 24, width: 64, height: 64, borderRadius: 32,
    alignItems: 'center', justifyContent: 'center',
    shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 6 },
  },
  chip: {
    minHeight: 44, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1,
    flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  chipText: { fontSize: 15, fontWeight: '600' },
  segment: { flexDirection: 'row', borderRadius: radius.md, padding: 4 },
  segmentItem: {
    flex: 1, minHeight: 44, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center',
    shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 1 },
  },
  segmentText: { fontSize: 15, fontWeight: '700' },
  fieldLabel: { fontSize: 14, fontWeight: '600', marginBottom: 6 },
  input: { minHeight: 52, borderRadius: radius.md, borderWidth: 1, paddingHorizontal: 14, fontSize: 17 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, alignSelf: 'flex-start' },
  badgeText: { fontSize: 12, fontWeight: '700' },
  empty: { alignItems: 'center', paddingVertical: 24, gap: 6 },
  emptyTitle: { fontSize: 17, fontWeight: '700' },
  emptyMsg: { fontSize: 14, textAlign: 'center' },
});