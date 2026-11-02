import React, { useState } from 'react';
import { Modal, ScrollView, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Label, Palette, Panel } from './ui';
import { defaultWorkspace, MODULES, moveModule, toggleModule, Workspace } from './workspace';

export function WorkspaceEditor({ value, p, onCancel, onSave }: {
  value: Workspace; p: Palette; onCancel: () => void; onSave: (value: Workspace) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  return <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={() => { if (!saving) onCancel(); }}>
    <SafeAreaView style={{ flex: 1, backgroundColor: p.bg }}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
        <View style={{ flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <Label p={p} size={25} weight="800">خصّص مساحتك</Label>
          <Button p={p} title="إلغاء التخصيص" tone="plain" compact disabled={saving} onPress={onCancel} />
        </View>
        <Label p={p} color={p.muted} size={14}>أظهر ما تحتاجه ورتّبه. إخفاء أداة لا يحذف محتواها؛ ستجدها دائمًا في «كل الأدوات».</Label>
        <Panel p={p}>
          <Label p={p} weight="700">حجم البطاقات في الرئيسية</Label>
          <View style={{ flexDirection: 'row-reverse', gap: 8, flexWrap: 'wrap' }}>
            <Button p={p} title="مريح" tone={draft.density === 'comfortable' ? 'primary' : 'secondary'}
              disabled={saving} onPress={() => setDraft(d => ({ ...d, density: 'comfortable' }))} />
            <Button p={p} title="مختصر" tone={draft.density === 'compact' ? 'primary' : 'secondary'}
              disabled={saving} onPress={() => setDraft(d => ({ ...d, density: 'compact' }))} />
          </View>
        </Panel>
        {draft.modules.map((item, index) => {
          const module = MODULES.find(m => m.id === item.id)!;
          return <Panel key={item.id} p={p} style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Label p={p} weight="700">{module.title}</Label>
                <Label p={p} size={12} color={p.muted}>{item.enabled ? 'ظاهرة في مساحتك' : 'متاحة في كل الأدوات'}</Label>
              </View>
              <Switch value={item.enabled} disabled={saving} accessibilityLabel={`إظهار ${module.title}`}
                onValueChange={() => setDraft(d => toggleModule(d, item.id))}
                trackColor={{ false: p.border, true: p.ink }} thumbColor={p.surface} />
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 8, flexWrap: 'wrap' }}>
              <Button p={p} title={`تقديم ${module.title}`} compact tone="secondary" disabled={saving || index === 0}
                onPress={() => setDraft(d => moveModule(d, item.id, -1))} icon="arrow.up" />
              <Button p={p} title={`تأخير ${module.title}`} compact tone="secondary" disabled={saving || index === draft.modules.length - 1}
                onPress={() => setDraft(d => moveModule(d, item.id, 1))} icon="arrow.down" />
            </View>
          </Panel>;
        })}
        <Label p={p} size={12} color={p.muted}>شريط التنقّل يثبّت أول ثلاث أدوات ظاهرة تدعم صفحة مستقلة. الاختبار يفتح كجلسة منفصلة.</Label>
        <Button p={p} title="استعادة الترتيب الافتراضي" tone="secondary" disabled={saving} onPress={() => setDraft(defaultWorkspace())} />
      </ScrollView>
      <View style={{ padding: 16, borderTopWidth: 1, borderColor: p.border }}>
        <Button p={p} title={saving ? 'جارٍ حفظ المساحة…' : 'حفظ مساحتي'} disabled={saving} onPress={async () => {
          setSaving(true);
          const saved = await onSave(draft);
          if (!saved) setSaving(false);
        }} />
      </View>
    </SafeAreaView>
  </Modal>;
}
