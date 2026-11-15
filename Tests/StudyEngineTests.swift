import Foundation
import XCTest
@testable import RusukhCore

private struct SplitMix64: RandomNumberGenerator {
    var state: UInt64
    init(seed: UInt64) { state = seed }
    mutating func next() -> UInt64 {
        state &+= 0x9E3779B97F4A7C15
        var z = state
        z = (z ^ (z >> 30)) &* 0xBF58476D1CE4E5B9
        z = (z ^ (z >> 27)) &* 0x94D049BB133111EB
        return z ^ (z >> 31)
    }
}

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
    func testBacklinksFollowAliasAndIgnoreSelfAndDuplicates() {
        let target = StudyNote(title: "التكرار المتباعد", body: "")
        let alias = StudyNote(title: "مصدر", body: "انظر [[التكرار المتباعد|راجع]]")
        let selfLink = StudyNote(id: target.id, title: target.title, body: "[[التكرار المتباعد]]")
        let duplicateA = StudyNote(title: "مكرر", body: "")
        let duplicateB = StudyNote(title: "مكرر", body: "")
        let linker = StudyNote(title: "رابط", body: "[[مكرر]]")
        XCTAssertEqual(StudyEngine.backlinks(to: target, in: [target, alias]).map(\.id), [alias.id])
        XCTAssertTrue(StudyEngine.backlinks(to: selfLink, in: [selfLink]).isEmpty)
        XCTAssertTrue(StudyEngine.backlinks(to: duplicateA, in: [duplicateA, duplicateB, linker]).isEmpty)
    }
    func testRenameRewritesUniqueLinkAndKeepsAlias() {
        let target = StudyNote(title: "اسم قديم", body: "")
        let other = StudyNote(title: "مصدر", body: "راجع [[اسم قديم|هنا]] و[[ثابت]]")
        let now = Date(timeIntervalSince1970: 1_700_000_000)
        let renamed = StudyEngine.renamedNotes([target, other], id: target.id, to: "اسم جديد", now: now)
        XCTAssertEqual(renamed?[0].title, "اسم جديد")
        XCTAssertEqual(renamed?[1].body, "راجع [[اسم جديد|هنا]] و[[ثابت]]")
    }
    func testRenameDoesNotRetargetWhenTitlesCollide() {
        let target = StudyNote(title: "مشترك", body: "")
        let twin = StudyNote(title: "مشترك", body: "")
        let other = StudyNote(title: "مصدر", body: "[[مشترك]]")
        let renamed = StudyEngine.renamedNotes([target, twin, other], id: target.id, to: "اسم جديد", now: Date(timeIntervalSince1970: 10))
        XCTAssertEqual(renamed?.first { $0.id == target.id }?.title, "اسم جديد")
        XCTAssertEqual(renamed?.first { $0.id == other.id }?.body, "[[مشترك]]")
    }
    func testImportMergeKeepsCurrentAndNewerDuplicate() throws {
        let older = Date(timeIntervalSince1970: 10)
        let newer = Date(timeIntervalSince1970: 20)
        let kept = StudyNote(title: "حالي", body: "", updatedAt: newer)
        let stale = StudyNote(id: kept.id, title: "قديم", body: "لا", updatedAt: older)
        let added = StudyNote(title: "وارد", body: "")
        let current = StudySnapshot(notes: [kept])
        let incoming = StudySnapshot(notes: [stale, added])
        let merged = try StudyLibrary.applying(current, incoming: incoming, mode: .merge)
        XCTAssertEqual(merged.notes.map(\.id), [kept.id, added.id])
        XCTAssertEqual(merged.notes[0].title, "حالي")
        let replaced = try StudyLibrary.applying(current, incoming: incoming, mode: .replace)
        XCTAssertEqual(replaced.notes.map(\.id), [stale.id, added.id])
        var invalid = StudySnapshot()
        invalid.version = 9
        XCTAssertThrowsError(try StudyLibrary.applying(invalid, incoming: .empty, mode: .replace))
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
    func testSearchFoldsAlefAndTaAndYaaWithoutChangingLinkIdentity() {
        let note = StudyNote(title: "إبراهيم", body: "صلاة على")
        XCTAssertTrue(StudyEngine.matches(note, query: "ابراهيم"))
        XCTAssertTrue(StudyEngine.matches(note, query: "صلاه"))
        XCTAssertTrue(StudyEngine.matches(note, query: "علي"))
        XCTAssertNotEqual(StudyEngine.normalized("إبراهيم"), StudyEngine.normalized("ابراهيم"))
        XCTAssertNotEqual(StudyEngine.normalized("صلاة"), StudyEngine.normalized("صلاه"))
        XCTAssertNotEqual(StudyEngine.searchKey("صلاة"), StudyEngine.normalized("صلاة"))
    }
    func testQuizShuffleIsStableForASeedAndKeepsTheAnswer() {
        let id = UUID()
        let cards = [
            StudyCard(noteID: id, question: "1", answer: "واحد"),
            StudyCard(noteID: id, question: "2", answer: "اثنان"),
            StudyCard(noteID: id, question: "3", answer: "ثلاثة"),
            StudyCard(noteID: id, question: "4", answer: "أربعة")
        ]
        var first = SplitMix64(seed: 11)
        var second = SplitMix64(seed: 11)
        var other = SplitMix64(seed: 99)
        let left = StudyEngine.quiz(from: cards, using: &first)
        let right = StudyEngine.quiz(from: cards, using: &second)
        let shuffled = StudyEngine.quiz(from: cards, using: &other)
        XCTAssertEqual(left, right)
        XCTAssertNotEqual(left.map(\.options), shuffled.map(\.options))
        for question in left {
            XCTAssertTrue(question.options.contains(question.answer))
            XCTAssertEqual(Set(question.options).count, question.options.count)
        }
    }
    func testEditingACardKeepsFSRSIdentity() throws {
        let noteID = UUID()
        let now = Date(timeIntervalSince1970: 1_700_000_000)
        var card = ReviewScheduler.newCard(noteID: noteID, question: "ما الرسوخ؟", answer: "ثبات", now: now)
        card = try ReviewScheduler.scheduled(card, grade: .good, now: now)
        let memory = try XCTUnwrap(card.fsrs)
        let edited = StudyEngine.syncedCards(existing: [card], noteID: noteID, pairs: [("ما الرسوخ؟", "ثبات المعرفة")], now: now.addingTimeInterval(10))
        XCTAssertEqual(edited.count, 1)
        XCTAssertEqual(edited[0].id, card.id)
        XCTAssertEqual(edited[0].answer, "ثبات المعرفة")
        XCTAssertEqual(edited[0].fsrs, memory)
        let reworded = StudyEngine.syncedCards(existing: edited, noteID: noteID, pairs: [("ما هو الرسوخ؟", "ثبات المعرفة")], now: now.addingTimeInterval(20))
        XCTAssertEqual(reworded[0].id, card.id)
        XCTAssertEqual(reworded[0].question, "ما هو الرسوخ؟")
        XCTAssertEqual(reworded[0].fsrs, memory)
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
