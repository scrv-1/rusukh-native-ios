import React from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import { arabicRow, Button, Empty, Icon, Label, Palette, Panel } from './ui';
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
export function StudyHome({ p, workspace, notes, cardsCount, dueCount, todayReviewed,
  linksCount, onCustomize, onTools, onModule, onOpenNote, onNewNote }: Props) {
  const { width, fontScale } = useWindowDimensions();
  const compact = workspace.density === 'compact';
  const stacked = width < 360 || fontScale > 1.3;
  const shown = workspace.modules.filter(item => item.enabled);
  const recent = [...notes].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 2);
  const date = new Date().toLocaleDateString('ar-SA', { weekday: 'long', day: 'numeric', month: 'long' });

  function detail(id: ModuleId) {
    if (id === 'review') return `${dueCount} بطاقة مستحقة الآن`;
    if (id === 'notes') return `${notes.length} ملاحظة محفوظة على جهازك`;
    if (id === 'graph') return `${linksCount} علاقة بين أفكارك`;
    return MODULES.find(module => module.id === id)!.detail;
  }

  return <View style={{ gap: 20 }}>
    <View style={{ gap: 6 }}>
      <Label p={p} size={13} color={p.muted}>{date}</Label>
      <Label p={p} size={32} weight="800" role="header">مساحتي</Label>
      <Label p={p} size={15} color={p.muted}>خطوة صغيرة اليوم. تعلّم يبقى.</Label>
    </View>

    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: stacked ? 'column' : arabicRow, gap: 8 }}>
        <Button title="ملاحظة جديدة" p={p} icon="square.and.pencil" onPress={onNewNote} style={{ flex: 1 }} />
        <Button title="إضافة مصدر" p={p} tone="secondary" icon="doc.text" onPress={() => onModule('sources')} style={{ flex: 1 }} />
      </View>
      <Button title="البحث في ملاحظاتي" p={p} tone="secondary" icon="magnifyingglass" onPress={() => onModule('notes')} />
    </View>

    <View style={{ flexDirection: arabicRow, flexWrap: 'wrap', gap: 8 }}>
      <Button title="تخصيص مساحتي" p={p} tone="plain" icon="slider.horizontal.3" onPress={onCustomize} />
      <Button title="كل الأدوات" p={p} tone="plain" onPress={onTools} />
    </View>

    <View style={{ borderTopWidth: 1, borderBottomWidth: 1, borderColor: p.border, paddingVertical: 12, gap: 4 }}>
      <Label p={p} size={14} weight="600">{todayReviewed > 0 ? `راجعت اليوم ${todayReviewed} بطاقة` : 'ابدأ بما يناسب وقتك'}</Label>
      <Label p={p} size={13} color={p.muted}>{notes.length} ملاحظة · {cardsCount} بطاقة · {todayReviewed} مراجعة اليوم</Label>
    </View>

    {shown.length === 0 && <Panel p={p}>
      <Empty p={p} title="مساحة هادئة على ذوقك" detail="بياناتك محفوظة. أضف أداة أو افتحها من كل الأدوات." />
      <Button p={p} title="إضافة أدوات لمساحتي" onPress={onCustomize} />
    </Panel>}

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

    <View style={{ flexDirection: arabicRow, alignItems: 'center', justifyContent: 'center', gap: 7, paddingBottom: 2 }}>
      <Icon name="internaldrive" p={p} size={14} color={p.muted} />
      <Label p={p} size={12} color={p.muted} style={{ flexShrink: 1 }}>محتواك محفوظ على جهازك. صدّر نسخة احتياطية من الإعدادات.</Label>
    </View>
  </View>;
}
