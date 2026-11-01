import Foundation
import CryptoKit

/// Pinned anonymous downloads. Study text is never an input to this component.
actor ArabicModelAssets {
    struct File: Sendable {
        let name: String
        let bytes: Int64
        let sha256: String
        let source: String
    }
    static let revision = "50d427756c6b1b2fe0c0a10f67fbda1fc8e82c1b"
    static let files: [File] = [
        File(name: "added_tokens.json", bytes: 707, sha256: "c0284b582e14987fbd3d5a2cb2bd139084371ed9acbae488829a1c900833c680", source: "https://huggingface.co/mlx-community/Qwen3-4B-Instruct-2507-4bit/resolve/50d427756c6b1b2fe0c0a10f67fbda1fc8e82c1b/added_tokens.json"),
        File(name: "chat_template.jinja", bytes: 4040, sha256: "40c21f34cf67d8c760ef72f8ad3ae5afad514299d4b06e91dd9a8d705af7b541", source: "https://huggingface.co/mlx-community/Qwen3-4B-Instruct-2507-4bit/resolve/50d427756c6b1b2fe0c0a10f67fbda1fc8e82c1b/chat_template.jinja"),
        File(name: "config.json", bytes: 938, sha256: "574349e5a343236546fda55e4744a76e181f534182d7dc60ff1bad7e7a502849", source: "https://huggingface.co/mlx-community/Qwen3-4B-Instruct-2507-4bit/resolve/50d427756c6b1b2fe0c0a10f67fbda1fc8e82c1b/config.json"),
        File(name: "generation_config.json", bytes: 238, sha256: "835fffe355c9438e7a25be099b3fccaa98350b83451f9fd2d99512e74f1ade48", source: "https://huggingface.co/mlx-community/Qwen3-4B-Instruct-2507-4bit/resolve/50d427756c6b1b2fe0c0a10f67fbda1fc8e82c1b/generation_config.json"),
        File(name: "merges.txt", bytes: 1671853, sha256: "8831e4f1a044471340f7c0a83d7bd71306a5b867e95fd870f74d0c5308a904d5", source: "https://huggingface.co/mlx-community/Qwen3-4B-Instruct-2507-4bit/resolve/50d427756c6b1b2fe0c0a10f67fbda1fc8e82c1b/merges.txt"),
        File(name: "model.safetensors", bytes: 2263022417, sha256: "2a73c6c248601ab904e035548abd8e6abb65ea27dcb5f342fb0a8910eb44173f", source: "https://huggingface.co/mlx-community/Qwen3-4B-Instruct-2507-4bit/resolve/50d427756c6b1b2fe0c0a10f67fbda1fc8e82c1b/model.safetensors"),
        File(name: "model.safetensors.index.json", bytes: 63964, sha256: "388d811b8b7c2608dd04cce1bcb04a8bf715d19b42790894e6d3427ff429a777", source: "https://huggingface.co/mlx-community/Qwen3-4B-Instruct-2507-4bit/resolve/50d427756c6b1b2fe0c0a10f67fbda1fc8e82c1b/model.safetensors.index.json"),
        File(name: "special_tokens_map.json", bytes: 613, sha256: "76862e765266b85aa9459767e33cbaf13970f327a0e88d1c65846c2ddd3a1ecd", source: "https://huggingface.co/mlx-community/Qwen3-4B-Instruct-2507-4bit/resolve/50d427756c6b1b2fe0c0a10f67fbda1fc8e82c1b/special_tokens_map.json"),
        File(name: "tokenizer.json", bytes: 11422654, sha256: "aeb13307a71acd8fe81861d94ad54ab689df773318809eed3cbe794b4492dae4", source: "https://huggingface.co/mlx-community/Qwen3-4B-Instruct-2507-4bit/resolve/50d427756c6b1b2fe0c0a10f67fbda1fc8e82c1b/tokenizer.json"),
        File(name: "tokenizer_config.json", bytes: 5440, sha256: "4397cc477eb6d79715ccd2000accd6b3531928f30029665832fa1b255f24d2b9", source: "https://huggingface.co/mlx-community/Qwen3-4B-Instruct-2507-4bit/resolve/50d427756c6b1b2fe0c0a10f67fbda1fc8e82c1b/tokenizer_config.json"),
        File(name: "vocab.json", bytes: 2776833, sha256: "ca10d7e9fb3ed18575dd1e277a2579c16d108e32f27439684afa0e10b1440910", source: "https://huggingface.co/mlx-community/Qwen3-4B-Instruct-2507-4bit/resolve/50d427756c6b1b2fe0c0a10f67fbda1fc8e82c1b/vocab.json"),
        File(name: "LICENSE", bytes: 11343, sha256: "832dd9e00a68dd83b3c3fb9f5588dad7dcf337a0db50f7d9483f310cd292e92e", source: "https://huggingface.co/Qwen/Qwen3-4B-Instruct-2507/resolve/cdbee75f17c01a7cc42f958dc650907174af0554/LICENSE"),
    ]
    static let downloadBytes = files.reduce(Int64(0)) { $0 + $1.bytes }
    private var busy = false

    enum Failure: LocalizedError {
        case busy, insufficientSpace, invalidFile(String), response
        var errorDescription: String? {
            switch self {
            case .busy: return "توجد عملية نموذج قيد التنفيذ."
            case .insufficientSpace: return "يلزم توفر 5GB من المساحة قبل تنزيل النموذج."
            case .invalidFile(let name): return "فشل التحقق من سلامة ملف النموذج: \(name)."
            case .response: return "تعذر تنزيل النموذج من مصدره. أعد المحاولة عبر Wi-Fi."
            }
        }
    }

    static func directory() throws -> URL {
        var root = "RusukhModels"
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("-ui-testing") { root = "RusukhTestModels" }
        #endif
        return try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask,
                                    appropriateFor: nil, create: true)
            .appendingPathComponent(root + "/Qwen3-Instruct-2507", isDirectory: true)
    }

    func ready() -> Bool {
        guard let folder = try? Self.directory(),
              (try? String(contentsOf: folder.appendingPathComponent("verified.txt"), encoding: .utf8)) == Self.revision else { return false }
        return Self.files.allSatisfy { file in
            let size = (try? FileManager.default.attributesOfItem(atPath: folder.appendingPathComponent(file.name).path)[.size]) as? NSNumber
            return size?.int64Value == file.bytes
        }
    }

    func download(progress: @Sendable @escaping (Int, Int) async -> Void) async throws {
        guard !busy else { throw Failure.busy }
        busy = true
        defer { busy = false }
        var folder = try Self.directory()
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        try folder.setResourceValues(values)
        #if os(iOS)
        try FileManager.default.setAttributes([.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication], ofItemAtPath: folder.path)
        #endif
        let available = try FileManager.default.attributesOfFileSystem(forPath: folder.path)[.systemFreeSize] as? NSNumber
        guard let available, available.int64Value >= 5_000_000_000 else { throw Failure.insufficientSpace }
        let configuration = URLSessionConfiguration.ephemeral
        configuration.allowsCellularAccess = false
        configuration.timeoutIntervalForRequest = 60
        configuration.timeoutIntervalForResource = 1_800
        configuration.httpCookieStorage = nil
        configuration.urlCache = nil
        let session = URLSession(configuration: configuration)
        defer { session.invalidateAndCancel() }
        for (index, file) in Self.files.enumerated() {
            try Task.checkCancellation()
            await progress(index + 1, Self.files.count)
            let destination = folder.appendingPathComponent(file.name)
            if FileManager.default.fileExists(atPath: destination.path) {
                do { try Self.verify(file, at: destination); continue }
                catch is CancellationError { throw CancellationError() }
                catch { try FileManager.default.removeItem(at: destination) }
            }
            let request = URLRequest(url: URL(string: file.source)!)
            let (temporary, response) = try await session.download(for: request, delegate: DownloadLimit(bytes: file.bytes))
            defer { try? FileManager.default.removeItem(at: temporary) }
            try Task.checkCancellation()
            guard (response as? HTTPURLResponse)?.statusCode == 200 else { throw Failure.response }
            try Self.verify(file, at: temporary)
            try FileManager.default.moveItem(at: temporary, to: destination)
            #if os(iOS)
            try FileManager.default.setAttributes([.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication], ofItemAtPath: destination.path)
            #endif
        }
        try Task.checkCancellation()
        try Self.revision.write(to: folder.appendingPathComponent("verified.txt"), atomically: true, encoding: .utf8)
    }

    func remove() throws {
        guard !busy else { throw Failure.busy }
        let folder = try Self.directory()
        if FileManager.default.fileExists(atPath: folder.path) { try FileManager.default.removeItem(at: folder) }
    }

    nonisolated static func verify(_ file: File, at url: URL) throws {
        let size = try FileManager.default.attributesOfItem(atPath: url.path)[.size] as? NSNumber
        guard size?.int64Value == file.bytes else { throw Failure.invalidFile(file.name) }
        let handle = try FileHandle(forReadingFrom: url)
        defer { try? handle.close() }
        var digest = SHA256(), read: Int64 = 0
        while let chunk = try handle.read(upToCount: 1_048_576), !chunk.isEmpty {
            try Task.checkCancellation()
            read += Int64(chunk.count)
            guard read <= file.bytes else { throw Failure.invalidFile(file.name) }
            digest.update(data: chunk)
        }
        let actual = digest.finalize().map { String(format: "%02x", $0) }.joined()
        guard read == file.bytes, actual == file.sha256 else { throw Failure.invalidFile(file.name) }
    }
}

private final class DownloadLimit: NSObject, URLSessionDownloadDelegate, @unchecked Sendable {
    let bytes: Int64
    init(bytes: Int64) { self.bytes = bytes }
    func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didFinishDownloadingTo location: URL) {}
    func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didWriteData bytesWritten: Int64,
                    totalBytesWritten: Int64, totalBytesExpectedToWrite: Int64) {
        if totalBytesWritten > bytes || totalBytesExpectedToWrite > bytes { downloadTask.cancel() }
    }
}
