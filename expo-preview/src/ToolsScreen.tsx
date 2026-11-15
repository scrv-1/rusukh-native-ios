import React, { useRef, useState } from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import { arabicRow, Button, Field, Icon, Label, Palette } from './ui';
import { matchesSearch } from './sources';
import { MODULES, ModuleId, toggleModule, Workspace } from './workspace';

type Props = {
  p: Palette;
  workspace: Workspace;
  onSaveWorkspace: (next: Workspace) => Promise<boolean>;
  onOpen: (id: ModuleId) => void;
};

/** Tool availability is independent of whether its section appears on Home. */
export function ToolsScreen({ p, workspace, onSaveWorkspace, onOpen }: Props) {
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState<ModuleId | null>(null);
  const [feedback, setFeedback] = useState<{ text: string; failed: boolean } | null>(null);
  const saveLock = useRef(false);
  const { width, fontScale } = useWindowDimensions();
  const stacked = width < 360 || fontScale > 1.3;
  const filtered = MODULES.filter(module => matchesSearch(module.title, module.detail, search));

  async function changeSection(id: ModuleId) {
    // The synchronous guard also covers repeated taps before React rerenders.
    if (saveLock.current) return;
    saveLock.current = true;
    setSaving(id); setFeedback(null);
    const module = MODULES.find(item => item.id === id)!;
    const wasEnabled = workspace.modules.some(item => item.id === id && item.enabled);
    try {
      const saved = await onSaveWorkspace(toggleModule(workspace, id));
      setFeedback(saved ? {
        text: wasEnabled ? `أُزيل قسم ${module.title} من مساحتك. محتواه محفوظ.` : `أُضيف قسم ${module.title} إلى مساحتك.`,
        failed: false,
      } : { text: 'لم تُحفظ المساحة. بقي ترتيبك كما كان؛ حاول مرة أخرى.', failed: true });
    } catch {
      setFeedback({ text: 'لم تُحفظ المساحة. بقي ترتيبك كما كان؛ حاول مرة أخرى.', failed: true });
    } finally {
      saveLock.current = false;
      setSaving(null);
    }
  }

  return <View style={{ gap: 14 }}>
    <Label p={p} color={p.muted} size={14}>افتح الأداة مباشرة، أو أضف قسمها إلى مساحتك. إزالة القسم لا تحذف محتواه.</Label>
    <Field p={p} label="البحث في الأدوات" value={search} onChangeText={setSearch} placeholder="مثل: PDF، مراجعة، صوت" />
    {(saving || feedback) && <View accessibilityLiveRegion="polite">
      <Label p={p} size={14} color={feedback?.failed ? p.danger : p.muted} role={feedback?.failed ? 'alert' : undefined}>
        {saving ? 'جارٍ حفظ المساحة…' : feedback?.text}
      </Label>
    </View>}
    {filtered.map(module => {
      const enabled = workspace.modules.some(item => item.id === module.id && item.enabled);
      return <View key={module.id} style={{ paddingVertical: 12, gap: 10, borderBottomWidth: 1, borderColor: p.border }}>
        <Pressable accessibilityRole="button" accessibilityLabel={`فتح ${module.title}`} onPress={() => onOpen(module.id)}
          style={({ pressed }) => ({ minHeight: 56, flexDirection: arabicRow, alignItems: 'center', gap: 12, opacity: pressed ? .7 : 1 })}>
          <Icon name={module.symbol} p={p} />
          <View style={{ flex: 1, gap: 3 }}>
            <Label p={p} size={16} weight="700">{module.title}</Label>
            <Label p={p} size={13} color={p.muted}>{module.detail}</Label>
          </View>
          <Icon name="chevron.left" size={14} p={p} color={p.muted} />
        </Pressable>
        <View testID={`tool-actions-${module.id}`} style={{ flexDirection: stacked ? 'column' : arabicRow, alignItems: stacked ? 'stretch' : 'center', flexWrap: 'wrap', gap: 8 }}>
          <Label p={p} size={12} color={p.muted} style={{ flex: stacked ? undefined : 1 }}>
            {enabled ? 'مضافة إلى مساحتك' : 'غير مضافة إلى مساحتك'}
          </Label>
          <Button p={p} compact tone="secondary" title={enabled ? 'إزالة من مساحتي' : 'إضافة إلى مساحتي'}
            accessibilityLabel={enabled ? `إزالة ${module.title} من مساحتي` : `إضافة ${module.title} إلى مساحتي`}
            disabled={saving !== null} onPress={() => { void changeSection(module.id); }} />
        </View>
      </View>;
    })}
    {!filtered.length && <Label p={p} weight="600">لا توجد أداة بهذا الاسم</Label>}
    {search ? <Button p={p} title="مسح بحث الأدوات" tone="secondary" onPress={() => setSearch('')} /> : null}
  </View>;
}
