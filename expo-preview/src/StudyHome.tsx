import React from 'react';
import { Pressable, View } from 'react-native';
import { arabicRow, Button, Icon, Label, Palette, Panel } from './ui';
import { MODULES, ModuleId, Workspace } from './workspace';
import type { Note } from './types';

type Props = {
  p: Palette;
  workspace: Workspace;
  notes: Note[];
  cardsCount: number;
  dueCount: number;
  todayReviewed: number;
  linksCount: number;
  onCustomize: () => void;
  onTools: () => void;
  onModule: (id: ModuleId) => void;
  onOpenNote: (note: Note) => void;
  onNewNote: () => void;
};

/** Presentation only: visibility and ordering never change the study data. */
export function StudyHome({ p, workspace, notes, cardsCount, dueCount,
  linksCount, onCustomize, onTools, onModule, onOpenNote, onNewNote }: Props) {
  const compact = workspace.density === 'compact';
  const shown = workspace.modules.filter(item => item.enabled);

  const capture = <View testID="home-capture-actions" style={{ flexDirection: arabicRow, flexWrap: 'wrap', gap: 8 }}>
    <Button p={p} title="إضافة مادة" tone="secondary" compact onPress={() => onModule('sources')} />
    <Button p={p} title="ملاحظة جديدة" tone="secondary" compact onPress={onNewNote} />
    <Button p={p} title="إضافة أداة" tone="plain" compact onPress={onTools} />
  </View>;
  // The canvas stays empty until its owner adds a section. Capture remains usable.
  if (shown.length === 0) return capture;

  const recent = [...notes].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 2);

  function detail(id: ModuleId) {
    if (id === 'review') return `${dueCount} بطاقة مستحقة الآن`;
    if (id === 'notes') return `${notes.length} ملاحظة محفوظة على جهازك`;
    if (id === 'graph') return `${linksCount} علاقة بين أفكارك`;
    return MODULES.find(module => module.id === id)!.detail;
  }

  return <View style={{ gap: 20 }}>
    {capture}
    <View style={{ flexDirection: arabicRow, flexWrap: 'wrap', gap: 8 }}>
      <Button title="تخصيص مساحتي" p={p} tone="plain" compact icon="slider.horizontal.3" onPress={onCustomize} />
    </View>

    {shown.map(item => {
      const module = MODULES.find(value => value.id === item.id)!;
      return <Panel key={item.id} p={p} style={{ padding: compact ? 16 : 20, gap: compact ? 12 : 16 }}>
        <View style={{ flexDirection: arabicRow, alignItems: 'center', gap: 12 }}>
          <View style={{ width: 42, height: 42, borderRadius: 13, backgroundColor: p.subtle, justifyContent: 'center', alignItems: 'center' }}>
            <Icon name={module.symbol} p={p} size={21} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Label p={p} size={18} weight="700" role="header">{module.title}</Label>
            <Label p={p} color={p.muted} size={13}>{detail(item.id)}</Label>
          </View>
        </View>

        {!compact && item.id === 'review' && <Label p={p} size={14} color={p.muted}>
          {dueCount > 0 ? 'حاول تذكّر الإجابة قبل كشفها. يمكنك التوقف متى شئت.' : cardsCount > 0 ? 'لا توجد مراجعة مستحقة الآن. ستبقى بطاقاتك هنا عندما يحين موعدها.' : 'أضف أول بطاقة من ملاحظاتك، ثم ارجع لتراجعها هنا.'}
        </Label>}

        {!compact && item.id === 'notes' && recent.map(note => <Pressable key={note.id}
          accessibilityRole="button" accessibilityLabel={`فتح ${note.title}`} onPress={() => onOpenNote(note)}
          style={({ pressed }) => ({ minHeight: 48, paddingVertical: 10, borderTopWidth: 1, borderColor: p.border,
            flexDirection: arabicRow, alignItems: 'center', gap: 12, opacity: pressed ? 0.7 : 1 })}>
          <View style={{ flex: 1 }}><Label p={p} size={15} weight="600" numberOfLines={2}>{note.title}</Label></View>
          <Icon name="chevron.left" p={p} size={14} color={p.muted} />
        </Pressable>)}

        {item.id === 'notes' && notes.length === 0 && <Label p={p} size={14} color={p.muted}>
          ابدأ بفكرة قصيرة أو أضف مصدرًا. يمكنك إنشاء بطاقات من داخل الملاحظة.
        </Label>}

        <Button p={p} title={item.id === 'review' ? (dueCount > 0 ? 'ابدأ المراجعة' : cardsCount > 0 ? 'عرض بطاقاتي' : 'أضف بطاقات من ملاحظاتك') : item.id === 'notes' && notes.length === 0 ? 'إضافة أول ملاحظة' : item.id === 'quiz' ? 'ابدأ الاختبار' : `فتح ${module.title}`}
          tone={item.id === 'review' && dueCount > 0 ? 'primary' : 'secondary'} onPress={() => item.id === 'notes' && notes.length === 0 ? onNewNote() : onModule(item.id === 'review' && cardsCount === 0 ? 'notes' : item.id)} />
      </Panel>;
    })}

  </View>;
}
