import SwiftUI
import UserNotifications

struct ReviewReminderView: View {
    @Environment(\.scenePhase) private var scenePhase
    @State private var time = Calendar.current.date(from: DateComponents(hour: 20, minute: 0)) ?? .now
    @State private var enabled = false
    @State private var busy = false
    @State private var message = ""
    private let identifier = "rusukh.daily-review"

    var body: some View {
        Section("تذكير المراجعة") {
            DatePicker("وقت التذكير اليومي", selection: $time, displayedComponents: .hourAndMinute)
                .disabled(busy)
            Text("تذكير محلي عام، دون عرض محتوى ملاحظاتك. يرسله النظام حتى لو كان التطبيق مغلقًا.")
                .font(.footnote).foregroundStyle(.secondary)
            Button(enabled ? "تحديث وقت التذكير" : "تفعيل التذكير") { Task { await schedule() } }
                .disabled(busy).accessibilityIdentifier("reminder.schedule")
            if enabled {
                Button("إيقاف التذكير", role: .destructive) {
                    UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: [identifier])
                    enabled = false
                    message = "التذكير متوقف."
                }.disabled(busy).accessibilityIdentifier("reminder.disable")
            }
            if !message.isEmpty { Text(message).font(.footnote).accessibilityIdentifier("reminder.status") }
        }
        .task { await refresh() }
        .onChange(of: scenePhase) { _, phase in if phase == .active && !busy { Task { await refresh() } } }
    }

    @MainActor private func refresh() async {
        let center = UNUserNotificationCenter.current()
        let pending = await center.pendingNotificationRequests()
        if let trigger = pending.first(where: { $0.identifier == identifier })?.trigger as? UNCalendarNotificationTrigger {
            enabled = true
            if let date = Calendar.current.date(from: trigger.dateComponents) { time = date }
            let settings = await center.notificationSettings()
            message = settings.authorizationStatus == .denied ? "الإشعارات محظورة من إعدادات النظام." : "التذكير اليومي محفوظ على هذا الجهاز."
        } else { enabled = false }
    }

    @MainActor private func schedule() async {
        guard !busy else { return }
        busy = true
        let components = Calendar.current.dateComponents([.hour, .minute], from: time)
        defer { busy = false }
        do {
            let center = UNUserNotificationCenter.current()
            guard try await center.requestAuthorization(options: [.alert, .sound]) else {
                message = "لم يُسمح بالإشعارات. يمكنك تفعيلها من إعدادات الآيفون."
                return
            }
            let content = UNMutableNotificationContent()
            content.title = "رُسوخ — تعلّم يبقى"
            content.body = "حان وقت مراجعة قصيرة لما تعلمته."
            content.sound = .default
            let trigger = UNCalendarNotificationTrigger(dateMatching: components, repeats: true)
            try await center.add(UNNotificationRequest(identifier: identifier, content: content, trigger: trigger))
            await refresh()
        } catch { message = "تعذّر جدولة التذكير: \(error.localizedDescription)" }
    }
}
