import Foundation
import XCTest
@testable import RusukhCore

/// Edge cases for Arabic search, wiki links, Q/A extraction, due ordering and quizzes.
final class StudyEngineEdgeCaseTests: XCTestCase {
    func testSearchRequiresEveryTerm() {
        let note = StudyNote(title: "أصول الفقه", body: "القياس والإجماع")
        XCTAssertTrue(StudyEngine.matches(note, query: "الفقه القياس"))
        XCTAssertFalse(StudyEngine.matches(note, query: "الفقه النحو"))
    }

    func testEmptyQueryMatchesEveryNote() {
        // Documents current behaviour: an empty search box shows the whole library.
        XCTAssertTrue(StudyEngine.matches(StudyNote(title: "أي شيء", body: ""), query: "   "))
    }

    func testSearchIsCaseInsensitiveForLatinText() {
        XCTAssertTrue(StudyEngine.matches(StudyNote(title: "Swift Notes", body: ""), query: "swift"))
    }

    func testWikiLinkCannotSpanLines() {
        XCTAssertEqual(StudyEngine.wikiLinks(in: "[[سطر\nآخر]]"), [])
    }

    func testWikiLinksDeduplicateByNormalizedTitle() {
        XCTAssertEqual(StudyEngine.wikiLinks(in: "[[ النحو ]] و [[النحو]] و [[Grammar]] و [[grammar]]"), ["النحو", "Grammar"])
    }

    func testGraphEdgesAreUniqueAndIgnoreUnknownTitles() {
        let target = StudyNote(title: "الصرف", body: "")
        let source = StudyNote(title: "النحو", body: "[[الصرف]] ثم [[الصرف|اسم آخر]] و[[غير موجود]]")
        XCTAssertEqual(StudyEngine.graphEdges([source, target]), [GraphEdge(from: source.id, to: target.id)])
    }

    func testQuestionAnswerAcceptsFullWidthColonAndIgnoresOrphanAnswer() {
        let pairs = StudyEngine.questionAnswers(from: "ج: بلا سؤال\nس： ما المبتدأ؟\nج： اسم مرفوع")
        XCTAssertEqual(pairs.count, 1)
        XCTAssertEqual(pairs.first?.question, "ما المبتدأ؟")
        XCTAssertEqual(pairs.first?.answer, "اسم مرفوع")
    }

    func testQuestionWithEmptyAnswerProducesNoCard() {
        XCTAssertTrue(StudyEngine.questionAnswers(from: "Q: what?\nA:   ").isEmpty)
    }

    func testDueCardsAreOrderedOldestFirstAndExcludeFuture() {
        let now = Date(timeIntervalSince1970: 1_800_000_000)
        let noteID = UUID()
        let late = StudyCard(noteID: noteID, question: "1", answer: "1", dueAt: now.addingTimeInterval(-60))
        let older = StudyCard(noteID: noteID, question: "2", answer: "2", dueAt: now.addingTimeInterval(-3_600))
        let future = StudyCard(noteID: noteID, question: "3", answer: "3", dueAt: now.addingTimeInterval(60))
        XCTAssertEqual(StudyEngine.dueCards([late, future, older], at: now).map(\.id), [older.id, late.id])
    }

    func testQuizRespectsLimitAndDeduplicatesAnswers() {
        let noteID = UUID()
        let cards = [
            StudyCard(noteID: noteID, question: "a", answer: "واحد"),
            StudyCard(noteID: noteID, question: "b", answer: " واحد "),
            StudyCard(noteID: noteID, question: "c", answer: "اثنان"),
            StudyCard(noteID: noteID, question: "d", answer: "ثلاثة"),
        ]
        XCTAssertTrue(StudyEngine.quiz(from: cards, limit: 0).isEmpty)
        let quiz = StudyEngine.quiz(from: cards, limit: 10)
        XCTAssertEqual(quiz.count, 3, "answers equal after whitespace normalisation count once")
        for question in quiz {
            XCTAssertTrue(question.options.contains(question.answer))
            XCTAssertEqual(Set(question.options).count, question.options.count)
        }
    }

    func testSchedulerClampsCorruptedInputs() {
        let card = StudyCard(noteID: UUID(), question: "q", answer: "a",
                             intervalDays: StudyCard.maximumIntervalDays, ease: 3, repetitions: 5)
        let next = StudyEngine.scheduled(card, grade: .easy, now: Date(timeIntervalSince1970: 0))
        XCTAssertLessThanOrEqual(next.intervalDays, StudyCard.maximumIntervalDays)
        XCTAssertLessThanOrEqual(next.ease, 3)
        XCTAssertTrue(StudySnapshot(notes: [StudyNote(id: card.noteID, title: "n", body: "")], cards: [next]).isValid())
    }
}
