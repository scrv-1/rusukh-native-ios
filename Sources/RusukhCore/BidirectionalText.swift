import Foundation

/// Isolates Western numbers inside Arabic sentences.
/// U+2066 LEFT-TO-RIGHT ISOLATE … U+2069 POP DIRECTIONAL ISOLATE (Unicode TR9).
/// Do not use the older LRE/PDF pair (U+202A/U+202C).
public enum BidirectionalText {
    public static func isolatedLTR(_ value: String) -> String {
        "\u{2066}\(value)\u{2069}"
    }

    public static func count(_ value: Int) -> String {
        isolatedLTR(String(value))
    }

    public static func fraction(done: Int, total: Int) -> String {
        isolatedLTR("\(done) / \(total)")
    }

    public static func strippingIsolates(_ text: String) -> String {
        String(text.unicodeScalars.filter { !$0.properties.isDefaultIgnorableCodePoint })
    }
}
