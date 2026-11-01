import Foundation
import XCTest
@testable import RusukhCore

final class StudyBackupTests: XCTestCase {
    private enum InjectedFailure: Error { case write }
    private let now = Date(timeIntervalSince1970: 1_700_000_000)

    private func repository() throws -> StudyRepository {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("rusukh-backup-tests-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        addTeardownBlock { try? FileManager.default.removeItem(at: directory) }
        return StudyRepository(fileURL: directory.appendingPathComponent("study.json"))
    }

    private func snapshot(_ title: String) throws -> StudySnapshot {
        let note = StudyNote(title: title, body: "محتوى محفوظ \(title)", createdAt: now, updatedAt: now,
                             imageJPEG: Data([1, 2, 3]), audioM4A: Data([4, 5, 6]))
        let initial = ReviewScheduler.newCard(noteID: note.id, question: "سؤال \(title)", answer: "جواب", now: now)
        let reviewed = try ReviewScheduler.scheduled(initial, grade: .good, now: now)
        let event = ReviewEvent(cardID: reviewed.id, grade: .good, at: now)
        return StudySnapshot(notes: [note], cards: [reviewed], reviews: [event])
    }

    private func replacement(_ current: StudySnapshot, _ incoming: StudySnapshot) throws -> StudyImportPlan {
        try StudyImportPlanner.make(current: current, incoming: incoming, mode: .replace)
    }

    private func recoveryURL(_ point: StudyRecoveryPoint, in repository: StudyRepository) -> URL {
        repository.recoveryDirectory.appendingPathComponent("before-import-\(point.id.uuidString).json")
    }

    private func assertBackupError(_ expected: StudyBackupError, _ action: () throws -> Void,
                                   file: StaticString = #filePath, line: UInt = #line) {
        XCTAssertThrowsError(try action(), file: file, line: line) { error in
            guard let backupError = error as? StudyBackupError else {
                return XCTFail("Expected StudyBackupError, received \(error)", file: file, line: line)
            }
            // The public error is intentionally not Equatable.
            XCTAssertEqual(String(describing: backupError), String(describing: expected), file: file, line: line)
        }
    }

    func testNoOpDoesNotWriteCurrentOrCreateRecoveryDirectory() throws {
        let repository = try repository()
        let current = try snapshot("أ")
        try repository.save(current)
        let originalBytes = try Data(contentsOf: repository.fileURL)
        var writeCalls = 0
        let receipt = try repository.applyImport(replacement(current, current), writeCurrent: { _ in writeCalls += 1 })

        XCTAssertFalse(receipt.changed)
        XCTAssertNil(receipt.recoveryPoint)
        XCTAssertEqual(writeCalls, 0)
        XCTAssertEqual(try Data(contentsOf: repository.fileURL), originalBytes)
        XCTAssertFalse(FileManager.default.fileExists(atPath: repository.recoveryDirectory.path))
        XCTAssertEqual(try repository.recoveryPoints(), [])
    }

    func testEmptyNoOpDoesNotCreateAnUnsavedLibrary() throws {
        let repository = try repository()
        let receipt = try repository.applyImport(replacement(.empty, .empty))

        XCTAssertFalse(receipt.changed)
        XCTAssertNil(receipt.recoveryPoint)
        XCTAssertFalse(FileManager.default.fileExists(atPath: repository.fileURL.path))
        XCTAssertFalse(FileManager.default.fileExists(atPath: repository.recoveryDirectory.path))
    }

    func testSuccessfulImportReopensCurrentAndFullRecoveryIncludingFSRSAndMedia() throws {
        let repository = try repository()
        let before = try snapshot("أ"), after = try snapshot("ب")
        try repository.save(before)
        let receipt = try repository.applyImport(replacement(before, after))
        let point = try XCTUnwrap(receipt.recoveryPoint)

        XCTAssertTrue(receipt.changed)
        XCTAssertEqual(try StudyRepository(fileURL: repository.fileURL).load(), after)
        XCTAssertEqual(try repository.readRecovery(point), before)
        XCTAssertEqual(try repository.recoveryPoints().map(\.id), [point.id])
        XCTAssertEqual(point.fileBytes, try Data(contentsOf: recoveryURL(point, in: repository)).count)
        XCTAssertNotNil(try repository.readRecovery(point).cards.first?.fsrs)
    }

    func testImportIntoUnsavedLibraryHasAnEmptyRecoveryThatCanBeRestored() throws {
        let repository = try repository()
        let incoming = try snapshot("أ")
        let receipt = try repository.applyImport(replacement(.empty, incoming))
        let point = try XCTUnwrap(receipt.recoveryPoint)

        XCTAssertEqual(try repository.load(), incoming)
        XCTAssertEqual(try repository.readRecovery(point), .empty)
        _ = try repository.applyImport(replacement(incoming, repository.readRecovery(point)))
        XCTAssertEqual(try repository.load(), .empty)
        XCTAssertEqual(try repository.recoveryPoints().count, 2)
    }

    func testFailedSecondImportKeepsCurrentAndBothIndependentRecoveries() throws {
        let repository = try repository()
        let a = try snapshot("أ"), b = try snapshot("ب"), c = try snapshot("ج")
        try repository.save(a)
        let first = try repository.applyImport(replacement(a, b))
        let firstPoint = try XCTUnwrap(first.recoveryPoint)
        let originalRecoveryBytes = try Data(contentsOf: recoveryURL(firstPoint, in: repository))
        let currentBytes = try Data(contentsOf: repository.fileURL)
        var writeCalls = 0

        XCTAssertThrowsError(try repository.applyImport(replacement(b, c), writeCurrent: { proposedBytes in
            writeCalls += 1
            XCTAssertEqual(try StudyRepository.decode(proposedBytes), c)
            XCTAssertEqual(try repository.recoveryPoints().count, 2)
            throw InjectedFailure.write
        })) { error in
            guard case InjectedFailure.write = error else { return XCTFail("Unexpected error: \(error)") }
        }

        XCTAssertEqual(writeCalls, 1)
        XCTAssertEqual(try Data(contentsOf: repository.fileURL), currentBytes)
        XCTAssertEqual(try repository.load(), b)
        let points = try repository.recoveryPoints()
        XCTAssertEqual(points.count, 2)
        XCTAssertEqual(try repository.readRecovery(firstPoint), a)
        XCTAssertEqual(try Data(contentsOf: recoveryURL(firstPoint, in: repository)), originalRecoveryBytes)
        let secondPoint = try XCTUnwrap(points.first { $0.id != firstPoint.id })
        XCTAssertEqual(try repository.readRecovery(secondPoint), b)
    }

    func testRecoveryDirectoryObstructionFailsBeforeCurrentWrite() throws {
        let repository = try repository()
        let current = try snapshot("أ"), incoming = try snapshot("ب")
        try repository.save(current)
        let originalBytes = try Data(contentsOf: repository.fileURL)
        let obstruction = Data("reserved-file".utf8)
        try obstruction.write(to: repository.recoveryDirectory)
        var writeCalls = 0

        XCTAssertThrowsError(try repository.applyImport(replacement(current, incoming), writeCurrent: { _ in writeCalls += 1 }))
        XCTAssertEqual(writeCalls, 0)
        XCTAssertEqual(try Data(contentsOf: repository.fileURL), originalBytes)
        XCTAssertEqual(try Data(contentsOf: repository.recoveryDirectory), obstruction)
    }

    func testStaleDiskRejectsPreviewBeforeAnyRecoveryOrCurrentWrite() throws {
        let repository = try repository()
        let original = try snapshot("أ"), incoming = try snapshot("ب"), latest = try snapshot("ج")
        try repository.save(original)
        let preview = try replacement(original, incoming)
        try repository.save(latest)
        let latestBytes = try Data(contentsOf: repository.fileURL)
        var writeCalls = 0

        assertBackupError(.stalePreview) {
            _ = try repository.applyImport(preview, writeCurrent: { _ in writeCalls += 1 })
        }
        XCTAssertEqual(writeCalls, 0)
        XCTAssertEqual(try Data(contentsOf: repository.fileURL), latestBytes)
        XCTAssertFalse(FileManager.default.fileExists(atPath: repository.recoveryDirectory.path))
    }

    func testRecoveryCapacityPreservesAllPointsUntilExplicitExportAndDeletion() throws {
        let repository = try repository()
        var current = try snapshot("الأصل")
        try repository.save(current)
        var retained: [(point: StudyRecoveryPoint, snapshot: StudySnapshot)] = []
        for index in 0..<StudyRepository.maximumRecoveryPoints {
            let incoming = try snapshot("وارد \(index)")
            let receipt = try repository.applyImport(replacement(current, incoming))
            retained.append((try XCTUnwrap(receipt.recoveryPoint), current))
            current = incoming
        }
        let next = try snapshot("بعد الحد")
        let preview = try replacement(current, next)
        let currentBytes = try Data(contentsOf: repository.fileURL)
        assertBackupError(.recoveryLimit) { _ = try repository.applyImport(preview) }
        XCTAssertEqual(try Data(contentsOf: repository.fileURL), currentBytes)
        XCTAssertEqual(Set(try repository.recoveryPoints().map(\.id)), Set(retained.map { $0.point.id }))
        for retainedPoint in retained {
            XCTAssertEqual(try repository.readRecovery(retainedPoint.point), retainedPoint.snapshot)
        }

        let noOp = try repository.applyImport(replacement(current, current))
        XCTAssertFalse(noOp.changed)
        XCTAssertNil(noOp.recoveryPoint)
        XCTAssertEqual(try repository.recoveryPoints().count, StudyRepository.maximumRecoveryPoints)

        let oldest = retained.removeFirst()
        let exportURL = try repository.exportRecovery(oldest.point)
        addTeardownBlock { try? FileManager.default.removeItem(at: exportURL) }
        XCTAssertEqual(try StudyRepository.read(from: exportURL), oldest.snapshot)
        XCTAssertEqual(try repository.recoveryPoints().count, StudyRepository.maximumRecoveryPoints)
        try repository.deleteRecovery(oldest.point)
        XCTAssertFalse(FileManager.default.fileExists(atPath: recoveryURL(oldest.point, in: repository).path))

        let retry = try repository.applyImport(preview)
        let newPoint = try XCTUnwrap(retry.recoveryPoint)
        XCTAssertEqual(try repository.load(), next)
        XCTAssertEqual(try repository.readRecovery(newPoint), current)
        XCTAssertEqual(try repository.recoveryPoints().count, StudyRepository.maximumRecoveryPoints)
        for retainedPoint in retained {
            XCTAssertEqual(try repository.readRecovery(retainedPoint.point), retainedPoint.snapshot)
        }
        XCTAssertEqual(try StudyRepository.read(from: exportURL), oldest.snapshot)
    }

    func testRestoreCreatesCheckpointOfCurrentEditsAndCanBeUndone() throws {
        let repository = try repository()
        let a = try snapshot("أ"), b = try snapshot("ب")
        try repository.save(a)
        let imported = try repository.applyImport(replacement(a, b))
        let originalPoint = try XCTUnwrap(imported.recoveryPoint)
        var edited = b
        edited.notes[0].body = "تحرير بعد الاستيراد يجب ألا يضيع"
        try repository.save(edited)

        let restored = try repository.applyImport(replacement(edited, repository.readRecovery(originalPoint)))
        let editsPoint = try XCTUnwrap(restored.recoveryPoint)
        XCTAssertEqual(try StudyRepository(fileURL: repository.fileURL).load(), a)
        XCTAssertEqual(try repository.readRecovery(editsPoint), edited)
        XCTAssertEqual(try repository.readRecovery(originalPoint), a)

        _ = try repository.applyImport(replacement(a, repository.readRecovery(editsPoint)))
        XCTAssertEqual(try StudyRepository(fileURL: repository.fileURL).load(), edited)
        XCTAssertEqual(try repository.recoveryPoints().count, 3)
        XCTAssertEqual(try repository.readRecovery(originalPoint), a)
        XCTAssertEqual(try repository.readRecovery(editsPoint), edited)
    }

    func testCheckpointPreservesExactOriginalBytesAndUnknownFields() throws {
        let repository = try repository()
        let current = try snapshot("أ"), incoming = try snapshot("ب")
        let encoded = try StudyRepository.encode(current)
        var object = try XCTUnwrap(JSONSerialization.jsonObject(with: encoded) as? [String: Any])
        object["futureField"] = ["keep": "هذه بيانات إضافية"]
        let compact = try JSONSerialization.data(withJSONObject: object, options: [.sortedKeys])
        var raw = Data(" \n\t".utf8)
        raw.append(compact)
        raw.append(Data("\n  ".utf8))
        try raw.write(to: repository.fileURL)
        XCTAssertEqual(try repository.load(), current)

        let receipt = try repository.applyImport(replacement(current, incoming))
        let point = try XCTUnwrap(receipt.recoveryPoint)
        XCTAssertEqual(try Data(contentsOf: recoveryURL(point, in: repository)), raw)
        XCTAssertEqual(point.fileBytes, raw.count)
        XCTAssertEqual(try repository.load(), incoming)
        let exported = try repository.exportRecovery(point)
        addTeardownBlock { try? FileManager.default.removeItem(at: exported) }
        XCTAssertEqual(try Data(contentsOf: exported), raw)
    }

    func testRecoveryByteLimitDoesNotPruneFilesOrWriteCurrent() throws {
        let repository = try repository()
        let current = try snapshot("أ"), incoming = try snapshot("ب")
        try repository.save(current)
        try FileManager.default.createDirectory(at: repository.recoveryDirectory, withIntermediateDirectories: true)
        let existingURL = repository.recoveryDirectory.appendingPathComponent("before-import-\(UUID().uuidString).json")
        XCTAssertTrue(FileManager.default.createFile(atPath: existingURL.path, contents: Data()))
        let handle = try FileHandle(forWritingTo: existingURL)
        defer { try? handle.close() }
        // Sparse fixture tests the metadata budget without allocating a 200 MB payload.
        try handle.truncate(atOffset: UInt64(StudyRepository.maximumRecoveryBytes))
        let originalBytes = try Data(contentsOf: repository.fileURL)
        var writeCalls = 0

        assertBackupError(.recoveryLimit) {
            _ = try repository.applyImport(replacement(current, incoming), writeCurrent: { _ in writeCalls += 1 })
        }
        XCTAssertEqual(writeCalls, 0)
        XCTAssertEqual(try Data(contentsOf: repository.fileURL), originalBytes)
        XCTAssertEqual(try repository.recoveryPoints().count, 1)
        XCTAssertEqual(try existingURL.resourceValues(forKeys: [.fileSizeKey]).fileSize, StudyRepository.maximumRecoveryBytes)
    }

    func testCorruptCurrentCannotBeOverwrittenButExistingRecoveryCanBeExported() throws {
        let repository = try repository()
        let a = try snapshot("أ"), b = try snapshot("ب")
        try repository.save(a)
        let imported = try repository.applyImport(replacement(a, b))
        let point = try XCTUnwrap(imported.recoveryPoint)
        let restore = try replacement(b, a)
        let corruptBytes = Data("broken backup".utf8)
        try corruptBytes.write(to: repository.fileURL)

        XCTAssertThrowsError(try repository.applyImport(restore))
        XCTAssertEqual(try Data(contentsOf: repository.fileURL), corruptBytes)
        XCTAssertEqual(try repository.recoveryPoints().map(\.id), [point.id])
        let exportURL = try repository.exportRecovery(point)
        addTeardownBlock { try? FileManager.default.removeItem(at: exportURL) }
        XCTAssertEqual(try StudyRepository.read(from: exportURL), a)
        XCTAssertEqual(try Data(contentsOf: repository.fileURL), corruptBytes)
    }
}
