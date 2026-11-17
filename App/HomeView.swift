import SwiftUI
import UniformTypeIdentifiers

struct HomeView: View {
    @EnvironmentObject private var library: LibraryStore
    @Environment(\.rusukhTab) private var tab
    @State private var showingSettings = false
    @State private var openedNote: StudyNote?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    HStack {
                        Text("رُسوخ")
                            .font(.system(.largeTitle, design: .rounded).weight(.black))
                        Spacer()
                        Image(systemName: "circle.hexagongrid.fill")
                            .font(.largeTitle)
                            .accessibilityHidden(true)
                    }
                    Text("تعلّم يبقى.").font(.title2.weight(.semibold))
                    Text("ملاحظاتك ومراجعاتك على جهازك، دون خادم خارجي.")
                        .foregroundStyle(.secondary)
                        .accessibilityIdentifier("app.direction")
                    ViewThatFits(in: .horizontal) {
                        metricsRow
                        HorizontalRail { metricsRow }
                    }
                    Button { tab.wrappedValue = .review } label: {
                        VStack(alignment: .leading, spacing: 12) {
                            Label("جلسة اليوم", systemImage: "clock.arrow.circlepath")
                                .font(.headline)
                            Text(library.due.isEmpty ? "ليس لديك مراجعات مستحقة" : "لديك \(BidirectionalText.count(library.due.count)) بطاقات تنتظرك")
                                .font(.title2.bold())
                            Text("أنشئ بطاقات من ملاحظاتك باستخدام الأسطر س: وج:، أو أضفها يدويًا.")
                                .font(.subheadline)
                            Label("فتح المراجعة", systemImage: "chevron.forward")
                                .font(.footnote.weight(.semibold))
                        }
                        .padding(20)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .foregroundStyle(.white)
                        .background(Color.black, in: RoundedRectangle(cornerRadius: 20))
                    }
                    .buttonStyle(.plain)
                    .accessibilityHint("يفتح المراجعة")
                    Text("آخر الملاحظات").font(.headline)
                    ForEach(library.snapshot.notes.prefix(4)) { note in
                        Button { openedNote = note } label: {
                            VStack(alignment: .leading, spacing: 5) {
                                Text(note.title).font(.headline).foregroundStyle(.primary)
                                Text(note.body.isEmpty ? "ملاحظة فارغة" : note.body)
                                    .font(.footnote).foregroundStyle(.secondary).lineLimit(2)
                            }
                            .padding(14)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 14))
                        }
                        .buttonStyle(.plain)
                    }
                    if library.snapshot.notes.isEmpty {
                        ContentUnavailableView("ابدأ بملاحظة", systemImage: "square.and.pencil", description: Text("اضغط «ملاحظاتي» لإضافة أول ملاحظة."))
                    }
                }
                .padding(18)
            }
            .navigationTitle("الرئيسية")
            .toolbar {
                Button { showingSettings = true } label: { Image(systemName: "gearshape") }
                    .accessibilityLabel("الإعدادات")
            }
            .sheet(isPresented: $showingSettings) { SettingsView() }
            .sheet(item: $openedNote) { note in NoteEditorView(note: note) }
        }
    }

    private var metricsRow: some View {
        HStack(spacing: 10) {
            metric(title: "الملاحظات", value: library.snapshot.notes.count, destination: .notes, hint: "يفتح ملاحظاتي")
            metric(title: "البطاقات", value: library.snapshot.cards.count, destination: nil, hint: nil)
            metric(title: "تستحق مراجعة", value: library.due.count, destination: .review, hint: "يفتح المراجعة")
        }
    }

    private func metric(title: String, value: Int, destination: RusukhTab?, hint: String?) -> some View {
        let card = VStack(alignment: .leading, spacing: 6) {
            Text(BidirectionalText.count(value)).font(.title.bold()).monospacedDigit()
            Text(title).font(.caption).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 14))
        return Group {
            if let destination, let hint {
                Button { tab.wrappedValue = destination } label: { card }
                    .buttonStyle(.plain)
                    .accessibilityHint(hint)
            } else {
                card.accessibilityElement(children: .combine)
            }
        }
    }
}

struct SettingsView: View {
    @EnvironmentObject private var library: LibraryStore
    @Environment(\.dismiss) private var dismiss
    @State private var shareURL: URL?
    @State private var importing = false
    @State private var confirmImport = false
    @State private var confirmErase = false

    var body: some View {
        NavigationStack {
            Form {
                ReviewReminderView()
                Section("النسخ الاحتياطي") {
                    Button("تجهيز نسخة JSON شاملة مع المرفقات") {
                        if let shareURL { try? FileManager.default.removeItem(at: shareURL) }
                        shareURL = library.exportToTemporaryFile()
                    }
                    if shareURL == nil {
                        Text("التجهيز لا يحفظ الملف وحده. بعد نجاحه يظهر زر الحفظ.")
                            .font(.footnote).foregroundStyle(.secondary)
                    }
                    if let shareURL {
                        ShareLink(item: shareURL) { Label("حفظ النسخة في الملفات", systemImage: "square.and.arrow.up") }
                    }
                    Button("استيراد نسخة — يستبدل كل البيانات") { confirmImport = true }
                    Text("الصور والتسجيلات المحفوظة داخل الملاحظات موجودة في النسخة. النسخة غير مشفّرة؛ احفظها بمكان آمن.")
                        .font(.footnote).foregroundStyle(.secondary)
                }
                Section("الأمان") {
                    Text("كل الملاحظات تُحفظ محليًا. حذف التطبيق قد يحذف البيانات؛ صدّر نسخة دورية.")
                    Button("مسح كل البيانات المحلية", role: .destructive) { confirmErase = true }
                }
                Section("وضع التطوير") {
                    Text("تجربة بدون عضوية Apple Developer مدفوعة. قد تحتاج إعادة توقيع كل 7 أيام.")
                }
            }
            .navigationTitle("الإعدادات")
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("إغلاق") { dismiss() } } }
            .confirmationDialog("سيُستبدل كل المحتوى. صدّر نسخة احتياطية أولًا.", isPresented: $confirmImport) {
                Button("اختيار ملف الاستيراد", role: .destructive) { importing = true }
            }
            .confirmationDialog("مسح الملاحظات والبطاقات من هذا الجهاز؟ صدّر نسخة أولًا. لا يمكن التراجع.", isPresented: $confirmErase, titleVisibility: .visible) {
                Button("مسح الكل", role: .destructive) { _ = library.eraseAll() }
            }
            .fileImporter(isPresented: $importing, allowedContentTypes: [.json]) { result in
                switch result {
                case .success(let url): library.importFromFile(url)
                case .failure(let error): library.message = error.localizedDescription
                }
            }
        }
    }
}
