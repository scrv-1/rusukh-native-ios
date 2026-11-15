import CryptoKit
import Foundation

public enum StudyStorageError: Error, LocalizedError, Equatable {
    case invalidBackup
    case confirmationRequired

    public var errorDescription: String? {
        switch self {
        case .invalidBackup: return "ملف النسخة الاحتياطية غير صالح أو يحتوي بيانات غير مترابطة."
        case .confirmationRequired: return "استبدال البيانات يحتاج تأكيدًا صريحًا."
        }
    }
}

public struct RestoreOutcome: Equatable, Sendable {
    public var snapshot: StudySnapshot
    public var notice: String?
    public init(snapshot: StudySnapshot, notice: String? = nil) {
        self.snapshot = snapshot
        self.notice = notice
    }
}

public struct StudyRepository {
    public static let maximumFileBytes = 80_000_000
    public let fileURL: URL

    public init(fileURL: URL) { self.fileURL = fileURL }

    public var backupURL: URL { URL(fileURLWithPath: fileURL.path + ".bak") }
    public var attachmentDirectory: URL {
        fileURL.deletingLastPathComponent().appendingPathComponent("attachments", isDirectory: true)
    }
    public var quarantineDirectory: URL {
        fileURL.deletingLastPathComponent().appendingPathComponent("quarantine", isDirectory: true)
    }

    public func load() throws -> StudySnapshot {
        try restoringLoad().snapshot
    }

    /// A damaged store is moved aside. The last JSON that decoded is copied back, and the app keeps running.
    public func restoringLoad() -> RestoreOutcome {
        guard FileManager.default.fileExists(atPath: fileURL.path) else {
            return RestoreOutcome(snapshot: .empty)
        }
        if let snapshot = try? hydrate(try Self.read(from: fileURL)) {
            return RestoreOutcome(snapshot: snapshot)
        }
        let quarantined = quarantineCurrentFile()
        if FileManager.default.fileExists(atPath: backupURL.path),
           let snapshot = try? hydrate(try Self.read(from: backupURL)) {
            try? FileManager.default.copyItem(at: backupURL, to: fileURL)
            let where_ = quarantined?.lastPathComponent ?? "quarantine"
            return RestoreOutcome(snapshot: snapshot, notice: "تعذّرت قراءة ملف البيانات. استُعيدت آخر نسخة سليمة، وعُزل الملف التالف (\(where_)).")
        }
        return RestoreOutcome(snapshot: .empty, notice: "تعذّرت قراءة ملف البيانات. عُزل الملف التالف ولم تُقفل الملاحظات.")
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
        let persisted = externalized(snapshot)
        guard persisted.isValid() else { throw StudyStorageError.invalidBackup }
        let bytes = try Self.encode(persisted)
        try FileManager.default.createDirectory(at: fileURL.deletingLastPathComponent(), withIntermediateDirectories: true)
        // New bytes go to unused content-addressed names first, so a failed JSON write leaves the previous store intact.
        try writeAttachments(for: snapshot, manifest: persisted)
        if FileManager.default.fileExists(atPath: fileURL.path), (try? Self.read(from: fileURL)) != nil {
            if FileManager.default.fileExists(atPath: backupURL.path) {
                try FileManager.default.removeItem(at: backupURL)
            }
            try FileManager.default.copyItem(at: fileURL, to: backupURL)
        }
        #if os(iOS)
        try bytes.write(to: fileURL, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        #else
        try bytes.write(to: fileURL, options: .atomic)
        #endif
        try removeUnreferencedAttachments(keeping: referencedFiles(in: persisted, and: backupURL))
    }

    /// Replacement does not write until the caller passes `confirmed: true`.
    public func replace(_ current: StudySnapshot, with incoming: StudySnapshot, confirmed: Bool) throws -> StudySnapshot {
        guard confirmed else { throw StudyStorageError.confirmationRequired }
        return try StudyLibrary.applying(current, incoming: incoming, mode: .replace)
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

    private func externalized(_ snapshot: StudySnapshot) -> StudySnapshot {
        let notes = snapshot.notes.map { note -> StudyNote in
            var stored = note
            stored.imageFile = note.imageJPEG.map { mediaName(noteID: note.id, kind: "image", ext: "jpg", data: $0) }
            stored.audioFile = note.audioM4A.map { mediaName(noteID: note.id, kind: "audio", ext: "m4a", data: $0) }
            stored.imageJPEG = nil
            stored.audioM4A = nil
            return stored
        }
        return StudySnapshot(notes: notes, cards: snapshot.cards, reviews: snapshot.reviews)
    }

    private func writeAttachments(for snapshot: StudySnapshot, manifest: StudySnapshot) throws {
        try FileManager.default.createDirectory(at: attachmentDirectory, withIntermediateDirectories: true)
        for (note, stored) in zip(snapshot.notes, manifest.notes) {
            if let data = note.imageJPEG, let name = stored.imageFile { try write(data, named: name) }
            if let data = note.audioM4A, let name = stored.audioFile { try write(data, named: name) }
        }
    }

    private func write(_ data: Data, named relative: String) throws {
        let url = try safeURL(relative)
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        if !FileManager.default.fileExists(atPath: url.path) {
            #if os(iOS)
            try data.write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
            #else
            try data.write(to: url, options: .atomic)
            #endif
        }
    }

    private func hydrate(_ snapshot: StudySnapshot) -> StudySnapshot {
        let notes = snapshot.notes.map { note -> StudyNote in
            var copy = note
            if copy.imageJPEG == nil, let name = copy.imageFile, let url = try? safeURL(name) {
                copy.imageJPEG = try? Data(contentsOf: url)
            }
            if copy.audioM4A == nil, let name = copy.audioFile, let url = try? safeURL(name) {
                copy.audioM4A = try? Data(contentsOf: url)
            }
            // Memory matches notes built by the app. The file name stays only in the JSON.
            copy.imageFile = nil
            copy.audioFile = nil
            return copy
        }
        return StudySnapshot(notes: notes, cards: snapshot.cards, reviews: snapshot.reviews)
    }

    private func referencedFiles(in snapshot: StudySnapshot, and backup: URL) -> Set<String> {
        var names = Set(snapshot.notes.compactMap(\.imageFile) + snapshot.notes.compactMap(\.audioFile))
        if let previous = try? Self.read(from: backup) {
            names.formUnion(previous.notes.compactMap(\.imageFile))
            names.formUnion(previous.notes.compactMap(\.audioFile))
        }
        return names
    }

    private func removeUnreferencedAttachments(keeping names: Set<String>) throws {
        guard FileManager.default.fileExists(atPath: attachmentDirectory.path) else { return }
        for folder in try FileManager.default.contentsOfDirectory(at: attachmentDirectory, includingPropertiesForKeys: nil) {
            let files = (try? FileManager.default.contentsOfDirectory(at: folder, includingPropertiesForKeys: nil)) ?? []
            for file in files {
                let relative = folder.lastPathComponent + "/" + file.lastPathComponent
                if !names.contains(relative) { try FileManager.default.removeItem(at: file) }
            }
            if let left = try? FileManager.default.contentsOfDirectory(at: folder, includingPropertiesForKeys: nil), left.isEmpty {
                try FileManager.default.removeItem(at: folder)
            }
        }
    }

    private func mediaName(noteID: UUID, kind: String, ext: String, data: Data) -> String {
        let digest = SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
        return "\(noteID.uuidString)/\(kind)-\(digest.prefix(16)).\(ext)"
    }

    private func safeURL(_ relative: String) throws -> URL {
        let parts = relative.split(separator: "/", omittingEmptySubsequences: false).map(String.init)
        guard parts.count == 2, parts.allSatisfy({ !$0.isEmpty && $0 != "." && $0 != ".." && !$0.contains("\\") }) else {
            throw StudyStorageError.invalidBackup
        }
        return attachmentDirectory.appendingPathComponent(parts[0]).appendingPathComponent(parts[1])
    }

    private func quarantineCurrentFile() -> URL? {
        guard FileManager.default.fileExists(atPath: fileURL.path) else { return nil }
        do {
            try FileManager.default.createDirectory(at: quarantineDirectory, withIntermediateDirectories: true)
            let stamp = ISO8601DateFormatter().string(from: Date()).replacingOccurrences(of: ":", with: "-")
            let destination = quarantineDirectory.appendingPathComponent("study-\(stamp).json")
            try FileManager.default.moveItem(at: fileURL, to: destination)
            return destination
        } catch {
            return nil
        }
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
