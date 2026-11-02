import React, { useMemo, useState } from 'react';
import { ScrollView, View, Pressable, useWindowDimensions } from 'react-native';
import Svg, { Circle, G, Line, Text as SvgText } from 'react-native-svg';
import type { Note } from './types';
import { graphEdges } from './core';
import { arabicRow, Button, Empty, Label, Palette, Panel } from './ui';

const BASE_W = 680;
const BASE_H = 540;

export function KnowledgeGraph({ notes, p, onOpen }: { notes: Note[]; p: Palette; onOpen: (note: Note) => void }) {
  const [zoom, setZoom] = useState(1);
  const { width: windowWidth } = useWindowDimensions();
  const [viewportWidth, setViewportWidth] = useState(0);
  // Fit to this component's measured viewport, not the screen: the graph can
  // also appear in a narrower pane. Zoom remains relative to this overview.
  const fit = Math.min(405 / BASE_H, (viewportWidth || Math.max(160, windowWidth - 68)) / BASE_W);
  const canvasWidth = BASE_W * fit * zoom;
  const canvasHeight = BASE_H * fit * zoom;
  const shown = notes.slice(0, 24);
  const edges = useMemo(() => graphEdges(shown), [notes]);
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
  }, [notes]);
  if (!notes.length) return <Empty p={p} title="لا توجد ملاحظات" detail="أضف ملاحظات لتظهر هنا" />;
  return <View style={{ gap: 14 }}>
    <Panel p={p} style={{ padding: 13 }}>
      <View style={{ flexDirection: arabicRow, flexWrap: 'wrap', gap: 8, justifyContent: 'space-between', alignItems: 'center' }}>
        <Label p={p} size={14} weight="700">شبكة أفكاري</Label>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <Button p={p} title="−" accessibilityLabel="تصغير الشبكة" tone="secondary" compact disabled={zoom <= 0.7} onPress={() => setZoom(z => Math.max(0.7, +(z - 0.2).toFixed(1)))} />
          <Label p={p} size={13} color={p.muted} style={{ textAlignVertical: 'center' }}>{Math.round(zoom * 100)}%</Label>
          <Button p={p} title="+" accessibilityLabel="تكبير الشبكة" tone="secondary" compact disabled={zoom >= 2} onPress={() => setZoom(z => Math.min(2.0, +(z + 0.2).toFixed(1)))} />
        </View>
      </View>
      {zoom !== 1 && <Button p={p} title="ملاءمة الشبكة" tone="plain" compact onPress={() => setZoom(1)} />}
      <View testID="graph-viewport" onLayout={event => {
        const measured = event.nativeEvent.layout.width;
        if (Number.isFinite(measured) && measured > 0) setViewportWidth(measured);
      }}>
      <ScrollView horizontal nestedScrollEnabled style={{ maxHeight: 405 }} contentContainerStyle={{ minWidth: '100%' }}>
        <ScrollView nestedScrollEnabled style={{ width: canvasWidth, maxHeight: 405 }}>
          <Svg testID="graph-canvas" width={canvasWidth} height={canvasHeight} viewBox={`0 0 ${BASE_W} ${BASE_H}`}>
            {edges.map((e, i) => <Line key={i} x1={positions[e.from]?.x ?? 0} y1={positions[e.from]?.y ?? 0}
              x2={positions[e.to]?.x ?? 0} y2={positions[e.to]?.y ?? 0} stroke={p.muted} strokeOpacity={0.65} strokeWidth={1.6} />)}
            {shown.map((note) => {
              const pos = positions[note.id];
              const title = note.title.length > 11 ? note.title.slice(0, 10) + '…' : note.title;
              return <G key={note.id} onPress={() => onOpen(note)}>
                <Circle cx={pos.x} cy={pos.y} r={29} fill={p.accent} stroke={p.surface} strokeWidth={3} />
                <Circle cx={pos.x - 7} cy={pos.y - 7} r={4} fill={p.accentInk} opacity={0.65} />
                <SvgText x={pos.x} y={pos.y + 48} fill={p.ink} fontSize={14} textAnchor="middle" fontWeight="600">{title}</SvgText>
              </G>;
            })}
          </Svg>
        </ScrollView>
      </ScrollView>
      </View>
      <Label p={p} size={12} color={p.muted}>تبدأ الشبكة بنظرة عامة تلائم العرض. كبّر لقراءة العقد واسحب للتحريك، أو افتح الملاحظات من قائمة العلاقات أدناه.</Label>
      {notes.length > shown.length ? <Label p={p} size={12} color={p.muted}>تُعرض أول 24 ملاحظة في هذه النسخة لتحسين الأداء.</Label> : null}
    </Panel>
    <Label p={p} size={17} weight="700">العلاقات المكتشفة ({edges.length})</Label>
    {edges.length === 0 ? <Empty p={p} title="لا توجد علاقات بعد" detail="اكتب [[عنوان ملاحظة]] داخل ملاحظة أخرى" /> :
      edges.map((edge, i) => {
        const a = notes.find(n => n.id === edge.from);
        const b = notes.find(n => n.id === edge.to);
        return <Pressable key={i} onPress={() => b && onOpen(b)} accessibilityRole="button"
          accessibilityLabel={`فتح ${b?.title} المرتبطة بـ ${a?.title}`}
          style={{ minHeight: 44, padding: 14, borderRadius: 15, backgroundColor: p.surface, borderWidth: 1, borderColor: p.border }}>
          <Label p={p} size={13}>{a?.title} ← {b?.title}</Label>
        </Pressable>;
      })}
  </View>;
}
