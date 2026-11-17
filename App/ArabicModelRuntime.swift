import Foundation

#if canImport(MLXLLM)
import MLX
import MLXLLM
import MLXLMCommon
import Tokenizers

/// Loads only local files. Downloads and user consent belong to a separate layer.
/// Shared by the Mac offline probe and the opt-in iOS integration.
actor ArabicModelRuntime {
    private var container: ModelContainer?
    private var loadedDirectory: URL?
    private var busy = false
    private var memoryInitialized = false

    struct Result: Codable, Sendable {
        let answer: String
        let seconds: Double
        let generatedTokens: Int
        let tokensPerSecond: Double
        let truncated: Bool
    }

    enum Failure: LocalizedError {
        case busy, promptTooLong, noOutput, unsupportedSimulator
        var errorDescription: String? {
            switch self {
            case .unsupportedSimulator: return "تشغيل النموذج غير متاح في محاكي iOS. يلزم جهاز فعلي متوافق."
            case .busy: return "انتظر انتهاء الطلب الحالي."
            case .promptTooLong: return "النص طويل لهذه التجربة. اختصره ثم أعد المحاولة."
            case .noOutput: return "لم ينتج النموذج إجابة قابلة للعرض."
            }
        }
    }

    func generate(directory: URL, prompt: String) async throws -> Result {
        #if targetEnvironment(simulator)
        throw Failure.unsupportedSimulator
        #else
        guard !busy else { throw Failure.busy }
        guard prompt.count <= 4_000 else { throw Failure.promptTooLong }
        busy = true
        defer { busy = false }
        try Task.checkCancellation()
        let start = Date()
        memoryInitialized = true
        // mlx-swift "Running on iOS": 20MB buffer cache. Model weights are separate.
        MLX.Memory.cacheLimit = 20 * 1024 * 1024
        if loadedDirectory != directory.standardizedFileURL { container = nil }
        if container == nil {
            container = try await LLMModelFactory.shared.loadContainer(
                from: directory, using: LocalTokenizerLoader())
            loadedDirectory = directory.standardizedFileURL
        }
        try Task.checkCancellation()
        guard let container else { throw Failure.noOutput }
        // Qwen3-Instruct-2507 is non-thinking only. Do not add a <think> prefill.
        // Escape role delimiters in user text; the model never receives executable tools.
        let escaped = prompt.replacingOccurrences(of: "<|", with: "＜|")
        let text = """
        <|im_start|>system
        أنت مساعد تعلّم. أجب بالعربية بوضوح واختصار. عند وجود نص مرجعي التزم بمعلوماته، وإذا لم يذكر الجواب فصرّح بذلك.<|im_end|>
        <|im_start|>user
        \(escaped)<|im_end|>
        <|im_start|>assistant

        """
        let tokens = await container.encode(text)
        guard tokens.count <= 1_536 else { throw Failure.promptTooLong }
        let stream = try await container.generate(
            input: LMInput(tokens: MLXArray(tokens)),
            parameters: GenerateParameters(maxTokens: 256, maxKVSize: 2_048,
                                           temperature: 0.7, topP: 0.8, topK: 20, seed: 42))
        var answer = "", count = 0, rate = 0.0, truncated = false
        for await event in stream {
            try Task.checkCancellation()
            switch event {
            case .chunk(let chunk): answer += chunk
            case .info(let info):
                count = info.generationTokenCount
                rate = info.tokensPerSecond
                truncated = info.stopReason == .length
            case .toolCall, .rejectedToolCall:
                throw Failure.noOutput
            }
        }
        try Task.checkCancellation()
        guard !answer.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { throw Failure.noOutput }
        return Result(answer: answer, seconds: Date().timeIntervalSince(start),
                      generatedTokens: count, tokensPerSecond: rate.isFinite ? rate : 0,
                      truncated: truncated)
        #endif
    }

    func unload() {
        guard !busy else { return }
        container = nil
        loadedDirectory = nil
        #if !targetEnvironment(simulator)
        if memoryInitialized {
            MLX.Memory.clearCache()
            memoryInitialized = false
        }
        #endif
    }
}

private struct LocalTokenizerLoader: MLXLMCommon.TokenizerLoader {
    func load(from directory: URL) async throws -> any MLXLMCommon.Tokenizer {
        LocalTokenizerAdapter(base: try await Tokenizers.AutoTokenizer.from(modelFolder: directory))
    }
}

private struct LocalTokenizerAdapter: MLXLMCommon.Tokenizer {
    let base: any Tokenizers.Tokenizer
    var bosToken: String? { base.bosToken }
    var eosToken: String? { base.eosToken }
    var unknownToken: String? { base.unknownToken }
    func encode(text: String, addSpecialTokens: Bool) -> [Int] {
        base.encode(text: text, addSpecialTokens: addSpecialTokens)
    }
    func decode(tokenIds: [Int], skipSpecialTokens: Bool) -> String {
        base.decode(tokens: tokenIds, skipSpecialTokens: skipSpecialTokens)
    }
    func convertTokenToId(_ token: String) -> Int? { base.convertTokenToId(token) }
    func convertIdToToken(_ id: Int) -> String? { base.convertIdToToken(id) }
    func applyChatTemplate(messages: [[String: any Sendable]], tools: [[String: any Sendable]]?,
                           additionalContext: [String: any Sendable]?) throws -> [Int] {
        try base.applyChatTemplate(messages: messages, tools: tools, additionalContext: additionalContext)
    }
}
#endif
