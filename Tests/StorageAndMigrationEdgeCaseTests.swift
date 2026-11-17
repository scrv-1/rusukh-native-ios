import Foundation
import XCTest
@testable import RusukhCore

/// Edge cases for local storage, backup import/export and legacy Expo migration.
/// Added for the OSS-readiness pass; all run on Linux and macOS.
final class StorageAndMigrationEdgeCaseTests: XCTestCase {
    private func temporaryURL() -> URL {
        FileManager.default.temporaryDirectory
            .appendingPathComponent("rusukh-tests-\(UUID().uuidString)")
            .appendingPathComponent("library.json")
    }

    private func sampleSnapshot() -> StudySnapshot {
        let note = StudyNote(title: "الفقه", body: "س: ما الطهارة؟\nج: رفع الحدث")
        let card = StudyCard(noteID: note.id, question: "ما الطهارة؟", answer: "رفع الحدث")
        return StudySnapshot(notes: [note], cards: [card], reviews: [ReviewEvent(cardID: card.id, grade: .good)])
    }

    private func legacyJSON(format: String = "rusukh-backup", version: Int = 1,
                            notes: String = #"[{"id":"n1","title":"t","body":"b","createdAt":1790000000000,"updatedAt":1790000000000}]"#,
                            cards: String = "[]", reviews: String = "[]") -> Data {
        Data(#"{"format":"\#(format)","version":\#(version),"notes":\#(notes),"cards":\#(cards),"reviews":\#(reviews)}"#.utf8)
    }

    // MARK: Local storage

    func testLoadMissingFileReturnsEmptyLibrary() throws {
        let url = temporaryURL()
        XCTAssertEqual(try StudyRepository(fileURL: url).load(), .empty)
        XCTAssertFalse(FileManager.default.fileExists(atPath: url.path), "load must not create files")
    }

    func testSaveCreatesMissingParentDirectory() throws {
        let url = temporaryURL()
        defer { try? FileManager.default.removeItem(at: url.deletingLastPathComponent()) }
        let snapshot = sampleSnapshot()
        try StudyRepository(fileURL: url).save(snapshot)
        XCTAssertEqual(try StudyRepository(fileURL: url).load(), snapshot)
    }

    func testCorruptedStoreThrowsInsteadOfReturningEmpty() throws {
        // A damaged library must surface an error, never silently look like an empty library
        // (which the app could then overwrite).
        let url = temporaryURL()
        defer { try? FileManager.default.removeItem(at: url.deletingLastPathComponent()) }
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try Data("{\"format\":\"rusukh-native-backup\",\"version\":1,\"notes\":[".utf8).write(to: url)
        XCTAssertThrowsError(try StudyRepository(fileURL: url).load())
    }

    func testInvalidSnapshotDoesNotOverwriteExistingStore() throws {
        let url = temporaryURL()
        defer { try? FileManager.default.removeItem(at: url.deletingLastPathComponent()) }
        let repository = StudyRepository(fileURL: url)
        let good = sampleSnapshot()
        try repository.save(good)
        let dangling = StudySnapshot(cards: [StudyCard(noteID: UUID(), question: "q", answer: "a")])
        XCTAssertThrowsError(try repository.save(dangling))
        XCTAssertEqual(try repository.load(), good)
    }

    func testExportIsDeterministicAndRoundTrips() throws {
        let snapshot = sampleSnapshot()
        let first = try StudyRepository.encode(snapshot)
        let second = try StudyRepository.encode(snapshot)
        XCTAssertEqual(first, second, "sorted keys keep exports diff-friendly and stable")
        XCTAssertEqual(try StudyRepository.decode(first), snapshot)
    }

    func testUnknownBackupFormatRejected() {
        let bytes = Data(#"{"format":"other-app","version":1,"notes":[],"cards":[],"reviews":[]}"#.utf8)
        XCTAssertThrowsError(try StudyRepository.decode(bytes))
    }

    func testFutureBackupVersionRejected() throws {
        var json = try XCTUnwrap(String(data: StudyRepository.encode(.empty), encoding: .utf8))
        json = json.replacingOccurrences(of: "\"version\" : 1", with: "\"version\" : 3")
        XCTAssertTrue(json.contains("\"version\" : 3"))
        XCTAssertThrowsError(try StudyRepository.decode(Data(json.utf8)))
    }

    func testSnapshotVersionReflectsFSRSUsage() {
        XCTAssertEqual(sampleSnapshot().version, 1)
        XCTAssertEqual(StudySnapshot.empty.version, 1)
    }

    func testNoteAudioAboveLimitRejected() {
        let note = StudyNote(title: "صوت", body: "", audioM4A: Data(count: 2_000_001))
        XCTAssertFalse(StudySnapshot(notes: [note]).isValid())
    }

    func testCardOutOfRangeValuesRejected() {
        let note = StudyNote(title: "n", body: "")
        for card in [
            StudyCard(noteID: note.id, question: "q", answer: "a", intervalDays: -1),
            StudyCard(noteID: note.id, question: "q", answer: "a", ease: .nan),
            StudyCard(noteID: note.id, question: "q", answer: "a", ease: 0.5),
            StudyCard(noteID: note.id, question: "q", answer: "a", repetitions: StudyCard.maximumRepetitions + 1),
            StudyCard(noteID: note.id, question: "", answer: "a"),
        ] {
            XCTAssertFalse(StudySnapshot(notes: [note], cards: [card]).isValid())
        }
    }

    // MARK: Legacy Expo migration

    func testLegacyEmptyBackupMigratesToEmptyLibrary() throws {
        let snapshot = try LegacyExpoMigration.converted(from: legacyJSON(notes: "[]"))
        XCTAssertTrue(snapshot.notes.isEmpty && snapshot.cards.isEmpty && snapshot.reviews.isEmpty)
        XCTAssertTrue(snapshot.isValid())
    }

    func testLegacyWrongFormatOrVersionRejected() {
        XCTAssertThrowsError(try LegacyExpoMigration.converted(from: legacyJSON(format: "rusukh-native-backup")))
        XCTAssertThrowsError(try LegacyExpoMigration.converted(from: legacyJSON(version: 2)))
    }

    func testLegacyDuplicateNoteIDsRejected() {
        let notes = #"[{"id":"n1","title":"a","body":"","createdAt":0,"updatedAt":0},{"id":"n1","title":"b","body":"","createdAt":0,"updatedAt":0}]"#
        XCTAssertThrowsError(try LegacyExpoMigration.converted(from: legacyJSON(notes: notes)))
    }

    func testLegacyNegativeTimestampRejected() {
        let notes = #"[{"id":"n1","title":"a","body":"","createdAt":-5,"updatedAt":0}]"#
        XCTAssertThrowsError(try LegacyExpoMigration.converted(from: legacyJSON(notes: notes)))
    }

    func testLegacyUnknownGradeRejected() {
        let cards = #"[{"id":"c1","noteId":"n1","question":"q","answer":"a","dueAt":0,"intervalDays":0,"ease":2.5,"repetitions":0,"updatedAt":0}]"#
        let reviews = #"[{"id":"r1","cardId":"c1","grade":"perfect","reviewedAt":0}]"#
        XCTAssertThrowsError(try LegacyExpoMigration.converted(from: legacyJSON(cards: cards, reviews: reviews)))
    }

    func testLegacyMillisecondsConvertedToSeconds() throws {
        let snapshot = try LegacyExpoMigration.converted(from: legacyJSON())
        XCTAssertEqual(snapshot.notes[0].createdAt.timeIntervalSince1970, 1_790_000_000, accuracy: 0.001)
    }
}
