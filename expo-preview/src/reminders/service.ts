export const REMINDER_KEY = 'studyReminder.v1';
export const REMINDER_OWNER = 'rusukh.study-reminder.v1';
export const REMINDER_ID = 'rusukh.study.daily.v1';

export type ReminderPermission = 'granted' | 'quiet' | 'denied' | 'undetermined' | 'unsupported';
export type Permission = { status: ReminderPermission; canAskAgain: boolean };
export type ReminderTime = { hour: number; minute: number };
export type ReminderPreferences = ReminderTime & { version: 1; enabled: boolean };
export type PendingReminder = { identifier: string; owner?: unknown; kind?: unknown; hour?: unknown; minute?: unknown };
export type ReminderGateway = {
  prepare(): Promise<void>;
  permissions(): Promise<Permission>;
  requestPermissions(): Promise<Permission>;
  list(): Promise<PendingReminder[]>;
  schedule(time: ReminderTime, identifier: string): Promise<string>;
  cancel(identifier: string): Promise<void>;
};
export type ReminderStore = { read(): Promise<string | null>; write(value: string): Promise<void> };
export type ReminderState = ReminderTime & {
  scheduled: number;
  permission: ReminderPermission;
  enabled: boolean;
  warning: string | null;
};

const defaults = (): ReminderPreferences => ({ version: 1, enabled: false, hour: 19, minute: 0 });
const validTime = (hour: unknown, minute: unknown): boolean =>
  typeof hour === 'number' && Number.isInteger(hour) && hour >= 0 && hour < 24 &&
  typeof minute === 'number' && Number.isInteger(minute) && minute >= 0 && minute < 60;

export function parseReminderTime(text: string): ReminderTime | null {
  const ascii = text.trim().replace(/[٠-٩]/g, c => String(c.charCodeAt(0) - 0x660))
    .replace(/[۰-۹]/g, c => String(c.charCodeAt(0) - 0x6f0));
  const parts = /^(\d{1,2}):(\d{2})$/.exec(ascii);
  if (!parts || !validTime(Number(parts[1]), Number(parts[2]))) return null;
  return { hour: Number(parts[1]), minute: Number(parts[2]) };
}

export const formatReminderTime = ({ hour, minute }: ReminderTime): string =>
  `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

export const isStudyReminder = (request: PendingReminder): boolean =>
  request.owner === REMINDER_OWNER && request.kind === 'daily-study';

function preferences(raw: string | null): ReminderPreferences {
  if (!raw) return defaults();
  try {
    const value = JSON.parse(raw);
    if (value && value.version === 1 && typeof value.enabled === 'boolean' && validTime(value.hour, value.minute)) {
      return { version: 1, enabled: value.enabled, hour: value.hour, minute: value.minute };
    }
  } catch { /* A damaged preference cannot enable a notification. */ }
  return defaults();
}

// Serialize all panel instances so a quick enable/disable cannot leave a late reminder behind.
let operationQueue: Promise<unknown> = Promise.resolve();
function serial<T>(job: () => Promise<T>): Promise<T> {
  const result = operationQueue.then(job, job);
  operationQueue = result.catch(() => undefined);
  return result;
}

export function createReminderService(gateway: ReminderGateway, store: ReminderStore) {
  async function inspect(): Promise<ReminderState> {
    const saved = preferences(await store.read());
    const permission = await gateway.permissions();
    if (permission.status === 'unsupported') {
      return { ...saved, scheduled: 0, enabled: false, permission: 'unsupported', warning: 'التذكير المحلي متاح في تطبيق الهاتف، وليس معاينة المتصفح.' };
    }
    const owned = (await gateway.list()).filter(isStudyReminder);
    const actual = owned.find(item => item.identifier === REMINDER_ID) ?? owned[0];
    const time = actual && validTime(actual.hour, actual.minute)
      ? { hour: actual.hour as number, minute: actual.minute as number } : saved;
    const authorized = permission.status === 'granted' || permission.status === 'quiet';
    let warning: string | null = null;
    if (owned.length > 1) warning = 'يوجد أكثر من تذكير لرُسوخ. تحديث الموعد يوحّدها في تذكير واحد.';
    else if (owned.length && !authorized) warning = 'يوجد موعد في النظام، لكن إذن الإشعارات معطل. يمكنك إلغاء الموعد أو السماح بالإشعارات من إعدادات الهاتف.';
    else if (saved.enabled && !owned.length) warning = 'الموعد المحفوظ غير موجود في النظام. فعّل التذكير مجددًا إذا رغبت.';
    else if (owned.length && (!saved.enabled || time.hour !== saved.hour || time.minute !== saved.minute)) warning = 'يوجد موعد في النظام لا يطابق التفضيل المحفوظ. حدّثه أو ألغِه للمزامنة.';
    else if (permission.status === 'quiet' && owned.length) warning = 'الإذن الحالي هادئ أو مؤقت؛ قد يظهر التذكير في مركز الإشعارات فقط.';
    return { hour: time.hour, minute: time.minute, scheduled: owned.length, permission: permission.status,
      enabled: owned.length > 0 && authorized, warning };
  }

  return {
    read: () => serial(inspect),
    enable: (time: ReminderTime) => serial(async () => {
      if (!validTime(time.hour, time.minute)) throw new Error('أدخل وقتًا صحيحًا بين 00:00 و23:59.');
      await gateway.prepare();
      let permission = await gateway.permissions();
      if (permission.status === 'unsupported') throw new Error('افتح رُسوخ على الهاتف لتفعيل التذكير المحلي.');
      if (permission.status !== 'granted' && permission.status !== 'quiet' && permission.canAskAgain) {
        permission = await gateway.requestPermissions();
      }
      if (permission.status !== 'granted' && permission.status !== 'quiet') {
        throw new Error('لم يُسمح بالإشعارات. لم نفعّل تذكيرًا جديدًا. يمكنك السماح بها من إعدادات الهاتف ثم المحاولة مجددًا.');
      }
      const pending = await gateway.list();
      if (pending.some(item => item.identifier === REMINDER_ID && !isStudyReminder(item))) {
        throw new Error('تعارض مع موعد آخر في النظام. لم نغيّر أي تذكير.');
      }
      // A stable native identifier replaces our prior schedule; old schedules are cancelled only after success.
      const identifier = await gateway.schedule(time, REMINDER_ID);
      const scheduled = await gateway.list();
      if (!scheduled.some(item => item.identifier === identifier && isStudyReminder(item))) {
        throw new Error('لم يؤكد النظام حفظ الموعد. أعد فحص الحالة قبل المحاولة مجددًا.');
      }
      for (const item of scheduled.filter(isStudyReminder)) {
        if (item.identifier !== identifier) await gateway.cancel(item.identifier);
      }
      const remaining = (await gateway.list()).filter(isStudyReminder);
      if (remaining.length !== 1 || remaining[0].identifier !== identifier) {
        throw new Error('لم تكتمل مزامنة المواعيد. افحص الحالة ثم أعد تحديث الموعد.');
      }
      try { await store.write(JSON.stringify({ version: 1, enabled: true, ...time })); }
      catch { throw new Error('حفظ النظام موعد التذكير، لكن تعذر حفظ التفضيل محليًا. افحص الحالة أو ألغِ التذكير.'); }
      return inspect();
    }),
    disable: () => serial(async () => {
      const saved = preferences(await store.read());
      for (const item of (await gateway.list()).filter(isStudyReminder)) await gateway.cancel(item.identifier);
      if ((await gateway.list()).some(isStudyReminder)) throw new Error('لم يُلغَ كل موعد لرُسوخ. أعد المحاولة.');
      try { await store.write(JSON.stringify({ ...saved, enabled: false })); }
      catch { throw new Error('أُلغي الموعد في النظام، لكن تعذر حفظ التفضيل محليًا.'); }
      return inspect();
    }),
  };
}

export type ReminderService = ReturnType<typeof createReminderService>;
