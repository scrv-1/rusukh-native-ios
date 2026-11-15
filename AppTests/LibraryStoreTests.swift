import Foundation
import XCTest
@testable import RusukhNative

@MainActor
final class LibraryStoreTests: XCTestCase {
    private func temporaryRepository() throws -> StudyRepository {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        addTeardownBlock { try? FileManager.default.removeItem(at: folder) }
        return StudyRepository(fileURL: folder.appendingPathComponent("study.json"))
    }

    func testNewCardReviewAndReopenPreserveFSRSState() throws {
        let repository = try temporaryRepository()
        let library = LibraryStore(repository: repository)
        let note = try XCTUnwrap(library.saveNote(title: "العلم", body: "", imageJPEG: nil))
        XCTAssertTrue(library.addCard(noteID: note.id, question: "س", answer: "ج"))
        let original = try XCTUnwrap(library.snapshot.cards.first)
        XCTAssertNotNil(original.fsrs)
        library.review(card: original, grade: .good)
        XCTAssertNil(library.message)
        let reopened = LibraryStore(repository: repository)
        XCTAssertEqual(reopened.snapshot, library.snapshot)
        XCTAssertEqual(reopened.snapshot.version, 2)
        XCTAssertEqual(reopened.snapshot.cards[0].fsrs?.card.learningSteps, 1)
        XCTAssertEqual(reopened.snapshot.reviews.count, 1)
    }

    func testAddingFSRSCardDoesNotRewriteLegacySchedule() throws {
        let repository = try temporaryRepository()
        let note = StudyNote(title: "قديم", body: "", audioM4A: Data([1, 2, 3]))
        let legacy = StudyCard(noteID: note.id, question: "س", answer: "ج", intervalDays: 9, repetitions: 4)
        try repository.save(StudySnapshot(notes: [note], cards: [legacy]))
        let originalBytes = try Data(contentsOf: repository.fileURL)
        let library = LibraryStore(repository: repository)
        XCTAssertEqual(try Data(contentsOf: repository.fileURL), originalBytes)
        XCTAssertTrue(library.addCard(noteID: note.id, question: "جديد", answer: "حالة"))
        let reopened = try repository.load()
        XCTAssertEqual(reopened.cards.first { $0.id == legacy.id }, legacy)
        XCTAssertEqual(reopened.notes, [note])
        XCTAssertEqual(reopened.version, 2)
    }

    func testMalformedFSRSImportLeavesActualStoreBytesUntouched() throws {
        let repository = try temporaryRepository()
        let library = LibraryStore(repository: repository)
        let note = try XCTUnwrap(library.saveNote(title: "محفوظ", body: "لا يستبدل", imageJPEG: nil))
        XCTAssertTrue(library.addCard(noteID: note.id, question: "س", answer: "ج"))
        let originalBytes = try Data(contentsOf: repository.fileURL)
        let originalSnapshot = library.snapshot
        var json = try XCTUnwrap(JSONSerialization.jsonObject(with: originalBytes) as? [String: Any])
        var cards = json["cards"] as! [[String: Any]]
        var memory = cards[0]["fsrs"] as! [String: Any]
        var state = memory["card"] as! [String: Any]
        state.removeValue(forKey: "learningSteps")
        memory["card"] = state; cards[0]["fsrs"] = memory; json["cards"] = cards
        let badURL = repository.fileURL.deletingLastPathComponent().appendingPathComponent("bad.json")
        try JSONSerialization.data(withJSONObject: json).write(to: badURL)
        library.importFromFile(badURL)
        XCTAssertNotNil(library.message)
        XCTAssertEqual(library.snapshot, originalSnapshot)
        XCTAssertEqual(try Data(contentsOf: repository.fileURL), originalBytes)
    }

    func testReplaceImportWaitsForConfirmationAndKeepsThePreviousCopy() throws {
        let repository = try temporaryRepository()
        let library = LibraryStore(repository: repository)
        XCTAssertNotNil(library.saveNote(title: "أصلي", body: "يبقى حتى التأكيد", imageJPEG: nil))
        let incoming = StudySnapshot(notes: [StudyNote(title: "وارد", body: "")])
        let url = repository.fileURL.deletingLastPathComponent().appendingPathComponent("incoming.json")
        try StudyRepository.encode(incoming).write(to: url)
        library.importFromFile(url, mode: .replace)
        XCTAssertEqual(library.snapshot.notes.map(\.title), ["أصلي"])
        XCTAssertEqual(library.pendingImport?.noteCount, 1)
        library.confirmPendingImport()
        XCTAssertEqual(library.snapshot.notes.map(\.title), ["وارد"])
        XCTAssertNil(library.pendingImport)
        let backup = try StudyRepository.read(from: repository.backupURL)
        XCTAssertEqual(backup.notes.map(\.title), ["أصلي"])
    }

    func testFailedSaveDoesNotPublishUnsavedNote() throws {
        let repository = try temporaryRepository()
        let library = LibraryStore(repository: repository)
        // Replace the empty destination directory with a file: a real I/O failure.
        let folder = repository.fileURL.deletingLastPathComponent()
        try FileManager.default.removeItem(at: folder)
        try Data("not a directory".utf8).write(to: folder)
        XCTAssertNil(library.saveNote(title: "لم يحفظ", body: "", imageJPEG: nil))
        XCTAssertTrue(library.snapshot.notes.isEmpty)
        XCTAssertNotNil(library.message)
    }
}
