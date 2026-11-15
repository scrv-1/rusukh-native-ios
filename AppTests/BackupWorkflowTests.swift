import Foundation
import XCTest
@testable import RusukhNative

/// Hosted iOS integration tests. These exercise real JSON files and LibraryStore;
/// the system document picker is covered separately by UI tests.
@MainActor
final class BackupWorkflowTests: XCTestCase {
    private let fixtureDate = Date(timeIntervalSince1970: 1_790_000_000)

    private func fixture(_ title: String) throws -> StudySnapshot {
        let note = StudyNote(title: title, body: "س: ما المعرفة؟\nج: تعلّم يبقى",
                             createdAt: fixtureDate, updatedAt: fixtureDate,
                             imageJPEG: Data([0xff, 0xd8, 0xff, 0xd9]),
                             audioM4A: Data([1, 2, 3, 4]))
        let card = try ReviewScheduler.scheduled(
            ReviewScheduler.newCard(noteID: note.id, question: "ما المعرفة؟",
                                    answer: "تعلّم يبقى", now: fixtureDate),
            grade: .good, now: fixtureDate)
        return StudySnapshot(notes: [note], cards: [card],
                             reviews: [ReviewEvent(cardID: card.id, grade: .good, at: fixtureDate)])
    }

    private func workspace(_ initial: StudySnapshot) throws -> (URL, StudyRepository, LibraryStore) {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        addTeardownBlock { try? FileManager.default.removeItem(at: root) }
        let repository = StudyRepository(fileURL: root.appendingPathComponent("store/study.json"))
        try repository.save(initial)
        return (root, repository, LibraryStore(repository: repository))
    }

    private func writeIncoming(_ snapshot: StudySnapshot, in root: URL) throws -> URL {
        let url = root.appendingPathComponent("incoming.json")
        try StudyRepository.encode(snapshot).write(to: url, options: .atomic)
        return url
    }

    func testPrepareAndCancelLeaveStoreAndRecoveryFilesUntouched() async throws {
        let original = try fixture("الحالية")
        let (root, repository, library) = try workspace(original)
        let incoming = try writeIncoming(fixture("الواردة"), in: root)
        let originalBytes = try Data(contentsOf: repository.fileURL)
        let originalFiles = try FileManager.default.subpathsOfDirectory(atPath: root.path).sorted()

        let preview = try await library.prepareImport(from: incoming)
        XCTAssertNotNil(preview.mergePlan)
        XCTAssertNil(preview.mergeProblem)
        XCTAssertEqual(preview.sourceName, "incoming.json")
        // Dismissing a preview does not call applyImport; no file may change.
        XCTAssertEqual(library.snapshot, original)
        XCTAssertEqual(try Data(contentsOf: repository.fileURL), originalBytes)
        XCTAssertEqual(try FileManager.default.subpathsOfDirectory(atPath: root.path).sorted(), originalFiles)
        XCTAssertTrue(library.recoveryPoints.isEmpty)
    }

    func testMergePreservesBothLibrariesAndTheirFSRSStateAfterReopen() async throws {
        let original = try fixture("الحالية")
        let incoming = try fixture("الواردة")
        let (root, repository, library) = try workspace(original)
        let url = try writeIncoming(incoming, in: root)
        let preview = try await library.prepareImport(from: url)
        let receipt = try await library.applyImport(XCTUnwrap(preview.mergePlan))
        XCTAssertTrue(receipt.changed)
        XCTAssertNotNil(receipt.recoveryPoint)

        let expected = StudySnapshot(notes: original.notes + incoming.notes,
                                     cards: original.cards + incoming.cards,
                                     reviews: original.reviews + incoming.reviews)
        XCTAssertEqual(Dictionary(uniqueKeysWithValues: library.snapshot.notes.map { ($0.id, $0) }),
                       Dictionary(uniqueKeysWithValues: expected.notes.map { ($0.id, $0) }))
        XCTAssertEqual(Dictionary(uniqueKeysWithValues: library.snapshot.cards.map { ($0.id, $0) }),
                       Dictionary(uniqueKeysWithValues: expected.cards.map { ($0.id, $0) }))
        XCTAssertEqual(Dictionary(uniqueKeysWithValues: library.snapshot.reviews.map { ($0.id, $0) }),
                       Dictionary(uniqueKeysWithValues: expected.reviews.map { ($0.id, $0) }))
        XCTAssertEqual(library.snapshot.version, 2)
        let reopened = LibraryStore(repository: repository)
        XCTAssertEqual(reopened.snapshot, library.snapshot)
        XCTAssertNotNil(reopened.snapshot.cards[0].fsrs)
        XCTAssertNotNil(reopened.snapshot.cards[1].fsrs)
        try await reopened.refreshRecoveryPoints()
        XCTAssertFalse(reopened.recoveryPoints.isEmpty)
    }

    func testReplacementCanBeRestoredFromRecoveryAfterRelaunch() async throws {
        let original = try fixture("قبل الاستبدال")
        let incoming = try fixture("بعد الاستبدال")
        let (root, repository, library) = try workspace(original)
        let url = try writeIncoming(incoming, in: root)
        let preview = try await library.prepareImport(from: url)
        let receipt = try await library.applyImport(preview.replacementPlan)
        let recovery = try XCTUnwrap(receipt.recoveryPoint)
        XCTAssertTrue(receipt.changed)
        XCTAssertEqual(library.snapshot, incoming)
        XCTAssertEqual(try repository.load(), incoming)

        let reopened = LibraryStore(repository: repository)
        try await reopened.refreshRecoveryPoints()
        XCTAssertFalse(reopened.recoveryPoints.isEmpty)
        let restoration = try await reopened.prepareRecovery(recovery)
        // Merely reviewing an available recovery point cannot restore it.
        XCTAssertEqual(try repository.load(), incoming)
        let restoreReceipt = try await reopened.applyImport(restoration.replacementPlan)
        XCTAssertTrue(restoreReceipt.changed)
        XCTAssertNotNil(restoreReceipt.recoveryPoint)
        XCTAssertEqual(reopened.snapshot, original)
        XCTAssertEqual(LibraryStore(repository: repository).snapshot, original)
    }

    func testEditedCurrentNoteInvalidatesPreviouslyPreparedImport() async throws {
        let original = try fixture("ملاحظة")
        let (root, repository, library) = try workspace(original)
        let url = try writeIncoming(fixture("واردة"), in: root)
        let preview = try await library.prepareImport(from: url)
        let note = original.notes[0]
        XCTAssertNotNil(library.saveNote(id: note.id, title: "تعديل بعد المعاينة",
                                        body: "يجب ألا يضيع", imageJPEG: note.imageJPEG,
                                        audioM4A: note.audioM4A))
        let edited = library.snapshot
        let editedBytes = try Data(contentsOf: repository.fileURL)

        do {
            _ = try await library.applyImport(preview.replacementPlan)
            XCTFail("An old preview must not overwrite an edit made after preparation")
        } catch {
            XCTAssertEqual(library.snapshot, edited)
            XCTAssertEqual(try Data(contentsOf: repository.fileURL), editedBytes)
        }
    }

    func testChangingExternalFileAfterPreviewDoesNotChangeApprovedContent() async throws {
        let original = try fixture("الحالية")
        let approved = try fixture("المحتوى الذي تمت معاينته")
        let (root, repository, library) = try workspace(original)
        let url = try writeIncoming(approved, in: root)
        let preview = try await library.prepareImport(from: url)
        let changed = try fixture("تغير الملف بعد المعاينة")
        try StudyRepository.encode(changed).write(to: url, options: .atomic)

        let receipt = try await library.applyImport(preview.replacementPlan)
        XCTAssertTrue(receipt.changed)
        XCTAssertEqual(library.snapshot, approved)
        XCTAssertEqual(try repository.load(), approved)
        XCTAssertNotEqual(library.snapshot, changed)
    }

    func testLockedStoreCannotExportAnEmptySnapshotOrPrepareImport() async throws {
        let (root, repository, _) = try workspace(fixture("ملف سليم سابقًا"))
        let damaged = Data("{damaged-json".utf8)
        try damaged.write(to: repository.fileURL, options: .atomic)
        let library = LibraryStore(repository: repository)
        XCTAssertTrue(library.storageLocked)
        let incoming = try writeIncoming(fixture("واردة"), in: root)

        do {
            let exported = try await library.exportToTemporaryFile()
            try? FileManager.default.removeItem(at: exported)
            XCTFail("Export must not misrepresent an unreadable store as an empty backup")
        } catch { }
        do {
            _ = try await library.prepareImport(from: incoming)
            XCTFail("Ordinary import must not overwrite a locked, damaged store")
        } catch { }
        XCTAssertTrue(library.storageLocked)
        XCTAssertEqual(try Data(contentsOf: repository.fileURL), damaged)
    }

    func testRealStoragePathFailureDoesNotPublishPreparedReplacement() async throws {
        let original = try fixture("محفوظة")
        let incoming = try fixture("لم تُحفظ")
        let (root, repository, library) = try workspace(original)
        let url = try writeIncoming(incoming, in: root)
        let preview = try await library.prepareImport(from: url)
        let originalBytes = try Data(contentsOf: repository.fileURL)
        let storeFolder = repository.fileURL.deletingLastPathComponent()
        let preservedFolder = root.appendingPathComponent("preserved-store")
        // A real filesystem error, without relying on permissions (CI may run
        // as root). Preserve the old file and block its former parent path.
        try FileManager.default.moveItem(at: storeFolder, to: preservedFolder)
        let obstruction = Data("not a directory".utf8)
        try obstruction.write(to: storeFolder)

        do {
            _ = try await library.applyImport(preview.replacementPlan)
            XCTFail("Failed storage access must not publish the prepared replacement")
        } catch {
            XCTAssertEqual(library.snapshot, original)
            XCTAssertEqual(try Data(contentsOf: preservedFolder.appendingPathComponent("study.json")), originalBytes)
            XCTAssertEqual(try Data(contentsOf: storeFolder), obstruction)
        }
    }
}
