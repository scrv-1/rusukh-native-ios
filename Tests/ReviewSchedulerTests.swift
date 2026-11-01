import Foundation
import XCTest
@testable import RusukhCore

final class ReviewSchedulerTests: XCTestCase {
    private let now = Date(timeIntervalSince1970: 1_700_000_000)

    func testInitialGradesUseVersionSixReferenceValues() throws {
        let card = ReviewScheduler.newCard(noteID: UUID(), question: "س", answer: "ج", now: now)
        let expectedStability = [0.212, 1.2931, 2.3065, 8.2956]
        let expectedMinutes: [Double] = [1, 6, 10, 8 * 24 * 60]
        for (index, grade) in ReviewGrade.allCases.enumerated() {
            let result = try ReviewScheduler.scheduled(card, grade: grade, now: now)
            XCTAssertEqual(result.fsrs!.card.stability, expectedStability[index], accuracy: 0.000001)
            XCTAssertEqual(result.dueAt.timeIntervalSince(now), expectedMinutes[index] * 60, accuracy: 0.01)
            XCTAssertEqual(result.repetitions, 1)
            XCTAssertEqual(result.id, card.id)
        }
    }

    func testReferenceSequenceSurvivesBackupAndReopenAtEveryReview() throws {
        let note = StudyNote(title: "ثبات الذاكرة", body: "")
        var card = ReviewScheduler.newCard(noteID: note.id, question: "س", answer: "ج", now: now)
        var date = now
        var intervals: [Int] = []
        let grades: [ReviewGrade] = [.good, .good, .good, .good, .good, .good, .again, .again, .good, .good, .good, .good, .good]
        for grade in grades {
            card = try ReviewScheduler.scheduled(card, grade: grade, now: date)
            let snapshot = StudySnapshot(notes: [note], cards: [card])
            XCTAssertEqual(snapshot.version, 2)
            let reopened = try StudyRepository.decode(StudyRepository.encode(snapshot))
            XCTAssertEqual(reopened, snapshot)
            card = reopened.cards[0]
            intervals.append(card.intervalDays)
            date = card.dueAt
        }
        XCTAssertEqual(intervals, [0, 2, 11, 46, 163, 498, 0, 0, 2, 4, 7, 12, 21])
    }

    func testLegacyBackupKeepsScheduleAndUsesLegacyAlgorithm() throws {
        let note = StudyNote(title: "قديم", body: "", audioM4A: Data([1, 2, 3]))
        let card = StudyCard(noteID: note.id, question: "س", answer: "ج", dueAt: now,
                             intervalDays: 12, repetitions: 3)
        let original = StudySnapshot(notes: [note], cards: [card])
        let reopened = try StudyRepository.decode(StudyRepository.encode(original))
        XCTAssertEqual(reopened.version, 1)
        XCTAssertEqual(reopened, original)
        XCTAssertNil(reopened.cards[0].fsrs)
        XCTAssertEqual(try ReviewScheduler.scheduled(card, grade: .good, now: now),
                       StudyEngine.scheduled(card, grade: .good, now: now))
    }

    func testVersionOneCannotSilentlyCarryNewMemoryState() {
        let note = StudyNote(title: "نسخة", body: "")
        var snapshot = StudySnapshot(notes: [note], cards: [ReviewScheduler.newCard(noteID: note.id, question: "س", answer: "ج", now: now)])
        snapshot.version = 1
        XCTAssertThrowsError(try StudyRepository.encode(snapshot))
    }

    func testMalformedOrUnknownMemoryStateRejectedWithoutScheduling() throws {
        let card = ReviewScheduler.newCard(noteID: UUID(), question: "س", answer: "ج", now: now)
        var bad = card
        bad.fsrs!.parameterSet = "unknown"
        XCTAssertThrowsError(try ReviewScheduler.scheduled(bad, grade: .good, now: now))
        bad = card
        bad.fsrs!.card.stability = .nan
        XCTAssertThrowsError(try ReviewScheduler.scheduled(bad, grade: .good, now: now))
        bad = card
        bad.fsrs!.card.due = now.addingTimeInterval(1)
        XCTAssertThrowsError(try ReviewScheduler.scheduled(bad, grade: .good, now: now))
    }

    func testClockRollbackDoesNotOverwriteMemoryState() throws {
        let card = try ReviewScheduler.scheduled(ReviewScheduler.newCard(noteID: UUID(), question: "س", answer: "ج", now: now), grade: .good, now: now)
        XCTAssertThrowsError(try ReviewScheduler.scheduled(card, grade: .good, now: now.addingTimeInterval(-1)))
        XCTAssertEqual(card.fsrs!.card.lastReview, now)
    }

    func testMissingOrNullLearningStateIsRejectedOnImport() throws {
        let note = StudyNote(title: "مكتوب", body: "")
        let card = try ReviewScheduler.scheduled(ReviewScheduler.newCard(noteID: note.id, question: "س", answer: "ج", now: now), grade: .good, now: now)
        let bytes = try StudyRepository.encode(StudySnapshot(notes: [note], cards: [card]))
        for nullValue in [false, true] {
            var json = try XCTUnwrap(JSONSerialization.jsonObject(with: bytes) as? [String: Any])
            var cards = json["cards"] as! [[String: Any]]
            var memory = cards[0]["fsrs"] as! [String: Any]
            var state = memory["card"] as! [String: Any]
            if nullValue { state["learningSteps"] = NSNull() } else { state.removeValue(forKey: "learningSteps") }
            memory["card"] = state; cards[0]["fsrs"] = memory; json["cards"] = cards
            XCTAssertThrowsError(try StudyRepository.decode(JSONSerialization.data(withJSONObject: json)))
        }
    }

    func testConflictingRepetitionCountAndInvalidRelearningStepRejected() throws {
        var card = try ReviewScheduler.scheduled(ReviewScheduler.newCard(noteID: UUID(), question: "س", answer: "ج", now: now), grade: .good, now: now)
        card.fsrs!.card.reps = 0
        XCTAssertThrowsError(try ReviewScheduler.scheduled(card, grade: .good, now: now))
        card.fsrs!.card.reps = card.repetitions
        card.fsrs!.card.state = .relearning
        card.fsrs!.card.learningSteps = 1
        XCTAssertThrowsError(try ReviewScheduler.scheduled(card, grade: .again, now: now))
    }

    func testMaximumIntervalRemainsReviewableForEveryGrade() throws {
        var card = try ReviewScheduler.scheduled(ReviewScheduler.newCard(noteID: UUID(), question: "س", answer: "ج", now: now), grade: .easy, now: now)
        card.dueAt = now
        card.intervalDays = 36_500
        card.fsrs!.card.due = now
        card.fsrs!.card.scheduledDays = 36_500
        card.fsrs!.card.stability = 36_500
        card.fsrs!.card.difficulty = 1
        card.fsrs!.card.lastReview = now.addingTimeInterval(-36_500 * 86_400)
        for grade in ReviewGrade.allCases {
            let next = try ReviewScheduler.scheduled(card, grade: grade, now: now)
            XCTAssertLessThanOrEqual(next.intervalDays, 36_500)
            XCTAssertLessThanOrEqual(next.dueAt.timeIntervalSince(now), 36_500 * 86_400)
        }
    }
}
