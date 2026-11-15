import Foundation
import XCTest
@testable import RusukhCore

final class ReliabilityTests: XCTestCase {
    func testMaximumImportedScheduleRemainsSaveable() throws {
        let note = StudyNote(title: "حدود الجدولة", body: "")
        let card = StudyCard(noteID: note.id, question: "س", answer: "ج", intervalDays: 365_000, ease: 5, repetitions: 100_000)
        for grade in ReviewGrade.allCases {
            let result = StudySnapshot(notes: [note], cards: [StudyEngine.scheduled(card, grade: grade)])
            XCTAssertNoThrow(try StudyRepository.encode(result), "\(grade)")
        }
    }
    func testAmbiguousLinkDoesNotChooseAnArbitraryNote() {
        let source = StudyNote(title: "بداية", body: "[[متكرر]]")
        let a = StudyNote(title: "متكرر", body: "")
        let b = StudyNote(title: " متكرر ", body: "")
        XCTAssertTrue(StudyEngine.graphEdges([source, a, b]).isEmpty)
        XCTAssertTrue(StudyEngine.graphEdges([b, source, a]).isEmpty)
    }
    func testArabicSearchIgnoresDiacriticsAndTatweel() {
        let note = StudyNote(title: "رُسُوخ", body: "تَعَلُّـم يبقى")
        XCTAssertTrue(StudyEngine.matches(note, query: " رسوخ  تعلم "))
        XCTAssertFalse(StudyEngine.matches(note, query: "غير موجود"))
    }
    func testOversizedSavePreservesReadableData() throws {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: folder) }
        let repository = StudyRepository(fileURL: folder.appendingPathComponent("study.json"))
        let original = StudySnapshot(notes: [StudyNote(title: "محفوظ", body: "بياناتي")])
        try repository.save(original)
        let image = Data(repeating: 0xAB, count: 4_000_000)
        let tooLarge = StudySnapshot(notes: (0..<16).map { StudyNote(title: "صورة \($0)", body: "", imageJPEG: image) })
        XCTAssertTrue(tooLarge.isValid())
        try repository.save(tooLarge)
        let stored = try Data(contentsOf: repository.fileURL)
        XCTAssertLessThan(stored.count, 1_000_000)
        XCTAssertFalse(String(decoding: stored, as: UTF8.self).contains("imageJPEG"))
        XCTAssertEqual(try repository.load(), tooLarge)
    }
    func testOversizedFileRejectedBeforeDecoding() throws {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: url) }
        XCTAssertTrue(FileManager.default.createFile(atPath: url.path, contents: nil))
        let handle = try FileHandle(forWritingTo: url)
        try handle.truncate(atOffset: 80_000_000)
        try handle.close()
        XCTAssertThrowsError(try StudyRepository.read(from: url))
    }
    func testPreviouslyValidVersionOneCardsRemainReadable() throws {
        let note = StudyNote(title: "ملاحظة", body: "")
        let card = StudyCard(noteID: note.id, question: " \n", answer: "ج")
        let existing = StudySnapshot(notes: [note], cards: [card])
        let encoder = JSONEncoder()
        let previousVersionData = try encoder.encode(existing)
        XCTAssertEqual(try StudyRepository.decode(previousVersionData), existing)
    }
    func testSearchPerformanceForThousandNotes() {
        let notes = (0..<1000).map { StudyNote(title: "ملاحظة \($0)", body: "تَعَلُّم رُسُوخ يبقى") }
        measure { XCTAssertEqual(notes.filter { StudyEngine.matches($0, query: "تعلم رسوخ") }.count, 1000) }
    }
    #if os(macOS)
    func testThousandNoteBackupMemory() {
        let snapshot = StudySnapshot(notes: (0..<1000).map { StudyNote(title: "ملاحظة \($0)", body: String(repeating: "معرفة محلية ", count: 100)) })
        measure(metrics: [XCTMemoryMetric()]) {
            do {
                let data = try StudyRepository.encode(snapshot)
                XCTAssertEqual(try StudyRepository.decode(data).notes.count, 1000)
            } catch { XCTFail("Backup failed: \(error)") }
        }
    }
    #endif
}
