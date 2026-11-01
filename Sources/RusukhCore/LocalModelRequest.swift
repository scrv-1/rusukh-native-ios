import Foundation

/// Bounds the full reference explicitly; never silently removes a note's later facts.
public enum LocalModelRequest {
    public enum Failure: LocalizedError {
        case emptyPrompt, promptTooLong, contextTooLong
        public var errorDescription: String? {
            switch self {
            case .emptyPrompt: return "اكتب سؤالًا أولًا."
            case .promptTooLong: return "اختصر السؤال إلى 1500 محرف لهذه التجربة."
            case .contextTooLong: return "الملاحظة أطول من حد هذه التجربة (2000 محرف). اختر ملاحظة أقصر أو السؤال دون ملاحظة؛ لم يُرسل جزء مبتور للنموذج."
            }
        }
    }
    public static func make(prompt: String, context: String?) throws -> String {
        guard !prompt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { throw Failure.emptyPrompt }
        guard prompt.count <= 1_500 else { throw Failure.promptTooLong }
        guard (context?.count ?? 0) <= 2_000 else { throw Failure.contextTooLong }
        return prompt + (context.map { "\nالملاحظة المرجعية:\n" + $0 } ?? "")
    }
}
