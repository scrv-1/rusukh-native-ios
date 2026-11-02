import React from 'react';
import { I18nManager, Pressable, Text, TextInput, View, ViewStyle, TextStyle, AccessibilityRole } from 'react-native';
import { SymbolView } from 'expo-symbols';

// Yoga mirrors row direction when the host is already RTL; avoid reversing twice.
export const arabicRow = I18nManager.isRTL ? 'row' : 'row-reverse';

export type Palette = {
  bg: string; surface: string; ink: string; muted: string; border: string;
  accent: string; accentInk: string; subtle: string; danger: string;
};
export const light: Palette = {
  bg: '#F5F5F3', surface: '#FFFFFF', ink: '#111214', muted: '#61646B',
  border: '#E5E6E7', accent: '#131416', accentInk: '#FFFFFF', subtle: '#ECEDEB', danger: '#B32929',
};
export const dark: Palette = {
  bg: '#0A0A0B', surface: '#181819', ink: '#F6F6F4', muted: '#9A9A9E',
  border: '#303032', accent: '#F4F4F0', accentInk: '#101011', subtle: '#252527', danger: '#FF8989',
};

export function Label({ children, p, size = 15, weight = '400', color, style, numberOfLines, role }: {
  children: React.ReactNode; p: Palette; size?: number; weight?: '400' | '500' | '600' | '700' | '800';
  color?: string; style?: TextStyle; numberOfLines?: number; role?: AccessibilityRole;
}) {
  return <Text allowFontScaling accessibilityRole={role} numberOfLines={numberOfLines} style={[{
    textAlign: 'right', writingDirection: 'rtl', fontSize: size, lineHeight: Math.round(size * 1.5),
    fontWeight: weight, color: color ?? p.ink,
  }, style]}>{children}</Text>;
}

export function Icon({ name, p, size = 21, color }: {
  name: string; p: Palette; size?: number; color?: string;
}) {
  return <SymbolView name={name as any} size={size} tintColor={color ?? p.ink} fallback={<Text style={{ color: p.ink }}>•</Text>} />;
}

export function Button({ title, p, onPress, tone = 'primary', icon, disabled, compact = false, style, accessibilityLabel, selected }: {
  title: string; p: Palette; onPress: () => void; tone?: 'primary' | 'secondary' | 'danger' | 'plain';
  icon?: string; disabled?: boolean; compact?: boolean; style?: ViewStyle; accessibilityLabel?: string; selected?: boolean;
}) {
  const bg = tone === 'primary' ? p.accent : tone === 'secondary' ? p.subtle : 'transparent';
  const fg = tone === 'primary' ? p.accentInk : tone === 'danger' ? p.danger : p.ink;
  return <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? title} accessibilityState={{ disabled: !!disabled, selected }}
    style={({ pressed }) => [
      { minHeight: 45, minWidth: 44, maxWidth: '100%', flexShrink: 1,
        paddingHorizontal: compact ? 13 : 17, paddingVertical: 10, borderRadius: 15,
        backgroundColor: bg, justifyContent: 'center', alignItems: 'center', opacity: disabled ? 0.4 : pressed ? 0.74 : 1,
        flexDirection: arabicRow, gap: 7 }, style,
    ]}>
    {icon ? <Icon name={icon} p={p} size={17} color={fg} /> : null}
    <Label p={p} size={14} weight="700" color={fg} style={{ flexShrink: 1, textAlign: 'center' }}>{title}</Label>
  </Pressable>;
}

export function Panel({ children, p, style }: { children: React.ReactNode; p: Palette; style?: ViewStyle }) {
  return <View style={[{ backgroundColor: p.surface, borderRadius: 22, borderColor: p.border,
    borderWidth: 1, padding: 18, gap: 12 }, style]}>{children}</View>;
}

export function Field({ label, value, onChangeText, p, placeholder, multiline = false, numberOfLines, maxLength, editable = true }: {
  label?: string; value: string; onChangeText: (v: string) => void; p: Palette; placeholder?: string;
  multiline?: boolean; numberOfLines?: number; maxLength?: number; editable?: boolean;
}) {
  return <View style={{ gap: 8 }}>
    {label ? <Label p={p} size={13} weight="600">{label}</Label> : null}
    <TextInput accessibilityLabel={label ?? placeholder} value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={p.muted}
      multiline={multiline} numberOfLines={numberOfLines} maxLength={maxLength} editable={editable}
      textAlign="right" textAlignVertical={multiline ? 'top' : 'center'}
      style={{ borderRadius: 15, minHeight: multiline ? 145 : 49, padding: 14,
        color: p.ink, backgroundColor: p.subtle, fontSize: 16, lineHeight: 23, writingDirection: 'rtl' }} />
  </View>;
}

export function Empty({ p, title, detail }: { p: Palette; title: string; detail?: string }) {
  return <View style={{ minHeight: 160, alignItems: 'center', justifyContent: 'center', gap: 7 }}>
    <Label p={p} weight="700" size={16}>{title}</Label>
    {detail ? <Label p={p} size={13} color={p.muted}>{detail}</Label> : null}
  </View>;
}
