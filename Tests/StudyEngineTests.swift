import Foundation
import XCTest
@testable import RusukhCore

final class StudyEngineTests: XCTestCase {
    func testNormalizeArabicTitle() {
        XCTAssertEqual(StudyEngine.normalized("  تعلم   نشط  "), "تعلم نشط")
    }
    func testWikiLinksAliasAndDuplicates() {
        XCTAssertEqual(StudyEngine.wikiLinks(in: "[[أول|اختصار]] [[أول]] [[ ثان ]]"), ["أول", "ثان"])
    }
    func testInvalidAndSelfLinks() {
        let a = StudyNote(title: "ألف", body: "[[ألف]] [[باء]] [[مجهول]]")
        let b = StudyNote(title: "باء", body: "[[ألف]]")
        XCTAssertEqual(Set(StudyEngine.graphEdges([a,b])), Set([GraphEdge(from: a.id, to: b.id), GraphEdge(from: b.id, to: a.id)]))
    }
    func testQuestionAnswerArabicEnglish() {
        let entries = StudyEngine.questionAnswers(from: "س: ما العلم؟\nج: المعرفة\nQ: Define recall\nA: Retrieval")
        XCTAssertEqual(entries.count, 2)
        XCTAssertEqual(entries[0].answer, "المعرفة")
        XCTAssertEqual(entries[1].question, "Define recall")
    }
    func testQuestionAnswerMissingAnswer() {
        XCTAssertEqual(StudyEngine.questionAnswers(from: "س: سؤال فقط").count, 0)
    }
    func testCardDueNow() {
        let card = StudyCard(noteID: UUID(), question: "?", answer: "A")
        XCTAssertEqual(StudyEngine.dueCards([card], at: Date().addingTimeInterval(1)).count, 1)
    }
    func testAgainTenMinutes() {
        let now = Date(timeIntervalSince1970: 1_700_000_000)
        let card = StudyCard(noteID: UUID(), question: "?", answer: "A")
        let updated = StudyEngine.scheduled(card, grade: .again, now: now)
        XCTAssertEqual(updated.dueAt.timeIntervalSince(now), 600, accuracy: 0.01)
        XCTAssertEqual(updated.repetitions, 0)
    }
    func testGoodInitialDay() {
        let c = StudyCard(noteID: UUID(), question: "?", answer: "A")
        XCTAssertEqual(StudyEngine.scheduled(c, grade: .good).intervalDays, 1)
    }
    func testEasyInitialFourDays() {
        let c = StudyCard(noteID: UUID(), question: "?", answer: "A")
        XCTAssertEqual(StudyEngine.scheduled(c, grade: .easy).intervalDays, 4)
    }
    func testEaseLowerBound() {
        let c = StudyCard(noteID: UUID(), question: "?", answer: "A", ease: 1.3)
        XCTAssertEqual(StudyEngine.scheduled(c, grade: .again).ease, 1.3)
    }
    func testQuizWithSingleCardUnavailable() {
        let c = StudyCard(noteID: UUID(), question: "?", answer: "A")
        XCTAssertTrue(StudyEngine.quiz(from: [c]).isEmpty)
    }
    func testQuizDistinctChoices() {
        let id = UUID()
        let questions = StudyEngine.quiz(from: [StudyCard(noteID: id, question: "1", answer: "one"), StudyCard(noteID: id, question: "2", answer: "two")])
        XCTAssertEqual(questions.count, 2)
        XCTAssertTrue(questions[0].options.contains("one"))
        XCTAssertTrue(questions[0].options.contains("two"))
    }
    func testBackupRoundTrip() throws {
        let note = StudyNote(title: "حساب", body: "س: 1+1؟\nج: 2", imageJPEG: Data([0xff,0xd8,0xff]))
        let c = StudyCard(noteID: note.id, question: "1+1?", answer: "2")
        let s = StudySnapshot(notes: [note], cards: [c])
        let r = try StudyRepository.decode(StudyRepository.encode(s))
        XCTAssertEqual(r, s)
    }
    func testBadReferenceRejected() {
        let c = StudyCard(noteID: UUID(), question: "?", answer: "A")
        XCTAssertFalse(StudySnapshot(cards: [c]).isValid())
    }
    func testDuplicateNoteRejected() {
        let n = StudyNote(title: "ملاحظة", body: "")
        XCTAssertFalse(StudySnapshot(notes: [n,n]).isValid())
    }
    func testEmptyTitleRejected() {
        XCTAssertFalse(StudySnapshot(notes: [StudyNote(title: "  ", body: "")]).isValid())
    }
    func testHugeImageRejected() {
        let n = StudyNote(title: "صورة", body: "", imageJPEG: Data(count: 4_000_001))
        XCTAssertFalse(StudySnapshot(notes: [n]).isValid())
    }
    func testAtomicSaveAndLoad() throws {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: folder) }
        let repo = StudyRepository(fileURL: folder.appendingPathComponent("snapshot.json"))
        XCTAssertEqual(try repo.load(), .empty)
        let snapshot = StudySnapshot(notes: [StudyNote(title: "ملاحظة", body: "اختبار")])
        try repo.save(snapshot)
        XCTAssertEqual(try repo.load(), snapshot)
    }
    func testRejectCorruptedJSON() {
        XCTAssertThrowsError(try StudyRepository.decode(Data("bad json".utf8)))
    }

    func testLegacyExpoBackupMigration() throws {
        let legacy = #"{"format":"rusukh-backup","version":1,"notes":[{"id":"n1","title":"قديم","body":"س: ما هذا؟\nج: قديم","createdAt":1790000000000,"updatedAt":1790000000000}],"cards":[{"id":"c1","noteId":"n1","question":"ما هذا؟","answer":"قديم","dueAt":1790000000000,"intervalDays":0,"ease":2.5,"repetitions":0,"updatedAt":1790000000000}],"reviews":[{"id":"r1","cardId":"c1","grade":"good","reviewedAt":1790000000000}]}"#
        let imported = try StudyRepository.decode(Data(legacy.utf8))
        XCTAssertEqual(imported.notes.count, 1)
        XCTAssertEqual(imported.cards.count, 1)
        XCTAssertEqual(imported.reviews.count, 1)
        XCTAssertEqual(imported.cards[0].noteID, imported.notes[0].id)
        XCTAssertEqual(imported.reviews[0].cardID, imported.cards[0].id)
    }

    func testLegacyRejectsDanglingReferences() {
        let legacy = #"{"format":"rusukh-backup","version":1,"notes":[],"cards":[{"id":"c1","noteId":"missing","question":"q","answer":"a","dueAt":1790000000000,"intervalDays":0,"ease":2.5,"repetitions":0,"updatedAt":1790000000000}],"reviews":[]}"#
        XCTAssertThrowsError(try StudyRepository.decode(Data(legacy.utf8)))
    }
    func testReviewEventRequiresCard() {
        XCTAssertFalse(StudySnapshot(reviews: [ReviewEvent(cardID: UUID(), grade: .good)]).isValid())
    }
}
