import Foundation
import Combine

/// Owns one Apple-model operation, including its cancellation and UI result.
/// The gate stays held until the generator actually exits, even after cancellation.
@MainActor
final class AppleModelController: ObservableObject {
    @Published private(set) var busy = false
    @Published private(set) var answer = ""
    @Published private(set) var error: String?
    private var work: Task<Void, Never>?
    private let generateResponse: @MainActor (String, Locale) async throws -> String

    init(generateResponse: @escaping @MainActor (String, Locale) async throws -> String = { request, locale in
        try await NativeAIEngine().generate(prompt: request, locale: locale)
    }) {
        self.generateResponse = generateResponse
    }

    @discardableResult
    func generate(prompt: String, context: String?, locale: Locale, gate: LocalInferenceGate) -> Task<Void, Never>? {
        guard !busy else { return nil }
        let request: String
        do { request = try LocalModelRequest.make(prompt: prompt, context: context) }
        catch { answer = ""; self.error = error.localizedDescription; return nil }
        guard gate.acquire() else { return nil }
        busy = true
        answer = ""
        error = nil
        // Capture the complete request and locale before the task can suspend.
        let task = Task {
            defer {
                gate.release()
                busy = false
                work = nil
            }
            do {
                try Task.checkCancellation()
                let result = try await generateResponse(request, locale)
                try Task.checkCancellation()
                answer = result
            } catch {
                self.error = Task.isCancelled || error is CancellationError
                    ? "أُوقف توليد الإجابة. يمكنك المحاولة مجددًا."
                    : error.localizedDescription
            }
        }
        work = task
        return task
    }

    func stop() { work?.cancel() }
}
