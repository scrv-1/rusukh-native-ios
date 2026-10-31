import SwiftUI
import UniformTypeIdentifiers

struct HomeView: View {
    @EnvironmentObject private var library: LibraryStore
    @State private var showingSettings = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    HStack {
                        Text("رُسوخ")
                            .font(.system(size: 36, weight: .black, design: .rounded))
                        Spacer()
                        Image(systemName: "circle.hexagongrid.fill")
                            .font(.largeTitle)
                    }
                    Text("تعلّم يبقى.").font(.title2.weight(.semibold))
                    Text("ملاحظاتك ومراجعاتك على جهازك، دون خادم خارجي.")
                        .foregroundStyle(.secondary)
                    HStack(spacing: 10) {
                        metric(title: "الملاحظات", value: library.snapshot.notes.count)
                        metric(title: "البطاقات", value: library.snapshot.cards.count)
                        metric(title: "تستحق مراجعة", value: library.due.count)
                    }
                    VStack(alignment: .leading, spacing: 12) {
                        Label("جلسة اليوم", systemImage: "clock.arrow.circlepath")
                            .font(.headline)
                        Text(library.due.isEmpty ? "ليس لديك مراجعات مستحقة" : "لديك \(library.due.count) بطاقات تنتظرك")
                            .font(.title2.bold())
                        Text("أنشئ بطاقات من ملاحظاتك باستخدام الأسطر س: وج:، أو أضفها يدويًا.")
                            .font(.subheadline)
                    }
                    .padding(20)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .foregroundStyle(.white)
                    .background(Color.black, in: RoundedRectangle(cornerRadius: 20))
                    Text("آخر الملاحظات").font(.headline)
                    ForEach(library.snapshot.notes.prefix(4)) { note in
                        VStack(alignment: .leading, spacing: 5) {
                            Text(note.title).font(.headline)
                            Text(note.body.isEmpty ? "ملاحظة فارغة" : note.body)
                                .font(.footnote).foregroundStyle(.secondary).lineLimit(2)
                        }
                        .padding(14)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 14))
                    }
                    if library.snapshot.notes.isEmpty {
                        ContentUnavailableView("ابدأ بملاحظة", systemImage: "square.and.pencil", description: Text("اضغط «ملاحظاتي» لإضافة أول ملاحظة."))
                    }
                }
                .padding(18)
            }
            .navigationTitle("الرئيسية")
            .toolbar { Button { showingSettings = true } label: { Image(systemName: "gearshape") } }
            .sheet(isPresented: $showingSettings) { SettingsView() }
        }
    }

    private func metric(title: String, value: Int) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("\(value)").font(.title.bold()).monospacedDigit()
            Text(title).font(.caption).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 14))
    }
}

struct SettingsView: View {
    @EnvironmentObject private var library: LibraryStore
    @Environment(\.dismiss) private var dismiss
    @State private var shareURL: URL?
    @State private var importing = false
    @State private var confirmImport = false

    var body: some View {
        NavigationStack {
            Form {
                Section("النسخ الاحتياطي") {
                    Button("تجهيز نسخة JSON شاملة مع الصور") { shareURL = library.exportToTemporaryFile() }
                    if let shareURL {
                        ShareLink(item: shareURL) { Label("حفظ النسخة في الملفات", systemImage: "square.and.arrow.up") }
                    }
                    Button("استيراد نسخة — يستبدل كل البيانات") { confirmImport = true }
                    Text("الصور المحفوظة داخل الملاحظات موجودة في النسخة. النسخة غير مشفّرة؛ احفظها بمكان آمن.")
                        .font(.footnote).foregroundStyle(.secondary)
                }
                Section("الأمان") {
                    Text("كل الملاحظات تُحفظ محليًا. حذف التطبيق قد يحذف البيانات؛ صدّر نسخة دورية.")
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
            .fileImporter(isPresented: $importing, allowedContentTypes: [.json]) { result in
                switch result {
                case .success(let url): library.importFromFile(url)
                case .failure(let error): library.message = error.localizedDescription
                }
            }
        }
    }
}
