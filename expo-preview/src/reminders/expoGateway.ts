import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { REMINDER_OWNER, type Permission, type ReminderGateway } from './service';

const CHANNEL = 'rusukh-local-study';

export function normalizeReminderPermission(value: Notifications.NotificationPermissionsStatus): Permission {
  if (Platform.OS === 'ios' && value.ios) {
    switch (value.ios.status) {
      case Notifications.IosAuthorizationStatus.AUTHORIZED: return { status: 'granted', canAskAgain: value.canAskAgain };
      case Notifications.IosAuthorizationStatus.PROVISIONAL:
      case Notifications.IosAuthorizationStatus.EPHEMERAL: return { status: 'quiet', canAskAgain: value.canAskAgain };
      case Notifications.IosAuthorizationStatus.DENIED: return { status: 'denied', canAskAgain: value.canAskAgain };
      default: return { status: 'undetermined', canAskAgain: value.canAskAgain };
    }
  }
  return { status: value.granted ? 'granted' : value.status === 'denied' ? 'denied' : 'undetermined', canAskAgain: value.canAskAgain };
}

// No push token, remote service, account, or background execution is used.
export const expoReminderGateway: ReminderGateway = {
  async prepare() {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(CHANNEL, {
        name: 'مراجعة رُسوخ', importance: Notifications.AndroidImportance.DEFAULT,
        sound: null, enableVibrate: false,
      });
    }
  },
  async permissions() {
    if (Platform.OS === 'web') return { status: 'unsupported', canAskAgain: false };
    return normalizeReminderPermission(await Notifications.getPermissionsAsync());
  },
  async requestPermissions() {
    return normalizeReminderPermission(await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowBadge: false, allowSound: false },
    }));
  },
  async list() {
    return (await Notifications.getAllScheduledNotificationsAsync()).map(request => ({
      identifier: request.identifier,
      owner: request.content.data?.owner,
      kind: request.content.data?.kind,
      hour: request.content.data?.hour,
      minute: request.content.data?.minute,
    }));
  },
  async schedule(time, identifier) {
    return Notifications.scheduleNotificationAsync({
      identifier,
      content: {
        title: 'رُسوخ — وقت المراجعة',
        body: 'دقائق قليلة لاسترجاع ما تعلمته. افتح رُسوخ وراجع بطاقاتك.',
        sound: false,
        data: { owner: REMINDER_OWNER, kind: 'daily-study', ...time },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, ...time, channelId: CHANNEL, delivery: 'bestEffort' },
    });
  },
  cancel: identifier => Notifications.cancelScheduledNotificationAsync(identifier),
};
