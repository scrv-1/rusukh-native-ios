import React, { useState } from 'react';
import { Modal, ScrollView, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StudyHome } from '../src/StudyHome';
import { WorkspaceEditor } from '../src/WorkspaceEditor';
import { KnowledgeGraph } from '../src/KnowledgeGraph';
import { arabicRow, Button, Field, Label, Panel, dark, light } from '../src/ui';
import { defaultWorkspace, ModuleId } from '../src/workspace';
import type { Note } from '../src/types';
import { graphEdges } from '../src/core';

const fixtures: Note[] = [
  { id: 'demo-1', title: 'التعلّم النشط', body: 'استرجع الفكرة قبل إعادة قراءتها. ترتبط بـ [[المراجعة المتباعدة]].', createdAt: 1, updatedAt: 3 },
  { id: 'demo-2', title: 'المراجعة المتباعدة', body: 'وزّع جلسات المراجعة على أيام. اربطها بـ [[التعلّم النشط]].', createdAt: 2, updatedAt: 2 },
  { id: 'demo-3', title: 'فكرة طويلة لاختبار التفاف العناوين العربية مع English 123', body: 'بيانات تجريبية فقط. [[التعلّم النشط]]', createdAt: 3, updatedAt: 1 },
];

export default function VisualLab() {
  const [isDark, setIsDark] = useState(false);
  const [frameWidth, setFrameWidth] = useState(390);
  const [route, setRoute] = useState<'home' | 'graph' | 'fields'>('home');
  const [workspace, setWorkspace] = useState(defaultWorkspace);
  const [customizing, setCustomizing] = useState(false);
  const [notes, setNotes] = useState<Note[]>(fixtures);
  const [selected, setSelected] = useState<Note | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftBody, setDraftBody] = useState('');
  const [notice, setNotice] = useState('');
  const [sampleTitle, setSampleTitle] = useState('ملخّص محاضرة');
  const [sampleBody, setSampleBody] = useState('س: كيف تثبت المعلومة؟\nج: بالاسترجاع والمراجعة المتباعدة.');
  const p = isDark ? dark : light;

  function openNote(note: Note) {
    setSelected(note); setDraftTitle(note.title); setDraftBody(note.body);
  }
  function newNote() {
    openNote({ id: `demo-${Date.now()}`, title: '', body: '', createdAt: Date.now(), updatedAt: Date.now() });
  }
  function openModule(id: ModuleId) {
    if (id === 'graph') setRoute('graph');
    else if (id === 'notes' || id === 'sources') setRoute('fields');
    else setNotice('هذه معاينة مكوّنات الواجهة فقط؛ جلسات الدراسة ليست موصولة في المختبر.');
  }

  return <SafeAreaProvider>
    <ScrollView style={{ flex: 1, backgroundColor: '#E4E5E6' }} contentContainerStyle={{ padding: 16, alignItems: 'center', gap: 12 }}>
      <View style={{ width: '100%', maxWidth: 720, gap: 8 }}>
        <Label p={light} size={15} weight="700" role="header" style={{ textAlign: 'center' }}>مختبر بصري — بيانات تجريبية؛ ليس محاكي iOS</Label>
        <View style={{ flexDirection: arabicRow, flexWrap: 'wrap', justifyContent: 'center', gap: 6 }}>
          <Button p={light} title="فاتح" compact tone={isDark ? 'secondary' : 'primary'} onPress={() => setIsDark(false)} />
          <Button p={light} title="داكن" compact tone={isDark ? 'primary' : 'secondary'} onPress={() => setIsDark(true)} />
          <Button p={light} title="عرض 320" compact tone={frameWidth === 320 ? 'primary' : 'secondary'} onPress={() => setFrameWidth(320)} />
          <Button p={light} title="عرض 390" compact tone={frameWidth === 390 ? 'primary' : 'secondary'} onPress={() => setFrameWidth(390)} />
        </View>
        <View style={{ flexDirection: arabicRow, flexWrap: 'wrap', justifyContent: 'center', gap: 6 }}>
          <Button p={light} title="الرئيسية" compact tone={route === 'home' ? 'primary' : 'secondary'} onPress={() => setRoute('home')} />
          <Button p={light} title="الشبكة" compact tone={route === 'graph' ? 'primary' : 'secondary'} onPress={() => setRoute('graph')} />
          <Button p={light} title="الحقول" compact tone={route === 'fields' ? 'primary' : 'secondary'} onPress={() => setRoute('fields')} />
        </View>
      </View>

      <View testID="visual-phone-frame" style={{ width: frameWidth, maxWidth: '100%', height: 760, backgroundColor: p.bg, borderRadius: 24,
        borderWidth: 1, borderColor: '#909399', overflow: 'hidden' }}>
        <View style={{ minHeight: 52, justifyContent: 'center', borderBottomWidth: 1, borderColor: p.border, paddingHorizontal: 20 }}>
          <Label p={p} size={18} weight="800">مساحتي</Label>
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, gap: 16 }}>
          {notice ? <Panel p={p}>
            <Label p={p} size={13}>{notice}</Label>
            <Button p={p} title="إخفاء التنبيه" tone="plain" onPress={() => setNotice('')} />
          </Panel> : null}
          {route === 'home' ? <StudyHome p={p} workspace={workspace} notes={notes} cardsCount={8} dueCount={3} todayReviewed={2}
            linksCount={graphEdges(notes).length} onCustomize={() => setCustomizing(true)}
            onTools={() => setNotice('اختصارات المختبر أعلى الإطار: الرئيسية، الشبكة، الحقول. يمكن تخصيص المساحة من الزر المجاور.')}
            onModule={openModule} onOpenNote={openNote} onNewNote={newNote} />
            : route === 'graph' ? <KnowledgeGraph p={p} notes={notes} onOpen={openNote} />
            : <View style={{ gap: 16 }}>
              <Label p={p} size={25} weight="800" role="header">محرّر الملاحظات</Label>
              <Label p={p} size={13} color={p.muted}>حقول فعلية من التطبيق. التغييرات في هذا المختبر مؤقتة داخل الذاكرة.</Label>
              <Field p={p} label="عنوان تجريبي" value={sampleTitle} onChangeText={setSampleTitle} />
              <Field p={p} label="محتوى تجريبي" multiline value={sampleBody} onChangeText={setSampleBody} />
              <Button p={p} title="حفظ تجريبي في الذاكرة" onPress={() => setNotice('حُفظت القيم في ذاكرة المختبر فقط؛ لا توجد كتابة لقاعدة بيانات رُسوخ.')} />
              <Button p={p} title="زر طويل لاختبار التفاف النص وإمكانية قراءة العربية على الشاشات الصغيرة" tone="secondary" onPress={() => setNotice('استجاب الزر الطويل.')} />
              <Button p={p} title="إجراء غير متاح" disabled onPress={() => {}} />
            </View>}
        </ScrollView>
      </View>
      <Label p={light} size={12} style={{ textAlign: 'center', maxWidth: 720 }}>المعاينة تستخدم مكوّنات React Native نفسها عبر الويب. لا تثبت سلوك لوحة مفاتيح iOS أو VoiceOver أو التخزين أو أداء الجهاز.</Label>
    </ScrollView>

    {customizing && <WorkspaceEditor value={workspace} p={p} onCancel={() => setCustomizing(false)}
      onSave={async next => { setWorkspace(next); setCustomizing(false); return true; }} />}

    <Modal visible={selected !== null} transparent animationType="none" onRequestClose={() => setSelected(null)}>
      <View style={{ flex: 1, backgroundColor: '#00000066', justifyContent: 'center', alignItems: 'center', padding: 16 }}>
        <SafeAreaView style={{ backgroundColor: p.bg, width: frameWidth, maxWidth: '100%', maxHeight: '90%', borderRadius: 20 }}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, gap: 16 }}>
            <Label p={p} size={21} weight="700" role="header">ملاحظة تجريبية</Label>
            <Label p={p} size={12} color={p.muted}>حفظ مؤقت في الذاكرة؛ أعد تحميل المختبر لاستعادة الأمثلة.</Label>
            <Field p={p} label="عنوان الملاحظة التجريبية" value={draftTitle} onChangeText={setDraftTitle} />
            <Field p={p} label="محتوى الملاحظة التجريبية" multiline value={draftBody} onChangeText={setDraftBody} />
            <Button p={p} title="حفظ في ذاكرة المختبر" disabled={!draftTitle.trim()} onPress={() => {
              if (!selected) return;
              const note = { ...selected, title: draftTitle.trim(), body: draftBody, updatedAt: Date.now() };
              setNotes(current => current.some(item => item.id === note.id) ? current.map(item => item.id === note.id ? note : item) : [...current, note]);
              setSelected(null);
            }} />
            <Button p={p} title="إلغاء الملاحظة التجريبية" tone="secondary" onPress={() => setSelected(null)} />
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  </SafeAreaProvider>;
}
