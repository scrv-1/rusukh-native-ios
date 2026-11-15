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
    public static let maximumFileBytes = 80_000_000
    public let fileURL: URL

    public init(fileURL: URL) { self.fileURL = fileURL }

    public func load() throws -> StudySnapshot {
        guard FileManager.default.fileExists(atPath: fileURL.path) else { return .empty }
        return try Self.read(from: fileURL)
    }

    public static func read(from url: URL) throws -> StudySnapshot {
        let size = try url.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
        guard size < maximumFileBytes else { throw StudyStorageError.invalidBackup }
        let handle = try FileHandle(forReadingFrom: url)
        defer { try? handle.close() }
        let bytes = try handle.read(upToCount: maximumFileBytes) ?? Data()
        return try decode(bytes)
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

public enum StudyImportMode: String, Codable, Sendable {
    case merge
    case replace
}

public enum StudyLibrary {
    public static func applying(_ current: StudySnapshot, incoming: StudySnapshot, mode: StudyImportMode) throws -> StudySnapshot {
        guard current.isValid(), incoming.isValid() else { throw StudyStorageError.invalidBackup }
        switch mode {
        case .replace:
            return incoming
        case .merge:
            let notes = union(current.notes, incoming.notes) { $0.updatedAt >= $1.updatedAt }
            let cards = union(current.cards, incoming.cards) { $0.updatedAt >= $1.updatedAt }
            let reviews = union(current.reviews, incoming.reviews) { $0.at >= $1.at }
            let result = StudySnapshot(notes: notes, cards: cards, reviews: reviews)
            guard result.isValid() else { throw StudyStorageError.invalidBackup }
            return result
        }
    }

    private static func union<T: Identifiable>(_ current: [T], _ incoming: [T], preferIncoming: (T, T) -> Bool) -> [T] {
        var result = current
        var index: [T.ID: Int] = [:]
        for (offset, item) in result.enumerated() { index[item.id] = offset }
        for item in incoming {
            if let existing = index[item.id] {
                if preferIncoming(item, result[existing]) { result[existing] = item }
            } else {
                index[item.id] = result.count
                result.append(item)
            }
        }
        return result
    }
}
