import React, { useEffect, useRef, useState } from 'react';
import { Alert, AppState, View } from 'react-native';
import { Directory } from 'expo-file-system';
import type { Backup } from '../types';
import { Button, Label, Panel, type Palette } from '../ui';
import {
  exportPortableFolder, inspectPortableFolder, mergePortableMedia,
  type PortableOperation, type PortablePreferences, type PortablePreview, type PortableSnapshot,
} from './portable';

export function PortableBackupPanel({ p, getSnapshot, restoreStudy, applyPreferences, disabled = false }: {
  p: Palette;
  getSnapshot: () => Promise<PortableSnapshot>;
  restoreStudy: (study: Backup) => Promise<boolean>;
  applyPreferences?: (preferences: PortablePreferences) => Promise<void>;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [preview, setPreview] = useState<PortablePreview | null>(null);
  const [committing, setCommitting] = useState(false);
  const running = useRef(false);
  const mounted = useRef(true);
  const cancelled = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; cancelled.current = true; };
  }, []);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'background') cancelled.current = true;
    });
    return () => subscription.remove();
  }, []);
  const update = (text: string) => { if (mounted.current) setStatus(text); };
  async function run(work: (operation: PortableOperation) => Promise<void>) {
    if (!mounted.current || running.current || disabled) return;
    running.current = true; cancelled.current = false; setBusy(true); setCommitting(false);
    try { await work({ onProgress: update, isCancelled: () => cancelled.current }); }
    catch (error) { update(`لم تكتمل العملية: ${error instanceof Error ? error.message : String(error)}`); }
    finally {
      running.current = false;
      if (mounted.current) { setBusy(false); setCommitting(false); }
    }
  }
  function exportFolder() {
    void run(async operation => {
      update('اختر مكان حفظ مجلد النسخة في «الملفات»…');
      const parent = await Directory.pickDirectoryAsync();
      const snapshot = await getSnapshot();
      update('إنشاء نسخة النص والوسائط وفحصها…');
      const result = await exportPortableFolder(parent, snapshot, operation);
      update(`اكتملت النسخة في ${result.directory.name}: ${result.mediaCount} ملف وسائط مع الملاحظات والبطاقات والمراجعات والمظهر. احتفظ بالمجلد كاملًا.`);
    });
  }
  function selectFolder() {
    setPreview(null);
    void run(async operation => {
      update('اختر مجلد rusukh-backup كاملًا…');
      const folder = await Directory.pickDirectoryAsync();
      const result = await inspectPortableFolder(folder, operation);
      if (mounted.current) setPreview(result);
      update('فُحصت الملفات؛ لم تتغير بياناتك. راجع التفاصيل قبل الاستعادة.');
    });
  }
  function confirmImport() {
    if (!preview || busy || disabled) return;
    const selected = preview;
    Alert.alert('استبدال النص وإضافة الوسائط؟',
      `ستستبدل بيانات الدراسة بـ ${selected.study.notes.length} ملاحظة و${selected.study.cards.length} بطاقة. تُحفظ نقطة رجوع للنص قبل الاستبدال. تُضاف ${selected.manifest.media.length} وسائط دون حذف وسائطك الحالية.`, [
        { text: 'إلغاء', style: 'cancel' },
        { text: 'استعادة النسخة', style: 'destructive', onPress: () => void run(async operation => {
          let merged;
          try { merged = await mergePortableMedia(selected, operation); }
          catch (error) {
            throw new Error(`${error instanceof Error ? error.message : String(error)} قد تكون أضيفت وسائط قبل التوقف؛ بيانات الدراسة لم تُستبدل. يمكن إعادة المحاولة.`);
          }
          if (cancelled.current) throw new Error('أوقفت العملية. قد تكون أضيفت وسائط؛ بيانات الدراسة لم تُستبدل.');
          if (mounted.current) setCommitting(true);
          update('حفظ نقطة الرجوع واستعادة بيانات الدراسة…');
          if (!await restoreStudy(merged.study)) throw new Error('لم تكتمل استعادة النص. الوسائط المضافة محفوظة، ولم تُحذف وسائطك السابقة.');
          update(`اكتملت الاستعادة: أضيف ${merged.added} ملف، وتُرك ${merged.reused} ملف مطابق دون تغيير. المظهر والتذكيرات الحالية لم تتغير.`);
        }) },
      ]);
  }
  function restorePreferences() {
    if (!preview || !applyPreferences) return;
    const selected = preview;
    void run(async operation => {
      const checked = await inspectPortableFolder(selected.directory, operation);
      if (checked.manifestSHA256 !== selected.manifestSHA256) throw new Error('تغيّرت النسخة بعد المعاينة. اخترها مرة أخرى.');
      await applyPreferences(checked.preferences);
      update('طُبق المظهر وترتيب الأدوات. التذكيرات وبيانات الدراسة لم تتغير.');
    });
  }
  return <Panel p={p}>
    <Label p={p} weight="700" size={17}>نسخة مع الصور والصوت</Label>
    <Label p={p} size={13} color={p.muted}>مجلد في «الملفات» يجمع النص والوسائط والمظهر. اختر المجلد من جديد عند الاستعادة؛ لا يشمل نموذج الذكاء أو المسودة أو التذكيرات أو التسجيل الجاري.</Label>
    <Button p={p} title="حفظ نسخة مع الوسائط في الملفات" onPress={exportFolder} disabled={busy || disabled} />
    <Button p={p} title="اختيار مجلد نسخة للمعاينة" tone="secondary" onPress={selectFolder} disabled={busy || disabled} />
    {status ? <View accessibilityLiveRegion="polite"><Label p={p} size={13}>{status}</Label></View> : null}
    {busy && !committing && <Button p={p} title="إيقاف النسخ أو الفحص" tone="plain" onPress={() => { cancelled.current = true; update('سيتم التوقف بعد عملية الملف الحالية…'); }} />}
    {preview && <View style={{ gap: 9 }}>
      <Label p={p} size={13}>{preview.study.notes.length} ملاحظة · {preview.study.cards.length} بطاقة · {preview.manifest.media.length} ملف وسائط</Label>
      <Label p={p} size={12} color={p.muted}>الاستعادة تدمج الوسائط أولًا ثم تستبدل النص مع نقطة رجوع. إذا انقطعت، قد تبقى وسائط مضافة؛ أعد المحاولة دون حذف النسخة.</Label>
      <Button p={p} title="استعادة النص وإضافة الوسائط" tone="danger" onPress={confirmImport} disabled={busy || disabled} />
      {applyPreferences && <Button p={p} title="تطبيق المظهر وترتيب الأدوات فقط" tone="secondary" onPress={restorePreferences} disabled={busy || disabled} />}
    </View>}
    <Label p={p} size={12} color={p.muted}>الحد: 512 ميغابايت و1000 ملف وسائط. اترك التطبيق مفتوحًا. إذا فشل التصدير فالمجلد الجزئي ليس نسخة مكتملة؛ لا تحذف الأصل.</Label>
  </Panel>;
}
