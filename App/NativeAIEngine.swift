import Foundation
import FoundationModels
import NaturalLanguage
import CoreML

/// Live Apple on-device text model. Requires an eligible device, enabled Apple Intelligence,
/// downloaded model weights, and an input language supported by the model on that OS.
struct NativeAIEngine {
    func status(for locale: Locale = .current) -> String {
        let model = SystemLanguageModel.default
        switch model.availability {
        case .available:
            if model.supportsLocale(locale) { return "متاح على الجهاز للغة \(locale.identifier)" }
            return "النموذج متاح، لكن اللغة \(locale.identifier) غير مدعومة."
        case .unavailable(.deviceNotEligible):
            return "هذا الجهاز لا يدعم نموذج Apple المحلي."
        case .unavailable(.modelNotReady):
            return "النموذج لم يكتمل تنزيله أو تهيئته."
        case .unavailable(let other):
            return "النموذج غير متاح حاليًا: \(String(describing: other))"
        }
    }

    func generate(prompt: String, locale: Locale) async throws -> String {
        let model = SystemLanguageModel.default
        guard model.isAvailable else { throw AIError.unavailable }
        guard model.supportsLocale(locale) else { throw AIError.unsupportedLanguage }
        // 3_000 characters is not a token budget. TN3193's 4096-token window is not
        // measured here because tokenCount(for:) is a later SDK than the iOS 26.0 target.
        let safePrompt = String(prompt.prefix(3_000))
        let answerLanguage = locale.identifier.lowercased().hasPrefix("ar") ? "Answer in Arabic." : "Answer in the person's language."
        let session = LanguageModelSession(instructions: """
            You are an on-device study coach. Explain the provided study topic accurately,
            clearly, and briefly. Avoid inventing citations. If uncertain, say so.
            \(answerLanguage)
            The person's locale is \(locale.identifier).
            """)
        let response = try await session.respond(to: safePrompt)
        return response.content
    }
}

enum AIError: LocalizedError {
    case unavailable, unsupportedLanguage
    var errorDescription: String? {
        switch self {
        case .unavailable: return "نموذج Apple المحلي غير متاح على هذا الجهاز أو لم يكتمل تنزيله."
        case .unsupportedLanguage: return "نموذج Apple لا يدعم هذه اللغة على هذا النظام. قسم Qwen أسفل الشاشة اختياري ولا يُحمَّل تلقائيًا."
        }
    }
}

/// Deterministic local Arabic word extraction. Not a generative AI model.
enum ArabicTextInspector {
    static func keywords(from text: String, limit: Int = 8) -> [String] {
        let tokenizer = NLTokenizer(unit: .word)
        tokenizer.string = text
        var counts: [String: Int] = [:]
        let ignored: Set<String> = ["من", "في", "على", "إلى", "عن", "هذا", "هذه", "هي", "هو", "كان", "التي", "الذي", "مع", "أن", "ما", "لا", "ثم", "كل", "أو", "the", "and", "for", "with"]
        tokenizer.enumerateTokens(in: text.startIndex..<text.endIndex) { range, _ in
            let word = String(text[range]).lowercased()
            if word.count > 2 && !ignored.contains(word) { counts[word, default: 0] += 1 }
            return true
        }
        return counts.sorted { $0.value == $1.value ? $0.key < $1.key : $0.value > $1.value }.prefix(limit).map(\.key)
    }
}

/// Explicit extension point for bundled, compiled Core ML models. No model ships in this MVP.
enum CoreMLBridge {
    static func loadBundledModel(named name: String) throws -> MLModel {
        guard let url = Bundle.main.url(forResource: name, withExtension: "mlmodelc") else {
            throw CocoaError(.fileNoSuchFile)
        }
        let configuration = MLModelConfiguration()
        configuration.computeUnits = .all // OS may choose CPU, GPU or Neural Engine.
        return try MLModel(contentsOf: url, configuration: configuration)
    }
}
