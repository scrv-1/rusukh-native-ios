import Foundation
import XCTest
@testable import RusukhCore

final class AudioStorageTests: XCTestCase {
    // Tests storage bytes, not microphone capture or AAC playback.
    func testAudioBytesSurviveSaveReopenAndExport() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let note = StudyNote(title: "تسجيل", body: "ملاحظاتي", audioM4A: Data([0, 7, 128, 255]))
        let snapshot = StudySnapshot(notes: [note])
        let repository = StudyRepository(fileURL: directory.appendingPathComponent("study.json"))
        try repository.save(snapshot)
        XCTAssertEqual(try repository.load(), snapshot)
        XCTAssertEqual(try StudyRepository.decode(StudyRepository.encode(snapshot)), snapshot)
    }
    func testOldBackupWithoutAudioFieldStillLoads() throws {
        let snapshot = StudySnapshot(notes: [StudyNote(title: "قديمة", body: "أبقي بياناتي")])
        let data = try StudyRepository.encode(snapshot)
        XCTAssertFalse(String(decoding: data, as: UTF8.self).contains("audioM4A"))
        XCTAssertEqual(try StudyRepository.decode(data), snapshot)
    }
    func testOversizedAudioCannotReplaceExistingStore() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let repository = StudyRepository(fileURL: directory.appendingPathComponent("study.json"))
        let original = StudySnapshot(notes: [StudyNote(title: "أصلية", body: "بيانات")])
        try repository.save(original)
        var edited = original
        edited.notes[0].audioM4A = Data(count: 2_000_001)
        XCTAssertThrowsError(try repository.save(edited))
        XCTAssertEqual(try repository.load(), original)
    }
}
