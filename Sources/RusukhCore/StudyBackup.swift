import Foundation

public enum StudyBackupError: Error, LocalizedError {
    case stalePreview, storageLocked, operationInProgress, recoveryLimit, invalidRecoveryPoint

    public var errorDescription: String? {
        switch self {
        case .stalePreview: return "تغيرت بياناتك بعد المعاينة. أغلق هذه المعاينة واختر النسخة مرة أخرى."
        case .storageLocked: return "تعذّر قراءة المخزن الحالي. لن نصدّر نسخة فارغة أو نستبدل الملف المتعذر قراءته."
        case .operationInProgress: return "انتظر انتهاء عملية النسخ الحالية ثم حاول مجددًا."
        case .recoveryLimit: return "امتلأت مساحة نقاط الرجوع المخصصة: 5 نسخ أو 200 MB. احفظ نسخة تحتاجها في الملفات ثم احذف نقطة قديمة من الإعدادات."
        case .invalidRecoveryPoint: return "نقطة الرجوع غير متاحة أو ليست ملفًا صالحًا. لم تتغير بياناتك."
        }
    }
}

public struct StudyImportPreview: Identifiable, Sendable {
    public let id = UUID()
    public let sourceName: String
    public let mergePlan: StudyImportPlan?
    public let replacementPlan: StudyImportPlan
    public let mergeProblem: String?

    public init(current: StudySnapshot, incoming: StudySnapshot, sourceName: String) throws {
        self.sourceName = String(sourceName.prefix(200))
        replacementPlan = try StudyImportPlanner.make(current: current, incoming: incoming, mode: .replace)
        do {
            mergePlan = try StudyImportPlanner.make(current: current, incoming: incoming, mode: .mergeKeepingCurrent)
            mergeProblem = nil
        } catch {
            mergePlan = nil
            mergeProblem = error.localizedDescription
        }
    }
}

public struct StudyRecoveryPoint: Identifiable, Equatable, Sendable {
    public let id: UUID
    public let createdAt: Date
    public let fileBytes: Int
}

public struct StudyImportReceipt: Sendable {
    public let changed: Bool
    public let recoveryPoint: StudyRecoveryPoint?
}

extension StudyRepository {
    public static let maximumRecoveryPoints = 5
    public static let maximumRecoveryBytes = 200_000_000

    public var recoveryDirectory: URL {
        fileURL.deletingLastPathComponent().appendingPathComponent("ImportRecovery", isDirectory: true)
    }

    private func recoveryURL(_ id: UUID) -> URL {
        recoveryDirectory.appendingPathComponent("before-import-\(id.uuidString).json")
    }

    public func recoveryPoints() throws -> [StudyRecoveryPoint] {
        guard FileManager.default.fileExists(atPath: recoveryDirectory.path) else { return [] }
        let keys: Set<URLResourceKey> = [.isRegularFileKey, .isSymbolicLinkKey, .fileSizeKey, .creationDateKey, .contentModificationDateKey]
        let files = try FileManager.default.contentsOfDirectory(at: recoveryDirectory, includingPropertiesForKeys: Array(keys))
        return try files.compactMap { url in
            let name = url.lastPathComponent
            guard name.hasPrefix("before-import-"), name.hasSuffix(".json"),
                  let id = UUID(uuidString: String(name.dropFirst(14).dropLast(5))) else { return nil }
            let values = try url.resourceValues(forKeys: keys)
            guard values.isRegularFile == true, values.isSymbolicLink != true,
                  let size = values.fileSize, size >= 0 else { throw StudyBackupError.invalidRecoveryPoint }
            return StudyRecoveryPoint(id: id, createdAt: values.creationDate ?? values.contentModificationDate ?? .distantPast,
                                      fileBytes: size)
        }.sorted { $0.createdAt == $1.createdAt ? $0.id.uuidString < $1.id.uuidString : $0.createdAt > $1.createdAt }
    }

    private func checkedRecoveryURL(_ point: StudyRecoveryPoint) throws -> URL {
        let url = recoveryURL(point.id)
        let values = try url.resourceValues(forKeys: [.isRegularFileKey, .isSymbolicLinkKey])
        guard values.isRegularFile == true, values.isSymbolicLink != true else { throw StudyBackupError.invalidRecoveryPoint }
        return url
    }

    public func readRecovery(_ point: StudyRecoveryPoint) throws -> StudySnapshot {
        try Self.read(from: checkedRecoveryURL(point))
    }

    public func exportRecovery(_ point: StudyRecoveryPoint) throws -> URL {
        // Validate before presenting a file as a readable backup.
        let bytes = try Self.readBytes(from: checkedRecoveryURL(point))
        _ = try Self.decode(bytes)
        let destination = FileManager.default.temporaryDirectory.appendingPathComponent("rusukh-recovery-\(UUID().uuidString).json")
        try Self.writeProtected(bytes, to: destination)
        return destination
    }

    public func deleteRecovery(_ point: StudyRecoveryPoint) throws {
        try FileManager.default.removeItem(at: checkedRecoveryURL(point))
    }

    public static func export(_ snapshot: StudySnapshot, prefix: String = "rusukh-native-backup") throws -> URL {
        let data = try encode(snapshot)
        let destination = FileManager.default.temporaryDirectory.appendingPathComponent("\(prefix)-\(UUID().uuidString).json")
        try writeProtected(data, to: destination)
        return destination
    }

    /// Single-writer contract: LibraryStore blocks edits while this runs off UI.
    /// A failed attempt may leave its own valid checkpoint, never replace an older one.
    public func applyImport(_ plan: StudyImportPlan) throws -> StudyImportReceipt {
        try applyImport(plan, writeCurrent: { try Self.writeProtected($0, to: fileURL) })
    }

    // Narrow test seam for a failure after the real checkpoint was written.
    func applyImport(_ plan: StudyImportPlan, writeCurrent: (Data) throws -> Void) throws -> StudyImportReceipt {
        guard try load() == plan.current else { throw StudyBackupError.stalePreview }
        guard plan.hasChanges else { return StudyImportReceipt(changed: false, recoveryPoint: nil) }
        let resultBytes = try Self.encode(plan.result)
        // Preserve the original file, including formatting and unknown fields.
        // A never-saved empty library still needs a valid recovery document.
        let currentBytes = FileManager.default.fileExists(atPath: fileURL.path)
            ? try Self.readBytes(from: fileURL) : try Self.encode(plan.current)
        guard try Self.decode(currentBytes) == plan.current else { throw StudyBackupError.stalePreview }
        let previous = try recoveryPoints()
        guard previous.count < Self.maximumRecoveryPoints else { throw StudyBackupError.recoveryLimit }
        var remaining = Self.maximumRecoveryBytes - currentBytes.count
        for point in previous {
            guard point.fileBytes >= 0, point.fileBytes <= remaining else { throw StudyBackupError.recoveryLimit }
            remaining -= point.fileBytes
        }
        try FileManager.default.createDirectory(at: recoveryDirectory, withIntermediateDirectories: true)
        let checkpointID = UUID()
        let checkpointURL = recoveryURL(checkpointID)
        try Self.writeProtected(currentBytes, to: checkpointURL)
        guard try Self.read(from: checkpointURL) == plan.current else { throw StudyBackupError.invalidRecoveryPoint }
        // Verify again after writing the checkpoint. No old checkpoint is deleted.
        guard try load() == plan.current else { throw StudyBackupError.stalePreview }
        try writeCurrent(resultBytes)
        let point = StudyRecoveryPoint(id: checkpointID, createdAt: Date(), fileBytes: currentBytes.count)
        return StudyImportReceipt(changed: true, recoveryPoint: point)
    }

    static func writeProtected(_ data: Data, to url: URL) throws {
        #if os(iOS)
        try data.write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        #else
        try data.write(to: url, options: .atomic)
        #endif
    }
}
