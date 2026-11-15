import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, View, Pressable, useWindowDimensions } from 'react-native';
import Svg, { Circle, G, Line, Text as SvgText } from 'react-native-svg';
import type { Note } from './types';
import { graphEdges } from './core';
import { matchesSearch } from './sources';
import { arabicRow, Button, Empty, Field, Label, Palette, Panel } from './ui';

const BASE_W = 680;
const BASE_H = 540;
const PAGE_SIZE = 24;

export type GraphSession = {
  query: string; page: number; relationPage: number; zoom: number; showList: boolean;
  pan: { x: number; y: number }; selectedNoteId: string | null;
};
export const createGraphSession = (): GraphSession => ({
  query: '', page: 0, relationPage: 0, zoom: 1, showList: false, pan: { x: 0, y: 0 }, selectedNoteId: null,
});
type SessionProps = { session: GraphSession; onSessionChange: React.Dispatch<React.SetStateAction<GraphSession>> }
  | { session?: undefined; onSessionChange?: undefined };

export function KnowledgeGraph({ notes, p, onOpen, session, onSessionChange }: {
  notes: Note[]; p: Palette; onOpen: (note: Note) => void;
} & SessionProps) {
  const [localSession, setLocalSession] = useState(createGraphSession);
  const state = session ?? localSession;
  const updateSession = onSessionChange ?? setLocalSession;
  const { zoom, query, page, relationPage, showList, pan, selectedNoteId } = state;
  const { width: windowWidth } = useWindowDimensions();
  const [viewportWidth, setViewportWidth] = useState(0);
  // Fit to this component's measured viewport, not the screen: the graph can
  // also appear in a narrower pane. Zoom remains relative to this overview.
  const fit = Math.min(405 / BASE_H, (viewportWidth || Math.max(160, windowWidth - 68)) / BASE_W);
  const canvasWidth = BASE_W * fit * zoom;
  const canvasHeight = BASE_H * fit * zoom;
  // Page the rendering, not the data: a link to a note on another page must
  // remain discoverable. Search uses the same Arabic normalization as notes.
  const filtered = useMemo(() => notes.filter(n => matchesSearch(n.title, '', query)), [notes, query]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const shown = useMemo(() => filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE), [filtered, currentPage]);
  const shownIds = useMemo(() => new Set(shown.map(n => n.id)), [shown]);
  const notesById = useMemo(() => new Map(notes.map(n => [n.id, n])), [notes]);
  const allEdges = useMemo(() => graphEdges(notes), [notes]);
  const edges = useMemo(() => allEdges.filter(e => shownIds.has(e.from) && shownIds.has(e.to)), [allEdges, shownIds]);
  const pageRelations = useMemo(() => allEdges.filter(e => shownIds.has(e.from) || shownIds.has(e.to)), [allEdges, shownIds]);
  const relationPageCount = Math.max(1, Math.ceil(pageRelations.length / PAGE_SIZE));
  const currentRelationPage = Math.min(relationPage, relationPageCount - 1);
  const shownRelations = pageRelations.slice(currentRelationPage * PAGE_SIZE, (currentRelationPage + 1) * PAGE_SIZE);
  // Clamp both states after deletion/import so adding notes later cannot
  // unexpectedly jump back to an obsolete page number.
  useEffect(() => {
    updateSession(current => {
      const nextPage = Math.min(current.page, pageCount - 1);
      const nextRelationPage = Math.min(current.relationPage, relationPageCount - 1);
      const selected = current.selectedNoteId && notesById.has(current.selectedNoteId) ? current.selectedNoteId : null;
      if (current.page === nextPage && current.relationPage === nextRelationPage && current.selectedNoteId === selected) return current;
      return { ...current, page: nextPage, relationPage: nextRelationPage, selectedNoteId: selected };
    });
  }, [pageCount, relationPageCount, notesById, updateSession]);
  const positions = useMemo(() => {
    const center = { x: BASE_W / 2, y: BASE_H / 2 };
    const count = shown.length;
    return Object.fromEntries(shown.map((n, index) => {
      const ring = count <= 1 ? 0 : count <= 8 ? 150 : index < 8 ? 140 : 225;
      const inRing = count <= 8 ? count : index < 8 ? Math.min(8, count) : Math.max(1, count - 8);
      const ringIndex = count <= 8 ? index : index < 8 ? index : index - 8;
      const theta = (Math.PI * 2 * ringIndex) / Math.max(inRing, 1) - Math.PI / 2;
      return [n.id, { x: center.x + ring * Math.cos(theta), y: center.y + ring * Math.sin(theta) }];
    })) as Record<string, { x: number; y: number }>;
  }, [shown]);
  function changeQuery(value: string) { updateSession(current => ({ ...current, query: value, page: 0, relationPage: 0, pan: { x: 0, y: 0 } })); }
  function changePage(value: number) { updateSession(current => ({ ...current, page: value, relationPage: 0, pan: { x: 0, y: 0 } })); }
  function openNote(note: Note) {
    updateSession(current => ({ ...current, selectedNoteId: note.id }));
    onOpen(note);
  }
  function rememberPan(axis: 'x' | 'y', value: number) {
    if (!Number.isFinite(value)) return;
    // Ignore negative bounce distance; persist view coordinates only, never study data.
    const offset = Math.max(0, value);
    updateSession(current => current.pan[axis] === offset ? current : { ...current, pan: { ...current.pan, [axis]: offset } });
  }
  if (!notes.length) return <Empty p={p} title="لا توجد ملاحظات" detail="أضف ملاحظات لتظهر هنا" />;
  return <View style={{ gap: 14 }}>
    <Panel p={p} style={{ padding: 13 }}>
      <Field p={p} label="ابحث في جميع عناوين الملاحظات" placeholder="عنوان الملاحظة…" value={query} onChangeText={changeQuery} maxLength={160} />
      {query.length > 0 && <Button p={p} title="مسح بحث الشبكة" tone="plain" compact onPress={() => changeQuery('')} />}
      {filtered.length > 0 ? <Label p={p} size={12} color={p.muted}>
        {`الملاحظات ${currentPage * PAGE_SIZE + 1}–${currentPage * PAGE_SIZE + shown.length} من ${filtered.length}`}
      </Label> : null}
      {pageCount > 1 && <View style={{ flexDirection: arabicRow, flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <Button p={p} title="السابق" accessibilityLabel="صفحة الملاحظات السابقة" tone="secondary" compact disabled={currentPage === 0} onPress={() => changePage(currentPage - 1)} />
        <Label p={p} size={13}>{`صفحة ${currentPage + 1} من ${pageCount}`}</Label>
        <Button p={p} title="التالي" accessibilityLabel="صفحة الملاحظات التالية" tone="secondary" compact disabled={currentPage === pageCount - 1} onPress={() => changePage(currentPage + 1)} />
      </View>}
      {filtered.length === 0 ? <Empty p={p} title="لا توجد نتائج" detail="جرّب جزءًا من عنوان الملاحظة أو امسح البحث." /> : <>
      <View style={{ flexDirection: arabicRow, flexWrap: 'wrap', gap: 8, justifyContent: 'space-between', alignItems: 'center' }}>
        <Label p={p} size={14} weight="700">شبكة أفكاري</Label>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <Button p={p} title="−" accessibilityLabel="تصغير الشبكة" tone="secondary" compact disabled={zoom <= 0.7} onPress={() => updateSession(current => ({ ...current, zoom: Math.max(0.7, +(current.zoom - 0.2).toFixed(1)) }))} />
          <Label p={p} size={13} color={p.muted} style={{ textAlignVertical: 'center' }}>{Math.round(zoom * 100)}%</Label>
          <Button p={p} title="+" accessibilityLabel="تكبير الشبكة" tone="secondary" compact disabled={zoom >= 2} onPress={() => updateSession(current => ({ ...current, zoom: Math.min(2.0, +(current.zoom + 0.2).toFixed(1)) }))} />
        </View>
      </View>
      {zoom !== 1 && <Button p={p} title="ملاءمة الشبكة" tone="plain" compact onPress={() => updateSession(current => ({ ...current, zoom: 1, pan: { x: 0, y: 0 } }))} />}
      <View testID="graph-viewport" onLayout={event => {
        const measured = event.nativeEvent.layout.width;
        if (Number.isFinite(measured) && measured > 0) setViewportWidth(measured);
      }}>
      <ScrollView testID="graph-pan-horizontal" horizontal nestedScrollEnabled style={{ maxHeight: 405 }} contentContainerStyle={{ minWidth: '100%' }}
        contentOffset={{ x: pan.x, y: 0 }} scrollEventThrottle={100}
        onScroll={event => rememberPan('x', event.nativeEvent.contentOffset.x)}
        onScrollEndDrag={event => rememberPan('x', event.nativeEvent.contentOffset.x)}
        onMomentumScrollEnd={event => rememberPan('x', event.nativeEvent.contentOffset.x)}>
        <ScrollView testID="graph-pan-vertical" nestedScrollEnabled style={{ width: canvasWidth, maxHeight: 405 }}
          contentOffset={{ x: 0, y: pan.y }} scrollEventThrottle={100}
          onScroll={event => rememberPan('y', event.nativeEvent.contentOffset.y)}
          onScrollEndDrag={event => rememberPan('y', event.nativeEvent.contentOffset.y)}
          onMomentumScrollEnd={event => rememberPan('y', event.nativeEvent.contentOffset.y)}>
          <Svg testID="graph-canvas" accessibilityElementsHidden={showList} importantForAccessibility={showList ? 'no-hide-descendants' : 'auto'} width={canvasWidth} height={canvasHeight} viewBox={`0 0 ${BASE_W} ${BASE_H}`}>
            {edges.map(e => <Line key={JSON.stringify([e.from, e.to])} x1={positions[e.from]?.x ?? 0} y1={positions[e.from]?.y ?? 0}
              x2={positions[e.to]?.x ?? 0} y2={positions[e.to]?.y ?? 0} stroke={p.muted} strokeOpacity={0.65} strokeWidth={1.6} />)}
            {shown.map((note) => {
              const pos = positions[note.id];
              const title = note.title.length > 11 ? note.title.slice(0, 10) + '…' : note.title;
              return <G key={note.id} testID={`graph-node-${note.id}`} accessible accessibilityRole="button" accessibilityLabel={`فتح ${note.title} من الرسم`}
                accessibilityState={{ selected: selectedNoteId === note.id }} onPress={() => openNote(note)}>
                <Circle cx={pos.x} cy={pos.y} r={29} fill={p.accent} stroke={selectedNoteId === note.id ? p.ink : p.surface} strokeWidth={selectedNoteId === note.id ? 6 : 3} />
                <Circle cx={pos.x - 7} cy={pos.y - 7} r={4} fill={p.accentInk} opacity={0.65} />
                <SvgText x={pos.x} y={pos.y + 48} fill={p.ink} fontSize={14} textAnchor="middle" fontWeight="600">{title}</SvgText>
              </G>;
            })}
          </Svg>
        </ScrollView>
      </ScrollView>
      </View>
      <Label p={p} size={12} color={p.muted}>كبّر لقراءة العقد واسحب للتحريك. تُرسم حتى 24 ملاحظة في الصفحة؛ البحث والصفحات يتيحان الوصول إلى المكتبة كاملة.</Label>
      <Button p={p} title={showList ? 'إخفاء قائمة الملاحظات' : 'عرض الملاحظات كقائمة'} tone="plain" onPress={() => updateSession(current => ({ ...current, showList: !current.showList }))} />
      {showList && shown.map(note => <Button key={note.id} p={p} title={note.title} accessibilityLabel={`فتح ${note.title} من قائمة الشبكة`} tone={selectedNoteId === note.id ? 'primary' : 'secondary'} selected={selectedNoteId === note.id} onPress={() => openNote(note)} />)}
      </>}
    </Panel>
    {filtered.length > 0 && <>
    <Label p={p} size={17} weight="700">{`علاقات هذه الصفحة: ${pageRelations.length} من إجمالي ${allEdges.length} علاقة`}</Label>
    {pageRelations.length > edges.length && <Label p={p} size={12} color={p.muted}>تشمل القائمة روابط بملاحظات خارج الرسم. اضغط العلاقة لفتح الملاحظة غير المعروضة.</Label>}
    {relationPageCount > 1 && <View style={{ flexDirection: arabicRow, flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
      <Button p={p} title="العلاقات السابقة" accessibilityLabel="صفحة العلاقات السابقة" tone="secondary" compact disabled={currentRelationPage === 0} onPress={() => updateSession(current => ({ ...current, relationPage: currentRelationPage - 1 }))} />
      <Label p={p} size={13}>{`صفحة العلاقات ${currentRelationPage + 1} من ${relationPageCount}`}</Label>
      <Button p={p} title="العلاقات التالية" accessibilityLabel="صفحة العلاقات التالية" tone="secondary" compact disabled={currentRelationPage === relationPageCount - 1} onPress={() => updateSession(current => ({ ...current, relationPage: currentRelationPage + 1 }))} />
    </View>}
    {pageRelations.length === 0 ? <Empty p={p} title="لا توجد علاقات لهذه الملاحظات" detail="اكتب [[عنوان ملاحظة]] داخل ملاحظة أخرى" /> :
      shownRelations.map(edge => {
        const a = notesById.get(edge.from)!;
        const b = notesById.get(edge.to)!;
        // On an incoming link, open the offscreen source rather than reopening
        // the already-visible target. Both directions retain their full titles.
        const target = shownIds.has(edge.to) && !shownIds.has(edge.from) ? a : b;
        const context = target === a ? b : a;
        return <Pressable key={JSON.stringify([edge.from, edge.to])} testID={`graph-relation-${edge.from}-${edge.to}`} onPress={() => openNote(target)} accessibilityRole="button"
          accessibilityState={{ selected: selectedNoteId === target.id }}
          accessibilityLabel={`فتح ${target.title} المرتبطة بـ ${context.title}`}
          style={{ minHeight: 44, padding: 14, borderRadius: 15, backgroundColor: p.surface, borderWidth: selectedNoteId === target.id ? 2 : 1, borderColor: selectedNoteId === target.id ? p.ink : p.border }}>
          <Label p={p} size={13}>{a?.title} ← {b?.title}</Label>
        </Pressable>;
      })}
    </>}
  </View>;
}
