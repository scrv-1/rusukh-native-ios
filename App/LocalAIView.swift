import SwiftUI

struct LocalAIView: View {
    @EnvironmentObject private var library: LibraryStore
    @StateObject private var inferenceGate = LocalInferenceGate()
    @State private var prompt = ""
    @State private var answer = ""
    @State private var busy = false
    @State private var selectedLanguage = "ar-SA"
    @State private var selectedNoteID: UUID?
    @State private var errorText: String?

    private let engine = NativeAIEngine()
    private var selectedNote: StudyNote? { library.snapshot.notes.first(where: { $0.id == selectedNoteID }) }
    private var selectedLocale: Locale { Locale(identifier: selectedLanguage) }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Label("النموذج يعمل على الجهاز عند توفره، دون إرسال النص إلى خادم.", systemImage: "iphone.gen3")
                        .font(.subheadline)
                    VStack(alignment: .leading, spacing: 8) {
                        Text("حالة محرك Apple").font(.headline)
                        Text(engine.status(for: selectedLocale))
                            .font(.subheadline).foregroundStyle(.secondary)
                        Picker("لغة التحليل", selection: $selectedLanguage) {
                            Text("العربية").tag("ar-SA")
                            Text("English").tag("en-US")
                        }
                        .pickerStyle(.segmented)
                        Text("إذا لم يدعم نموذج Apple اللغة المختارة، لا يُحمَّل Qwen تلقائيًا. افتح القسم التجريبي أسفل الحقل. المحاكي لا يشغّل MLX.")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                    .padding(16)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16))

                    Picker("ملاحظة مرجعية", selection: $selectedNoteID) {
                        Text("بدون ملاحظة").tag(nil as UUID?)
                        ForEach(library.snapshot.notes) { note in
                            Text(note.title).tag(Optional(note.id))
                        }
                    }
                    TextField("اكتب سؤالك هنا...", text: $prompt, axis: .vertical)
                        .accessibilityIdentifier("ai.prompt")
                        .multilineTextAlignment(.leading)
                        .lineLimit(3...6)
                        .textFieldStyle(.roundedBorder)
                    ArabicModelView(prompt: prompt, context: selectedNote?.body, gate: inferenceGate)
                    Button {
                        Task { await perform() }
                    } label: {
                        HStack {
                            if busy { ProgressView() }
                            Text("تشغيل محرك Apple")
                            Image(systemName: "sparkles")
                        }
                        .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent).tint(.primary)
                    .disabled(busy || inferenceGate.busy || prompt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    if let errorText {
                        Text(errorText).foregroundStyle(.red).font(.footnote)
                    }
                    if !answer.isEmpty {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("نتيجة النموذج").font(.headline)
                            Text(answer).textSelection(.enabled)
                        }
                        .padding(16)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 14))
                    }
                    Divider()
                    Text("تحليل كلمات عربي محلي (غير توليدي)").font(.headline)
                    if let note = selectedNote {
                        let words = ArabicTextInspector.keywords(from: note.body)
                        Text(words.isEmpty ? "لا توجد كلمات كافية في الملاحظة." : words.joined(separator: "  ·  "))
                            .textSelection(.enabled)
                    } else {
                        Text("اختر ملاحظة لعرض أبرز كلماتها دون اتصال بالإنترنت.")
                            .foregroundStyle(.secondary)
                    }
                }
                .padding(18)
            }
            .navigationTitle("الذكاء المحلي")
        }
    }

    @MainActor
    private func perform() async {
        guard inferenceGate.acquire() else { return }
        defer { inferenceGate.release() }
        busy = true
        answer = ""
        errorText = nil
        defer { busy = false }
        let context = selectedNote.map { "\nStudy note:\n\(String($0.body.prefix(1200)))" } ?? ""
        do {
            answer = try await engine.generate(prompt: prompt + context, locale: selectedLocale)
        } catch {
            errorText = error.localizedDescription
        }
    }
}
