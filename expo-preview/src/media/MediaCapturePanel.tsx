import React, { useEffect, useRef, useState } from 'react';
import { Alert, AppState, Image, Linking, Platform, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Sharing from 'expo-sharing';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Button, Field, Label, Panel, arabicRow, type Palette } from '../ui';
import { AudioCaptureSession, type CaptureSnapshot } from './AudioCaptureSession';
import { loadMediaLibrary, loadMediaTrash, mediaUri, saveCapturedMedia, trashMediaItem, restoreMediaItem, permanentlyDeleteMediaItem } from './library';
import { nativeCaptureDependencies } from './nativeRecorder';
import { newMediaId, type CapturedMedia, type MediaItem } from './types';

export type MediaCapturePanelProps = { p: Palette; onCreated?: (item: MediaItem) => void | Promise<void> };
const duration = (ms: number) => `${Math.floor(ms / 60_000)}:${Math.floor(ms / 1000 % 60).toString().padStart(2, '0')}`;

function AudioPreview({ uri, p, label, pauseRef }: { uri: string; p: Palette; label: string; pauseRef: { current: (() => void) | undefined } }) {
  const player = useAudioPlayer(uri, { updateInterval: 500 });
  const status = useAudioPlayerStatus(player);
  const [error, setError] = useState('');
  const playbackRevision = useRef(0);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    pauseRef.current = () => { playbackRevision.current++; player.pause(); };
    return () => { mounted.current = false; playbackRevision.current++; pauseRef.current = undefined; };
  }, [player, pauseRef]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => { if (state !== 'active') { playbackRevision.current++; player.pause(); } });
    return () => subscription.remove();
  }, [player]);
  async function toggle() {
    const request = ++playbackRevision.current;
    try {
      setError('');
      if (status.playing) player.pause();
      else {
        // didJustFinish lasts for one native status event; later updates retain the end position.
        const atEnd = Number.isFinite(status.duration) && status.duration > 0
          && Number.isFinite(status.currentTime) && status.currentTime >= status.duration;
        if (status.didJustFinish || atEnd) await player.seekTo(0);
        if (!mounted.current || request !== playbackRevision.current) return;
        player.play();
      }
    } catch { if (mounted.current && request === playbackRevision.current) setError('تعذّر تشغيل الملف الصوتي.'); }
  }
  return <View style={{ gap: 8 }}>
    <Button p={p} tone="secondary" title={status.playing ? 'إيقاف التشغيل مؤقتًا' : 'تشغيل التسجيل'} accessibilityLabel={`${status.playing ? 'إيقاف التشغيل مؤقتًا' : 'تشغيل التسجيل'} ${label}`} disabled={!status.isLoaded} onPress={() => { void toggle(); }} />
    <Label p={p} size={12} color={p.muted}>{duration((status.currentTime || 0) * 1000)} / {duration((status.duration || 0) * 1000)}</Label>
    {error || status.error ? <Label p={p} color={p.danger} role="alert">{error || 'تعذّر تحميل الملف الصوتي.'}</Label> : null}
  </View>;
}

function MediaThumbnail({ item, p }: { item: MediaItem; p: Palette }) {
  const [failed, setFailed] = useState(false);
  let uri: string;
  try { uri = mediaUri(item); } catch { return <Label p={p} color={p.danger}>ملف الصورة غير موجود. حدّث المكتبة.</Label>; }
  return failed ? <Label p={p} color={p.danger}>تعذّر عرض الصورة. يمكن تجربة فتحها من زر المشاركة.</Label>
    : <Image source={{ uri }} resizeMode="contain" accessibilityLabel={item.title} accessible onError={() => setFailed(true)} style={{ width: '100%', height: 170, borderRadius: 12, backgroundColor: p.subtle }} />;
}

/** Native capture with its own durable library; media binaries are exported individually. */
export function MediaCapturePanel({ p, onCreated }: MediaCapturePanelProps) {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [notice, setNotice] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoDenied, setPhotoDenied] = useState(false);
  const [pendingPhoto, setPendingPhoto] = useState<CapturedMedia>();
  const [playing, setPlaying] = useState<{ id: string; uri: string }>();
  const [libraryLoading, setLibraryLoading] = useState(true);
  const [visibleCount, setVisibleCount] = useState(10);
  const [trash, setTrash] = useState<MediaItem[]>([]);
  const [showTrash, setShowTrash] = useState(false);
  const [mediaBusy, setMediaBusy] = useState(false);
  const mutationLock = useRef(false);
  const pausePlayback = useRef<(() => void) | undefined>(undefined);
  const alive = useRef(true);
  const photoLock = useRef(false);
  const titleRef = useRef(title);
  const onCreatedRef = useRef(onCreated);
  titleRef.current = title;
  onCreatedRef.current = onCreated;
  const [session] = useState(() => new AudioCaptureSession({
    ...nativeCaptureDependencies,
    save: input => saveCapturedMedia({ ...input, title: titleRef.current || undefined }),
  }));
  const [capture, setCapture] = useState<CaptureSnapshot>(session.snapshot);
  const captureBusy = ['preparing', 'recording', 'saving'].includes(capture.state);
  const disabled = photoBusy || captureBusy || libraryLoading || mediaBusy;
  async function refresh(recover = false) {
    try {
      const [result, removed] = await Promise.all([loadMediaLibrary(recover), loadMediaTrash()]);
      if (alive.current) { setItems(result.items); setTrash(removed.items); setWarnings([...result.warnings, ...removed.warnings]); }
    } catch {
      if (alive.current) setWarnings(['تعذّر فتح مكتبة الوسائط. لم تُحذف الملفات؛ أعد المحاولة.']);
    } finally { if (alive.current) setLibraryLoading(false); }
  }
  async function created(item: MediaItem) {
    if (!alive.current) return;
    setItems(current => [item, ...current.filter(existing => existing.id !== item.id)]);
    setTitle('');
    try { await onCreatedRef.current?.(item); }
    catch { if (alive.current) setNotice('حُفظ الملف في مكتبة الوسائط، لكن لم يكتمل ربطه بالملاحظة.'); }
  }
  useEffect(() => {
    alive.current = true;
    if (Platform.OS === 'web') { setLibraryLoading(false); return () => { alive.current = false; }; }
    void refresh(true);
    let announced = '';
    const unsubscribe = session.subscribe(next => {
      setCapture(next);
      if (next.state === 'saved' && next.item && next.item.id !== announced) { announced = next.item.id; void created(next.item); }
    });
    const subscription = AppState.addEventListener('change', state => { void session.setActive(state === 'active'); });
    const timer = setInterval(() => { void session.poll(); }, 750);
    return () => {
      alive.current = false; unsubscribe(); subscription.remove(); clearInterval(timer);
      void session.dispose();
    };
  }, [session]);

  async function savePhoto(input: CapturedMedia) {
    const item = await saveCapturedMedia(input);
    if (alive.current) { setPendingPhoto(undefined); setNotice('حُفظت الصورة على جهازك.'); await created(item); }
  }
  async function pickPhoto(source: 'camera' | 'library') {
    if (photoLock.current || disabled) return;
    photoLock.current = true; setPhotoBusy(true); setNotice(''); setPhotoDenied(false); setPlaying(undefined);
    try {
      if (source === 'camera') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) { if (alive.current) { setPhotoDenied(true); setNotice('الكاميرا غير مسموحة. يمكنك اختيار صورة من مكتبتك أو تعديل الإذن في الإعدادات.'); } return; }
      }
      const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: false, quality: 0.85, exif: false, allowsMultipleSelection: false };
      const result = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
      if (result.canceled || !alive.current) { if (alive.current) setNotice('أُلغي اختيار الصورة.'); return; }
      const asset = result.assets[0];
      if (!asset?.uri) throw new Error('لم تُرجع الكاميرا ملف صورة.');
      const input: CapturedMedia = { id: newMediaId(), kind: 'image', uri: asset.uri, mimeType: asset.mimeType ?? 'image/jpeg', title: titleRef.current || asset.fileName || undefined };
      setPendingPhoto(input);
      await savePhoto(input);
    } catch (error) { if (alive.current) setNotice(error instanceof Error ? error.message : 'تعذّر حفظ الصورة.'); }
    finally { photoLock.current = false; if (alive.current) setPhotoBusy(false); }
  }
  async function retryPhoto() {
    if (!pendingPhoto || photoLock.current) return;
    photoLock.current = true; setPhotoBusy(true);
    try { await savePhoto(pendingPhoto); }
    catch (error) { if (alive.current) setNotice(error instanceof Error ? error.message : 'تعذّر حفظ الصورة.'); }
    finally { photoLock.current = false; if (alive.current) setPhotoBusy(false); }
  }
  async function share(item: MediaItem) {
    try {
      if (!await Sharing.isAvailableAsync()) throw new Error('المشاركة غير متاحة على هذا الجهاز.');
      await Sharing.shareAsync(mediaUri(item), { mimeType: item.mimeType, UTI: item.kind === 'audio' ? 'public.mpeg-4-audio' : 'public.image', dialogTitle: item.title });
      if (alive.current) setNotice('أُغلقت نافذة المشاركة. اختر «حفظ في الملفات» داخلها لتصدير نسخة.');
    } catch (error) { if (alive.current) setNotice(error instanceof Error ? error.message : 'تعذّرت مشاركة الملف.'); }
  }
  async function changeMedia(item: MediaItem, action: 'trash' | 'restore' | 'delete') {
    if (mutationLock.current || photoLock.current || ['preparing', 'recording', 'saving'].includes(session.snapshot.state)) return;
    mutationLock.current = true; setMediaBusy(true); setNotice('');
    try {
      pausePlayback.current?.(); setPlaying(undefined);
      const result = action === 'trash' ? await trashMediaItem(item) : action === 'restore' ? await restoreMediaItem(item) : await permanentlyDeleteMediaItem(item);
      if (alive.current) setNotice((action === 'trash' ? 'نُقل الوسيط إلى المحذوفات. يمكنك استعادته.' : action === 'restore' ? 'استُعيد الوسيط إلى المكتبة.' : 'حُذف ملف الوسيط نهائيًا من التطبيق.') + (result?.warning ? ` ${result.warning}` : ''));
    } catch (failure) { if (alive.current) setNotice(failure instanceof Error ? failure.message : 'لم تكتمل العملية. حدّث القوائم ثم حاول مجددًا.'); }
    finally {
      await refresh(false);
      mutationLock.current = false;
      if (alive.current) setMediaBusy(false);
    }
  }
  function confirmRemoval(item: MediaItem, permanent = false) {
    Alert.alert(permanent ? `حذف «${item.title}» نهائيًا؟` : `نقل «${item.title}» إلى المحذوفات؟`,
      `${item.fileName}\n${permanent ? 'لا يمكن التراجع بعد حذف الملف. لن تُحذف النسخ التي صدّرتها خارج التطبيق.' : 'يمكنك استعادته لاحقًا. سيبقى محفوظًا ويشغل مساحة حتى تختار الحذف النهائي. لن تتغير النسخ المصدّرة.'}`,
      [{ text: 'إلغاء', style: 'cancel' }, { text: permanent ? 'حذف نهائي' : 'نقل إلى المحذوفات', style: 'destructive', onPress: () => { void changeMedia(item, permanent ? 'delete' : 'trash'); } }]);
  }
  const statusText = capture.state === 'recording' ? `جارٍ التسجيل · ${duration(capture.durationMs)}`
    : capture.state === 'preparing' ? 'جارٍ تجهيز الميكروفون…'
    : capture.state === 'saving' ? 'جارٍ حفظ التسجيل…'
    : capture.state === 'saved' ? (capture.reason === 'manual' ? 'حُفظ التسجيل على جهازك.' : 'توقف التسجيل وحُفظ الملف المتاح. راجعه للتأكد من اكتماله.')
    : capture.state === 'denied' ? 'الميكروفون غير مسموح. فعّله من إعدادات الجهاز لبدء التسجيل.'
    : capture.state === 'error' ? capture.error : '';
  if (Platform.OS === 'web') return <Panel p={p}><Label p={p} weight="700">الكاميرا والتسجيل</Label><Label p={p} color={p.muted}>افتح رُسوخ في Expo Go على هاتفك لاستخدام الكاميرا والتسجيل وحفظ الوسائط محليًا.</Label></Panel>;
  return <Panel p={p}>
    <Label p={p} size={19} weight="700" role="header">الكاميرا والتسجيل</Label>
    <Label p={p} size={13} color={p.muted}>صور وتسجيلات محلية. لا تُرفع إلى خادم، ولا يُستخرج منها نص تلقائيًا في هذه النسخة.</Label>
    <Field p={p} label="عنوان الوسيط — اختياري" value={title} onChangeText={setTitle} maxLength={160} editable={!disabled} placeholder="مثل: محاضرة الأحياء" />
    <View style={{ flexDirection: arabicRow, flexWrap: 'wrap', gap: 8 }}>
      <Button p={p} title="التقاط صورة" tone="secondary" disabled={disabled || !!pendingPhoto} onPress={() => { void pickPhoto('camera'); }} />
      <Button p={p} title="اختيار صورة" tone="secondary" disabled={disabled || !!pendingPhoto} onPress={() => { void pickPhoto('library'); }} />
      {capture.state === 'recording' ? <Button p={p} title="إيقاف وحفظ التسجيل" onPress={() => { void session.stop(); }} />
        : <Button p={p} title="بدء التسجيل" disabled={disabled || capture.canRetry || !!pendingPhoto} onPress={() => { setPlaying(undefined); setNotice(''); void session.start(); }} />}
    </View>
    <Label p={p} size={12} color={p.muted}>يتوقف التسجيل عند مغادرة التطبيق أو هذه الشاشة. الحد: ٣٠ دقيقة. قد توقف المكالمات أو فصل السماعة التسجيل.</Label>
    {statusText ? <Label p={p} color={capture.state === 'error' || capture.state === 'denied' ? p.danger : p.ink} role="alert">{statusText}</Label> : null}
    {notice ? <Label p={p} size={13} role="alert">{notice}</Label> : null}
    {photoDenied || capture.state === 'denied' ? <Button p={p} tone="plain" title="فتح إعدادات الجهاز" onPress={() => { void Linking.openSettings().catch(() => setNotice('تعذّر فتح الإعدادات. افتحها يدويًا من جهازك.')); }} /> : null}
    {capture.canRetry ? <Button p={p} title="إعادة محاولة حفظ التسجيل" disabled={captureBusy} onPress={() => { void session.retrySave(); }} /> : null}
    {pendingPhoto ? <Button p={p} title="إعادة محاولة حفظ الصورة" disabled={photoBusy} onPress={() => { void retryPhoto(); }} /> : null}
    <View style={{ flexDirection: arabicRow, justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
      <Label p={p} weight="700">مكتبة الوسائط · {items.length}</Label>
      <Button p={p} tone="plain" compact title="تحديث المكتبة" disabled={disabled} onPress={() => { void refresh(true); }} />
    </View>
    {warnings.map(warning => <Label key={warning} p={p} size={13} color={p.danger} role="alert">{warning}</Label>)}
    {libraryLoading ? <Label p={p} color={p.muted}>جارٍ فتح الملفات المحفوظة…</Label> : items.length === 0 ? <Label p={p} color={p.muted}>لم تضف وسائط بعد.</Label> : null}
    {items.slice(0, visibleCount).map(item => <View key={item.id} style={{ borderTopWidth: 1, borderColor: p.border, paddingTop: 12, gap: 8 }}>
      <Label p={p} weight="600">{item.title}</Label>
      <Label p={p} size={12} color={p.muted}>{item.kind === 'audio' ? 'تسجيل صوتي' : 'صورة'} · {new Date(item.createdAt).toLocaleDateString('ar')} · {(item.sizeBytes / 1024 / 1024).toFixed(2)} MB{item.durationMs === undefined ? '' : ` · ${duration(item.durationMs)}`}</Label>
      {item.kind === 'image' ? <MediaThumbnail item={item} p={p} /> : null}
      {playing?.id === item.id ? <AudioPreview key={item.id} uri={playing.uri} p={p} label={`${item.title}، ${item.fileName}`} pauseRef={pausePlayback} /> : null}
      <View style={{ flexDirection: arabicRow, flexWrap: 'wrap', gap: 8 }}>
        {item.kind === 'audio' ? <Button p={p} tone="secondary" compact title={playing?.id === item.id ? 'إغلاق المشغّل' : 'استماع'} accessibilityLabel={`${playing?.id === item.id ? 'إغلاق مشغّل' : 'استماع إلى'} ${item.title}، ${item.fileName}`} disabled={disabled} onPress={() => { try { setPlaying(playing?.id === item.id ? undefined : { id: item.id, uri: mediaUri(item) }); } catch { setNotice('الملف غير موجود. حدّث المكتبة.'); } }} /> : null}
        <Button p={p} tone="secondary" compact title="مشاركة / حفظ في الملفات" disabled={disabled} accessibilityLabel={`مشاركة ${item.title} أو حفظه في الملفات`} onPress={() => { void share(item); }} />
        <Button p={p} tone="danger" compact title="نقل إلى المحذوفات" disabled={disabled} accessibilityLabel={`نقل ${item.title}، ${item.fileName} إلى المحذوفات`} onPress={() => confirmRemoval(item)} />
      </View>
    </View>)}
    {items.length > visibleCount ? <Button p={p} tone="plain" title="عرض المزيد من الوسائط" onPress={() => setVisibleCount(value => value + 10)} /> : null}
    {trash.length > 0 && <Button p={p} tone="plain" title={`${showTrash ? 'إخفاء' : 'عرض'} المحذوفات (${trash.length})`} onPress={() => setShowTrash(value => !value)} />}
    {showTrash && trash.length > 0 && <View style={{ gap: 12 }}>
      <Label p={p} color={p.muted} size={13}>المحذوفات لا تُزال تلقائيًا، ولا تدخل النسخ الاحتياطية الجديدة. استعد الوسيط أو احذفه نهائيًا لتحرير مساحته.</Label>
      {trash.map(item => <View key={item.id} style={{ gap: 8 }}>
        <Label p={p} weight="600">{item.title}</Label><Label p={p} size={12} color={p.muted}>{item.fileName}</Label>
        <View style={{ flexDirection: arabicRow, flexWrap: 'wrap', gap: 8 }}>
          <Button p={p} title="استعادة" tone="secondary" disabled={disabled} accessibilityLabel={`استعادة ${item.title}، ${item.fileName}`} onPress={() => { void changeMedia(item, 'restore'); }} />
          <Button p={p} title="حذف نهائي" tone="danger" disabled={disabled} accessibilityLabel={`حذف ${item.title}، ${item.fileName} نهائيًا`} onPress={() => confirmRemoval(item, true)} />
        </View>
      </View>)}
    </View>}
    <Label p={p} size={12} color={p.muted}>الوسائط محفوظة داخل بيانات التطبيق، وتُصدّر منفردة من زر المشاركة. النسخة الاحتياطية النصية لا تتضمن ملفات الصور والصوت. حذف التطبيق قد يحذف هذه الملفات؛ صدّر المهم منها إلى «الملفات».</Label>
  </Panel>;
}
