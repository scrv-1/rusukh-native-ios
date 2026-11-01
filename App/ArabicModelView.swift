import SwiftUI
import UIKit

@MainActor
final class LocalInferenceGate: ObservableObject {
    @Published private(set) var busy = false
    func acquire() -> Bool {
        guard !busy else { return false }
        busy = true
        return true
    }
    func release() { busy = false }
}

#if canImport(MLXLLM)
@MainActor
final class ArabicModelController: ObservableObject {
    @Published private(set) var ready = false
    @Published private(set) var busy = false
    @Published private(set) var status = ""
    @Published private(set) var answer = ""
    private let assets = ArabicModelAssets()
    private let runtime = ArabicModelRuntime()
    private var work: Task<Void, Never>?
    var sufficientMemory: Bool { ProcessInfo.processInfo.physicalMemory >= 8_000_000_000 }

    func refresh() async { ready = await assets.ready() }

    func download(gate: LocalInferenceGate) {
        guard !busy, sufficientMemory, permitsWork, gate.acquire() else { return }
        busy = true
        work = Task {
            defer { gate.release() }
            do {
                try await assets.download { [weak self] index, count in
                    await self?.setDownloadStatus(index: index, count: count)
                }
                ready = await assets.ready()
                status = ready ? "اكتمل التنزيل والتحقق من سلامة الملفات." : "لم يكتمل تنزيل النموذج."
            } catch is CancellationError { status = "أوقفت العملية. يمكنك استئناف الملفات المكتملة لاحقًا." }
            catch { status = Task.isCancelled ? "أوقفت العملية." : error.localizedDescription }
            busy = false
            work = nil
        }
    }

    func generate(prompt: String, context: String?, gate: LocalInferenceGate) {
        guard !busy, ready, sufficientMemory, permitsWork else { return }
        let input: String
        do { input = try LocalModelRequest.make(prompt: prompt, context: context) }
        catch { status = error.localizedDescription; return }
        guard gate.acquire() else { return }
        busy = true
        answer = ""
        status = "تحميل النموذج وتوليد الإجابة على الجهاز…"
        work = Task {
            defer { gate.release() }
            do {
                let result = try await runtime.generate(directory: ArabicModelAssets.directory(), prompt: input)
                try Task.checkCancellation()
                answer = result.answer
                status = result.truncated ? "بلغت الإجابة حد الطول. راجعها قبل استخدامها." : "اكتملت الإجابة محليًا. راجع دقتها قبل استخدامها."
            } catch is CancellationError { status = "أوقف التوليد." }
            catch { status = Task.isCancelled ? "أوقفت العملية." : error.localizedDescription }
            // Cancellation is followed by unloading, never silently ignored while busy.
            await runtime.unload()
            busy = false
            work = nil
        }
    }

    func remove() {
        guard !busy else { return }
        busy = true
        work = Task {
            await runtime.unload()
            do { try await assets.remove(); ready = false; answer = ""; status = "حُذفت أوزان النموذج. ملاحظاتك محفوظة." }
            catch { status = Task.isCancelled ? "أوقفت العملية." : error.localizedDescription }
            busy = false
            work = nil
        }
    }

    func stop() {
        if let work { work.cancel() }
        else { Task { await runtime.unload() } }
    }
    private func setDownloadStatus(index: Int, count: Int) {
        status = "تنزيل وفحص الملف \(index) من \(count). ملف الأوزان كبير وقد يستغرق وقتًا."
    }
    private var permitsWork: Bool {
        let thermal = ProcessInfo.processInfo.thermalState
        if thermal == .serious || thermal == .critical {
            status = "الجهاز ساخن. انتظر حتى يبرد قبل تشغيل النموذج."
            return false
        }
        return true
    }
}
#endif

struct ArabicModelView: View {
    let prompt: String
    let context: String?
    @ObservedObject var gate: LocalInferenceGate
    @State private var isExpanded = false
    #if canImport(MLXLLM)
    @StateObject private var model = ArabicModelController()
    @Environment(\.scenePhase) private var scenePhase
    @State private var confirmDelete = false
    #endif

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Button { isExpanded.toggle() } label: {
                HStack {
                    Text("نموذج عربي تجريبي — Qwen")
                    Spacer()
                    Image(systemName: isExpanded ? "chevron.up" : "chevron.down")
                }
            }
            .accessibilityIdentifier("arabic-model-section")
            .accessibilityValue(isExpanded ? "مفتوح" : "مطوي")
            if isExpanded {
                VStack(alignment: .leading, spacing: 12) {
                    Text("Qwen3-4B-Instruct-2507 • Apache-2.0")
                        .font(.caption).textSelection(.enabled)
                    Text("تنزيل اختياري بحجم 2.28GB عبر Wi-Fi. على آيفون فعلي متوافق تعمل الإجابات دون إرسال ملاحظاتك بعد اكتمال التنزيل. قد يخطئ النموذج؛ راجع الإجابات، ولن تُضاف إلى بطاقاتك تلقائيًا.")
                        .font(.footnote)
                    #if canImport(MLXLLM)
                    Text("يتطلب هذا الإصدار التجريبي ذاكرة جهاز 8GB على الأقل ومساحة 5GB قبل التنزيل. لم يعتمد أداؤه على آيفون حقيقي بعد.")
                        .font(.caption).foregroundStyle(.secondary)
                    #if targetEnvironment(simulator)
                    Text("تشغيل النموذج غير متاح في محاكي iOS. يلزم جهاز فعلي متوافق. التنزيل هنا لاختبار الملفات فقط.")
                        .font(.footnote).accessibilityIdentifier("arabic-model-simulator-unavailable")
                    #endif
                    if !model.sufficientMemory {
                        Text("ذاكرة هذا الجهاز أقل من الحد المسموح لهذه التجربة.").font(.footnote)
                    } else if model.ready {
                        #if !targetEnvironment(simulator)
                        Button("توليد إجابة عربية على الجهاز") { model.generate(prompt: prompt, context: context, gate: gate) }
                            .accessibilityIdentifier("arabic-model-generate")
                            .disabled(model.busy || gate.busy || prompt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                        #endif
                        Text("ملفات النموذج جاهزة.").font(.caption).accessibilityIdentifier("arabic-model-ready")
                        Button("حذف أوزان النموذج", role: .destructive) { confirmDelete = true }
                            .disabled(model.busy || gate.busy)
                    } else {
                        Button("تنزيل النموذج — 2.28GB") { model.download(gate: gate) }
                            .accessibilityIdentifier("arabic-model-download")
                            .disabled(model.busy || gate.busy)
                        Button("حذف ملفات التنزيل الجزئي", role: .destructive) { confirmDelete = true }
                            .disabled(model.busy || gate.busy)
                    }
                    if model.busy {
                        ProgressView()
                        Button("إلغاء") { model.stop() }.accessibilityIdentifier("arabic-model-cancel")
                    }
                    if !model.status.isEmpty { Text(model.status).font(.footnote).accessibilityIdentifier("arabic-model-status") }
                    if !model.answer.isEmpty {
                        Text(model.answer).textSelection(.enabled).accessibilityIdentifier("arabic-model-answer")
                    }
                    #else
                    Text("هذا المحرك متاح في بناء Xcode التجريبي. نسخة xtool الحالية تحتفظ بمحرك Apple والميزات الأخرى.")
                        .font(.footnote)
                    #endif
                }
                .padding(.top, 12)
            }
        }
        .buttonStyle(.borderless)
        #if canImport(MLXLLM)
        .task { await model.refresh() }
        .onChange(of: scenePhase) { _, phase in if phase == .background { model.stop() } }
        .onDisappear { model.stop() }
        .onReceive(NotificationCenter.default.publisher(for: UIApplication.didReceiveMemoryWarningNotification)) { _ in model.stop() }
        .onReceive(NotificationCenter.default.publisher(for: ProcessInfo.thermalStateDidChangeNotification)) { _ in
            if [.serious, .critical].contains(ProcessInfo.processInfo.thermalState) { model.stop() }
        }
        .confirmationDialog("حذف ملفات النموذج؟ يمكنك تنزيلها مجددًا. ملاحظاتك لن تتغير.", isPresented: $confirmDelete) {
            Button("حذف النموذج", role: .destructive) { model.remove() }
        }
        #endif
    }
}
