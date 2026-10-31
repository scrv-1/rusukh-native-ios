import Foundation

public enum StudyStorageError: Error, LocalizedError {
    case invalidBackup

    public var errorDescription: String? {
        switch self {
        case .invalidBackup: return "ملف النسخة الاحتياطية غير صالح أو يحتوي بيانات غير مترابطة."
        }
    }
}

public struct StudyRepository {
    public let fileURL: URL

    public init(fileURL: URL) { self.fileURL = fileURL }

    public func load() throws -> StudySnapshot {
        guard FileManager.default.fileExists(atPath: fileURL.path) else { return .empty }
        let bytes = try Data(contentsOf: fileURL)
        return try Self.decode(bytes)
    }

    public func save(_ snapshot: StudySnapshot) throws {
        guard snapshot.isValid() else { throw StudyStorageError.invalidBackup }
        let bytes = try Self.encode(snapshot)
        try FileManager.default.createDirectory(at: fileURL.deletingLastPathComponent(), withIntermediateDirectories: true)
        try bytes.write(to: fileURL, options: .atomic)
    }

    public static func encode(_ snapshot: StudySnapshot) throws -> Data {
        guard snapshot.isValid() else { throw StudyStorageError.invalidBackup }
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .deferredToDate
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        return try encoder.encode(snapshot)
    }

    public static func decode(_ data: Data) throws -> StudySnapshot {
        // Cap import size to protect against oversized files on a phone.
        guard data.count < 80_000_000 else { throw StudyStorageError.invalidBackup }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .deferredToDate
        if let snapshot = try? decoder.decode(StudySnapshot.self, from: data), snapshot.isValid() {
            return snapshot
        }
        // Keep compatibility with the earlier Expo Rusukh JSON export.
        return try LegacyExpoMigration.converted(from: data)
    }
}
