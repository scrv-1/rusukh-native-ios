import Foundation

public enum StudyStorageError: Error, LocalizedError {
    case invalidBackup

    public var errorDescription: String? {
        switch self {
        case .invalidBackup: return "ملف النسخة الاحتياطية غير صالح أو يحتوي بيانات غير مترابطة."
        }
    }
}

public struct StudyRepository: Sendable {
    public static let maximumFileBytes = 80_000_000
    public let fileURL: URL

    public init(fileURL: URL) { self.fileURL = fileURL }

    public func load() throws -> StudySnapshot {
        guard FileManager.default.fileExists(atPath: fileURL.path) else { return .empty }
        return try Self.read(from: fileURL)
    }

    public static func read(from url: URL) throws -> StudySnapshot {
        try decode(readBytes(from: url))
    }

    static func readBytes(from url: URL) throws -> Data {
        let size = try url.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
        guard size >= 0, size < maximumFileBytes else { throw StudyStorageError.invalidBackup }
        let handle = try FileHandle(forReadingFrom: url)
        defer { try? handle.close() }
        let bytes = try handle.read(upToCount: maximumFileBytes) ?? Data()
        guard bytes.count < maximumFileBytes else { throw StudyStorageError.invalidBackup }
        return bytes
    }

    public func save(_ snapshot: StudySnapshot) throws {
        guard snapshot.isValid() else { throw StudyStorageError.invalidBackup }
        let bytes = try Self.encode(snapshot)
        try FileManager.default.createDirectory(at: fileURL.deletingLastPathComponent(), withIntermediateDirectories: true)
        #if os(iOS)
        try bytes.write(to: fileURL, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        #else
        try bytes.write(to: fileURL, options: .atomic)
        #endif
    }

    public static func encode(_ snapshot: StudySnapshot) throws -> Data {
        guard snapshot.isValid() else { throw StudyStorageError.invalidBackup }
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .deferredToDate
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        let bytes = try encoder.encode(snapshot)
        guard bytes.count < maximumFileBytes else { throw StudyStorageError.invalidBackup }
        return bytes
    }

    public static func decode(_ data: Data) throws -> StudySnapshot {
        // Cap import size to protect against oversized files on a phone.
        guard data.count < maximumFileBytes else { throw StudyStorageError.invalidBackup }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .deferredToDate
        if let snapshot = try? decoder.decode(StudySnapshot.self, from: data), snapshot.isValid() {
            return snapshot
        }
        // Keep compatibility with the earlier Expo Rusukh JSON export.
        return try LegacyExpoMigration.converted(from: data)
    }
}
