# Local study reminders

Integration: `<RemindersPanel db={db} p={palette} />` in Settings. An optional `service` prop injects the controller for UI tests. Uses the existing SQLite `meta` setting `studyReminder.v1`; no schema change.

Dependency: **expo-notifications ~58.1.7**, verified against the installed Expo 58 `bundledNativeModules.json`, installed package/types, and [official SDK 58 documentation](https://docs.expo.dev/versions/v58.0.0/sdk/notifications/). Local notifications remain supported in Expo Go. No push token, APNs registration, server, account, paid service, or background loop is used.

## Behavior and failure handling

- Default OFF. Permission requests happen only after the student's explicit enable/update action. Reading Settings or returning from the background only checks state.
- Daily wall-clock time accepts Latin, Arabic-Indic, and Persian digits. The OS handles repeating delivery; Focus, notification settings, and OS scheduling can delay or silence it.
- Requests carry the exact `rusukh.study-reminder.v1` owner and `daily-study` kind. Only those requests are inspected/cancelled as ours. No `cancelAllScheduledNotificationsAsync` call is made.
- A stable request identifier updates the existing reminder. An unrelated request using that identifier causes a visible failure rather than an overwrite. Older owned duplicates are cancelled after the new schedule is confirmed.
- Enable/cancel operations serialize across panel instances. Preferences are persisted only after OS scheduling/cancellation succeeds and pending requests are checked. OS and SQLite cannot form one transaction: a storage failure is reported and the current OS state remains visible. A later explicit update/cancel repairs the mismatch.
- Missing OS requests are never recreated automatically from an imported/restored preference. iOS provisional/ephemeral permission is labelled as quiet or temporary; denial is not labelled as enabled.
- Notification text is generic and exposes no note contents. Notification delivery while the app is foregrounded follows the host/app's presentation policy; no global notification handler is overwritten by this panel. Opening the notification opens the host/app; this module does not modify navigation.
- Web preview is explicitly unsupported. In Expo Go the OS notification belongs to Expo Go; permissions and notification identity differ from a future standalone binary. For a standalone binary, configure the plugin with `enableRemoteNotifications: false` and `enableBackgroundRemoteNotifications: false` if only local notifications are needed.

## Verification completed

`npx jest --runInBand tests/reminders.ui.test.jsx`: **12 tests passed**. Native calls are mocked; these are controller/adapter/UI regression tests, not proof of iPhone delivery.

Coverage: default OFF/read-only inspection; Arabic time parsing; permission denial; only-owned duplicate reconciliation; failed scheduling preserving previous requests; persistence ordering; saved/OS mismatch and storage failure; failed cancellation and retry; concurrent enable/disable; foreign identifier collision; iOS quiet permission and exact Expo schedule payload; explicit UI activation and cancellation.

## Physical device acceptance still required

1. In Expo Go on an iPhone, enable a time a few minutes ahead and accept the OS notification prompt. Check Settings reports a saved OS schedule.
2. Background/lock the phone and check actual delivery. Test with Focus disabled and inspect Expo Go notification settings if quiet. Screenshot the delivered notification for evidence.
3. Change the time twice; verify there is one app-owned pending reminder in Settings and no delivery at the old time.
4. Cancel and confirm no reminder at the next scheduled time. Deny/revoke notification permission and confirm no false enabled state or automatic prompt on launch.
5. Reopen the app and verify the status survives; test a timezone/daylight-saving change separately before making exact-time guarantees.

No iPhone notification, battery, heat, or background delivery result has been claimed from these mocked tests.
