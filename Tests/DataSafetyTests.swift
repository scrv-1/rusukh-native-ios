import Foundation
import XCTest
@testable import RusukhCore

final class DataSafetyTests: XCTestCase {
    func testThirtyRecordingsStayOutsideTheJSONAndRoundTrip() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let audio = Data(count: 2_000_000)
        let notes = (0..<30).map { StudyNote(title: "تسجيل \($0)", body: "مذكرة", audioM4A: audio) }
        let snapshot = StudySnapshot(notes: notes)
        XCTAssertTrue(snapshot.isValid())
        let repository = StudyRepository(fileURL: directory.appendingPathComponent("study.json"))
        try repository.save(snapshot)
        let stored = try Data(contentsOf: repository.fileURL)
        XCTAssertLessThan(stored.count, 500_000)
        XCTAssertFalse(String(decoding: stored, as: UTF8.self).contains("audioM4A"))
        XCTAssertTrue(String(decoding: stored, as: UTF8.self).contains("audioFile"))
        let loaded = try repository.load()
        XCTAssertEqual(loaded.notes.count, 30)
        XCTAssertEqual(loaded.notes.map(\.audioM4A), notes.map(\.audioM4A))
        XCTAssertThrowsError(try StudyRepository.encode(snapshot))
    }

    func testInlineAudioMigratesOnTheNextSave() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let note = StudyNote(title: "قديم", body: "صوت", audioM4A: Data([9, 8, 7, 6]))
        let repository = StudyRepository(fileURL: directory.appendingPathComponent("study.json"))
        let legacy = try StudyRepository.encode(StudySnapshot(notes: [note]))
        try legacy.write(to: repository.fileURL)
        XCTAssertEqual(try repository.load().notes.first?.audioM4A, Data([9, 8, 7, 6]))
        try repository.save(try repository.load())
        let stored = try String(contentsOf: repository.fileURL, encoding: .utf8)
        XCTAssertFalse(stored.contains("audioM4A"))
        XCTAssertEqual(try repository.load().notes.first?.audioM4A, Data([9, 8, 7, 6]))
    }

    func testCorruptFileRestoresTheLastGoodBackupAndDoesNotLockTheStore() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let repository = StudyRepository(fileURL: directory.appendingPathComponent("study.json"))
        let first = StudySnapshot(notes: [StudyNote(title: "أول", body: "سليم")])
        let second = StudySnapshot(notes: [StudyNote(title: "ثان", body: "أحدث")])
        try repository.save(first)
        try repository.save(second)
        try Data("not json".utf8).write(to: repository.fileURL)
        let restored = repository.restoringLoad()
        XCTAssertEqual(restored.snapshot, first)
        XCTAssertNotNil(restored.notice)
        let quarantined = try FileManager.default.contentsOfDirectory(at: repository.quarantineDirectory, includingPropertiesForKeys: nil)
        XCTAssertEqual(quarantined.count, 1)
        try repository.save(StudySnapshot(notes: [StudyNote(title: "بعد الاستعادة", body: "")]))
        XCTAssertEqual(try repository.load().notes.first?.title, "بعد الاستعادة")
    }

    func testCorruptFileWithoutBackupOpensEmpty() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let repository = StudyRepository(fileURL: directory.appendingPathComponent("study.json"))
        try Data("broken".utf8).write(to: repository.fileURL)
        let restored = repository.restoringLoad()
        XCTAssertEqual(restored.snapshot, .empty)
        XCTAssertNotNil(restored.notice)
        XCTAssertFalse(FileManager.default.fileExists(atPath: repository.fileURL.path))
    }

    func testReplaceRequiresConfirmationAndConfirmedReplaceKeepsBackup() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let repository = StudyRepository(fileURL: directory.appendingPathComponent("study.json"))
        let current = StudySnapshot(notes: [StudyNote(title: "حالي", body: "لا يضيع")])
        try repository.save(current)
        let incoming = StudySnapshot(notes: [StudyNote(title: "وارد", body: "")])
        XCTAssertThrowsError(try repository.replace(current, with: incoming, confirmed: false))
        XCTAssertEqual(try repository.load(), current)
        let replaced = try repository.replace(current, with: incoming, confirmed: true)
        try repository.save(replaced)
        XCTAssertEqual(try repository.load().notes.map(\.title), ["وارد"])
        let backup = try StudyRepository.read(from: repository.backupURL)
        XCTAssertEqual(backup.notes.map(\.title), ["حالي"])
    }
}
