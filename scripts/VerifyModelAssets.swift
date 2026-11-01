import Foundation

@main
struct VerifyModelAssets {
    static func main() throws {
        guard CommandLine.arguments.count == 2 else { fatalError("Expected provisioned model folder") }
        let folder = URL(fileURLWithPath: CommandLine.arguments[1])
        for file in ArabicModelAssets.files {
            try ArabicModelAssets.verify(file, at: folder.appendingPathComponent(file.name))
            print("SWIFT_SHA256_VERIFIED \(file.name)")
        }
        let temporary = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: temporary) }
        let fixture = ArabicModelAssets.File(name: "fixture", bytes: 3,
            sha256: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", source: "unused")
        try Data("abc".utf8).write(to: temporary)
        try ArabicModelAssets.verify(fixture, at: temporary)
        for bytes in ["abd", "ab", "abcd"] {
            try Data(bytes.utf8).write(to: temporary)
            var rejected = false
            do { try ArabicModelAssets.verify(fixture, at: temporary) }
            catch ArabicModelAssets.Failure.invalidFile { rejected = true }
            guard rejected else { fatalError("Corrupt, truncated or oversized fixture accepted") }
        }
        print("MODEL_INTEGRITY_TESTS_PASSED valid, corruption, truncation, oversize")
    }
}
