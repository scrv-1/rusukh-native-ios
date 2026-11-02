import SwiftUI
import UIKit

struct LocalAIView: View {
    @EnvironmentObject private var library: LibraryStore
    @Environment(\.scenePhase) private var scenePhase
    @StateObject private var inferenceGate = LocalInferenceGate()
    @StateObject private var appleModel = AppleModelController()
    @State private var prompt = ""
    @State private var selectedLanguage = "ar-SA"
    @State private var selectedNoteID: UUID?

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
                        .disabled(inferenceGate.busy)
                        Text("قد لا تدعم Apple العربية في نموذج Foundation Models. يختبر رُسوخ ذلك على الجهاز نفسه بدل الادعاء بوجود دعم.")
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
                    .disabled(inferenceGate.busy)
                    TextField("اكتب سؤالك هنا...", text: $prompt, axis: .vertical)
                        .accessibilityIdentifier("ai.prompt")
                        .lineLimit(3...6)
                        .textFieldStyle(.roundedBorder)
                        .disabled(inferenceGate.busy)
                    Text("حد السؤال 1500 محرف، والملاحظة المرجعية 2000 محرف. الملاحظة الأطول تُرفض كاملةً ولا تُقتطع خفيةً.")
                        .font(.caption).foregroundStyle(.secondary)
                    ArabicModelView(prompt: prompt, context: selectedNote?.body, gate: inferenceGate)
                    Button {
                        appleModel.generate(prompt: prompt, context: selectedNote?.body, locale: selectedLocale, gate: inferenceGate)
                    } label: {
                        HStack {
                            if appleModel.busy { ProgressView() }
                            Text("تشغيل محرك Apple")
                            Image(systemName: "sparkles")
                        }
                        .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent).tint(.primary)
                    .disabled(inferenceGate.busy || prompt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    if appleModel.busy {
                        Button("إيقاف محرك Apple") { appleModel.stop() }
                            .accessibilityIdentifier("apple-model-cancel")
                    }
                    if let errorText = appleModel.error {
                        Text(errorText).foregroundStyle(.red).font(.footnote)
                    }
                    if !appleModel.answer.isEmpty {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("نتيجة النموذج").font(.headline)
                            Text(appleModel.answer).textSelection(.enabled)
                            Text("نتيجة مولّدة محليًا؛ راجع دقتها قبل استخدامها.")
                                .font(.caption).foregroundStyle(.secondary)
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
            .onChange(of: scenePhase) { _, phase in if phase == .background { appleModel.stop() } }
            .onDisappear { appleModel.stop() }
            .onReceive(NotificationCenter.default.publisher(for: UIApplication.didReceiveMemoryWarningNotification)) { _ in appleModel.stop() }
            .onReceive(NotificationCenter.default.publisher(for: ProcessInfo.thermalStateDidChangeNotification)) { _ in
                if [.serious, .critical].contains(ProcessInfo.processInfo.thermalState) { appleModel.stop() }
            }
        }
    }
}
