import Foundation

/// Pure gate for loading the optional Qwen weights. Download is a separate path:
/// the simulator may fetch files to verify SHA-256, but it must not load MLX.
public enum LocalModelBudget {
    /// Peak recorded on Mac in docs/MLX_ARABIC_NEXT.md. Not an iPhone measurement.
    public static let recordedMacPeakBytes = 2_564_247_224

    public static func mlxLoadAllowed(availableBytes: UInt64, physicalBytes: UInt64, isSimulator: Bool) -> Bool {
        if isSimulator { return false }
        if physicalBytes < 8_000_000_000 { return false }
        // os_proc_available_memory is advisory. Equal-to-peak still leaves no room
        // for the app, tokenizer, and KV cache on top of that Mac measurement.
        if availableBytes <= UInt64(recordedMacPeakBytes) { return false }
        return true
    }
}
