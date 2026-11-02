import React, { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { listRecoveryPoints, type Database, type RecoveryPoint } from '../storage';
import { Button, Label, Panel, type Palette } from '../ui';

function readableDate(value: number): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString('ar') : 'وقت غير معروف';
}

export function RecoveryPointsPanel({ db, p, onRestore, disabled = false }: {
  db: Database; p: Palette; onRestore: (point: RecoveryPoint) => Promise<boolean>; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [points, setPoints] = useState<RecoveryPoint[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const mounted = useRef(false);
  const operation = useRef<'read' | 'restore' | null>(null);
  const generation = useRef(0);

  async function refresh() {
    if (operation.current || disabled) return;
    operation.current = 'read';
    const scope = generation.current;
    setBusy(true); setError(null);
    try {
      const current = await listRecoveryPoints(db);
      if (mounted.current && generation.current === scope) setPoints(current);
    } catch {
      if (mounted.current && generation.current === scope) {
        setPoints([]);
        setError('تعذّر قراءة نقاط الاستعادة. أعد تحديث القائمة؛ لم تُغيّر بيانات الدراسة.');
      }
    } finally {
      if (generation.current === scope) {
        operation.current = null;
        if (mounted.current) setBusy(false);
      }
    }
  }

  useEffect(() => {
    mounted.current = true;
    generation.current += 1;
    operation.current = null;
    setPoints([]); setError(null); setNotice(null); setBusy(false);
    void refresh();
    return () => { mounted.current = false; generation.current += 1; };
  }, [db]);

  async function restore(point: RecoveryPoint) {
    if (operation.current || disabled) return;
    operation.current = 'restore';
    const scope = generation.current;
    setBusy(true); setError(null); setNotice(null);
    let restored = false;
    try {
      // The app owns confirmation and study-state refresh. A cancelled dialog
      // returns false; this panel must not claim it restored anything.
      restored = await onRestore(point);
      if (!mounted.current || generation.current !== scope || !restored) return;
      setNotice('استُعيدت بيانات الدراسة. حُفظت حالتها السابقة في نقطة جديدة.');
      const current = await listRecoveryPoints(db);
      if (mounted.current && generation.current === scope) setPoints(current);
    } catch {
      if (mounted.current && generation.current === scope) {
        if (restored) setPoints([]);
        setError(restored ? 'تمت الاستعادة، لكن تعذّر تحديث القائمة. اضغط تحديث نقاط الاستعادة.'
          : 'تعذّرت الاستعادة. راجع رسالة التطبيق أو حدّث القائمة ثم حاول مجددًا.');
      }
    } finally {
      if (generation.current === scope) {
        operation.current = null;
        if (mounted.current) setBusy(false);
      }
    }
  }

  return <Panel p={p}>
    <Pressable accessibilityRole="button" accessibilityLabel="نقاط الاستعادة"
      accessibilityState={{ expanded: open, disabled: disabled || operation.current === 'restore' }}
      disabled={disabled || operation.current === 'restore'}
      onPress={() => {
        const next = !open;
        setOpen(next);
        if (next) void refresh();
      }}
      style={{ minHeight: 45, justifyContent: 'center', opacity: disabled ? 0.4 : 1 }}>
      <Label p={p} size={17} weight="700">نقاط الاستعادة {open ? '−' : '+'}</Label>
    </Pressable>
    {open ? <View style={{ gap: 12 }}>
      <Label p={p} size={13} color={p.muted}>آخر ثلاث نقاط قبل استبدال بيانات الدراسة. تشمل الملاحظات والبطاقات والمراجعات؛ لا تشمل الصور والصوت أو الإعدادات.</Label>
      <Label p={p} size={12} color={p.muted}>محفوظة داخل التطبيق؛ لا تحمي من حذفه أو فقدان الهاتف. احتفظ أيضًا بنسخة خارجية في «الملفات».</Label>
      {busy && operation.current === 'read' ? <Label p={p} size={13}>جارٍ قراءة نقاط الاستعادة…</Label> : null}
      {!busy && !error && points.length === 0 ? <Label p={p} size={13}>لا توجد نقاط استعادة بعد. تُنشأ تلقائيًا قبل أول استيراد يستبدل البيانات.</Label> : null}
      {notice ? <Label p={p} size={13}>{notice}</Label> : null}
      {error ? <Label p={p} role="alert" size={13} color={p.danger}>{error}</Label> : null}
      {points.map(point => <View key={point.id} style={{ gap: 7, borderTopWidth: 1, borderTopColor: p.border, paddingTop: 12 }}>
        <Label p={p} size={14} weight="600">{point.reason === 'before-recovery' ? 'قبل استعادة سابقة' : 'قبل الاستيراد'} — {readableDate(point.createdAt)}</Label>
        <Label p={p} size={13} color={p.muted}>{point.noteCount} ملاحظة · {point.cardCount} بطاقة · {point.reviewCount} مراجعة</Label>
        <Button p={p} title="استعادة هذه النقطة" accessibilityLabel={`استعادة النقطة ${point.id}`}
          tone="secondary" disabled={busy || disabled} onPress={() => void restore(point)} />
      </View>)}
      <Button p={p} title="تحديث نقاط الاستعادة" tone="plain" disabled={busy || disabled} onPress={() => void refresh()} />
    </View> : null}
  </Panel>;
}
