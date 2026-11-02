import React, { useState } from 'react';
import { Modal, ScrollView, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { arabicRow, Button, Label, Palette, Panel } from './ui';
import { defaultWorkspace, MODULES, moveModule, toggleModule, Workspace, workspacePreset } from './workspace';

export function WorkspaceEditor({ value, p, onCancel, onSave, reducedMotion = true }: {
  value: Workspace; p: Palette; reducedMotion?: boolean; onCancel: () => void; onSave: (value: Workspace) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  return <Modal visible animationType={reducedMotion ? "none" : "slide"} presentationStyle="pageSheet" onRequestClose={() => { if (!saving) onCancel(); }}>
    <SafeAreaView style={{ flex: 1, backgroundColor: p.bg }}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
        <View style={{ flexDirection: arabicRow, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <Label p={p} size={25} weight="800">خصّص مساحتك</Label>
          <Button p={p} title="إلغاء التخصيص" tone="plain" compact disabled={saving} onPress={onCancel} />
        </View>
        <Label p={p} color={p.muted} size={14}>أظهر ما تحتاجه ورتّبه. إخفاء أداة لا يحذف محتواها؛ ستجدها دائمًا في «كل الأدوات».</Label>
        <Panel p={p}>
          <Label p={p} weight="700" role="header">ابدأ بترتيب جاهز</Label>
          <Label p={p} color={p.muted} size={13}>اختر ثم عدّل ما يناسبك. يُطبّق عند حفظ مساحتك.</Label>
          <View style={{ flexDirection: arabicRow, gap: 8, flexWrap: 'wrap' }}>
            {([['simple','بسيط'],['reading','قراءة وربط'],['all','كل الأقسام']] as const).map(([id,title]) =>
              <Button key={id} p={p} title={title} tone="secondary" disabled={saving} onPress={() => setDraft(workspacePreset(id))} />)}
          </View>
        </Panel>
        <Panel p={p}>
          <Label p={p} weight="700">حجم البطاقات في الرئيسية</Label>
          <View style={{ flexDirection: arabicRow, gap: 8, flexWrap: 'wrap' }}>
            <Button p={p} title="مريح" tone={draft.density === 'comfortable' ? 'primary' : 'secondary'}
              selected={draft.density === 'comfortable'} disabled={saving} onPress={() => setDraft(d => ({ ...d, density: 'comfortable' }))} />
            <Button p={p} title="مختصر" tone={draft.density === 'compact' ? 'primary' : 'secondary'}
              selected={draft.density === 'compact'} disabled={saving} onPress={() => setDraft(d => ({ ...d, density: 'compact' }))} />
          </View>
        </Panel>
        <Label p={p} size={14} weight="700" role="header">{draft.modules.filter(m => m.enabled).length} من {draft.modules.length} أقسام ظاهرة</Label>
        <View style={{ flexDirection: arabicRow, gap: 8, flexWrap: 'wrap' }}>
          <Button p={p} title="إظهار كل الأقسام" tone="plain" disabled={saving} onPress={() => setDraft(d => ({ ...d, modules: d.modules.map(m => ({ ...m, enabled: true })) }))} />
          <Button p={p} title="إخفاء كل الأقسام" tone="plain" disabled={saving} onPress={() => setDraft(d => ({ ...d, modules: d.modules.map(m => ({ ...m, enabled: false })) }))} />
        </View>
        {draft.modules.map((item, index) => {
          const module = MODULES.find(m => m.id === item.id)!;
          return <Panel key={item.id} p={p} style={{ gap: 10 }}>
            <View style={{ flexDirection: arabicRow, alignItems: 'center', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Label p={p} weight="700">{module.title}</Label>
                <Label p={p} size={12} color={p.muted}>{index + 1} · {item.enabled ? 'ظاهرة في مساحتك' : 'متاحة في كل الأدوات'}</Label>
              </View>
              <Switch value={item.enabled} disabled={saving} accessibilityLabel={`إظهار ${module.title}`}
                onValueChange={() => setDraft(d => toggleModule(d, item.id))}
                trackColor={{ false: p.border, true: p.ink }} thumbColor={p.surface} />
            </View>
            <View style={{ flexDirection: arabicRow, gap: 8, flexWrap: 'wrap' }}>
              <Button p={p} title={`تقديم ${module.title}`} compact tone="secondary" disabled={saving || index === 0}
                onPress={() => setDraft(d => moveModule(d, item.id, -1))} icon="arrow.up" />
              <Button p={p} title={`تأخير ${module.title}`} compact tone="secondary" disabled={saving || index === draft.modules.length - 1}
                onPress={() => setDraft(d => moveModule(d, item.id, 1))} icon="arrow.down" />
            </View>
          </Panel>;
        })}
        <Label p={p} size={12} color={p.muted}>شريط التنقّل ثابت. الترتيب والإخفاء يغيّران أقسام الرئيسية فقط، ويمكن فتح كل أداة من «الأدوات».</Label>
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
