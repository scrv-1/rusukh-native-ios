import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AppState, View } from 'react-native';
import { type Database, getSetting, setSetting } from '../storage';
import { Button, Field, Label, Panel, type Palette } from '../ui';
import { expoReminderGateway } from './expoGateway';
import { createReminderService, formatReminderTime, parseReminderTime, REMINDER_KEY,
  type ReminderService, type ReminderState } from './service';

export function RemindersPanel({ db, p, service: injected }: { db: Database; p: Palette; service?: ReminderService }) {
  const service = useMemo(() => injected ?? createReminderService(expoReminderGateway, {
    read: () => getSetting(db, REMINDER_KEY), write: value => setSetting(db, REMINDER_KEY, value),
  }), [db, injected]);
  const [state, setState] = useState<ReminderState | null>(null);
  const [time, setTime] = useState('19:00');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(false);
  const operating = useRef(false);

  useEffect(() => {
    mounted.current = true;
    let active = true;
    const refresh = async () => {
      if (operating.current) return;
      try {
        const current = await service.read();
        if (active) { setState(current); setTime(formatReminderTime(current)); setError(null); }
      } catch { if (active) setError('تعذر قراءة حالة التذكير من الجهاز. أعد فحص الحالة.'); }
    };
    void refresh();
    const subscription = AppState.addEventListener('change', next => { if (next === 'active') void refresh(); });
    return () => { active = false; mounted.current = false; subscription.remove(); };
  }, [service]);

  async function run(action: 'enable' | 'disable' | 'refresh') {
    if (operating.current) return;
    const parsed = parseReminderTime(time);
    if (action === 'enable' && !parsed) { setError('أدخل الوقت بصيغة 19:30، بين 00:00 و23:59.'); return; }
    operating.current = true; setBusy(true); setError(null);
    try {
      const current = action === 'enable' ? await service.enable(parsed!) : action === 'disable' ? await service.disable() : await service.read();
      if (mounted.current) { setState(current); setTime(formatReminderTime(current)); }
    } catch (failure) {
      if (mounted.current) setError(failure instanceof Error ? failure.message : 'لم تكتمل العملية. افحص الحالة ثم حاول مجددًا.');
      try { const current = await service.read(); if (mounted.current) setState(current); }
      catch { if (mounted.current) setState(null); }
    } finally {
      operating.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  const status = !state ? (error ? 'حالة التذكير غير معروفة؛ أعد فحصها' : 'جارٍ التحقق من حالة الجهاز…') : state.permission === 'unsupported' ? 'معاينة المتصفح لا تدعم التذكير المحلي'
    : state.enabled ? `موعد يومي محفوظ في النظام: ${formatReminderTime(state)}`
      : state.scheduled ? 'الموعد موجود، لكن إذن الإشعارات غير متاح' : 'التذكير اليومي متوقف';
  return <Panel p={p}>
    <Label p={p} size={17} weight="700" role="header">تذكير المراجعة</Label>
    <Label p={p} size={13} color={p.muted}>{status}</Label>
    <Field p={p} label="وقت التذكير (ساعة:دقيقة)" value={time} onChangeText={setTime} maxLength={5} editable={!busy} placeholder="19:00" />
    <Label p={p} size={12} color={p.muted}>بتوقيت جهازك، بنظام 24 ساعة. التذكير اختياري ومتوقف افتراضيًا.</Label>
    {state?.warning ? <Label p={p} size={13} color={p.muted}>{state.warning}</Label> : null}
    {error ? <Label p={p} role="alert" size={13} color={p.danger}>{error}</Label> : null}
    <View style={{ gap: 8 }}>
      <Button p={p} title={busy ? 'جارٍ تنفيذ الطلب…' : state?.scheduled ? 'تحديث موعد التذكير' : 'تفعيل التذكير اليومي'}
        disabled={busy || !state || state.permission === 'unsupported'} onPress={() => void run('enable')} />
      {state?.scheduled ? <Button p={p} title="إلغاء التذكير اليومي" tone="secondary" disabled={busy} onPress={() => void run('disable')} /> : null}
      <Button p={p} title="فحص حالة التذكير" tone="plain" disabled={busy} onPress={() => void run('refresh')} />
    </View>
    <Label p={p} size={12} color={p.muted}>يجدوله نظام الهاتف محليًا دون حساب أو اتصال. قد يؤخر وضع التركيز أو إعدادات النظام ظهوره. في Expo Go يظهر باسم التطبيق المضيف؛ اختبر وصوله على هاتفك.</Label>
  </Panel>;
}
