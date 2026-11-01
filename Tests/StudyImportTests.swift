import Foundation
import XCTest
@testable import RusukhCore

final class StudyImportTests: XCTestCase {
    private let now = Date(timeIntervalSince1970: 1_700_000_000)

    private func note(_ title: String, body: String = "") -> StudyNote {
        StudyNote(title: title, body: body, createdAt: now, updatedAt: now,
                  imageJPEG: Data([1, 2, 3]), audioM4A: Data([4, 5, 6]))
    }

    private func card(for note: StudyNote) -> StudyCard {
        StudyCard(noteID: note.id, question: "س؟", answer: "ج", dueAt: now, updatedAt: now)
    }

    func testDisjointMergePreservesRecordsMediaAndInputOrdering() throws {
        let old = note("محفوظ"), added = note("وارد")
        let oldCard = card(for: old), addedCard = card(for: added)
        let oldEvent = ReviewEvent(cardID: oldCard.id, grade: .hard, at: now)
        let addedEvent = ReviewEvent(cardID: addedCard.id, grade: .easy, at: now)
        let current = StudySnapshot(notes: [old], cards: [oldCard], reviews: [oldEvent])
        let incoming = StudySnapshot(notes: [added], cards: [addedCard], reviews: [addedEvent])
        let plan = try StudyImportPlanner.make(current: current, incoming: incoming, mode: .mergeKeepingCurrent)

        XCTAssertEqual(plan.current, current)
        XCTAssertEqual(plan.incoming, incoming)
        XCTAssertEqual(plan.result.notes, [old, added])
        XCTAssertEqual(plan.result.cards, [oldCard, addedCard])
        XCTAssertEqual(plan.result.reviews, [oldEvent, addedEvent])
        XCTAssertEqual(plan.summary.addedNotes, 1)
        XCTAssertEqual(plan.summary.addedCards, 1)
        XCTAssertEqual(plan.summary.addedReviews, 1)
        XCTAssertEqual(plan.summary.conflictingNotes, 0)
        XCTAssertEqual(plan.summary.conflictingCards, 0)
        XCTAssertEqual(plan.summary.skippedReviews, 0)
        XCTAssertTrue(plan.hasChanges)
        XCTAssertEqual(try StudyRepository.decode(StudyRepository.encode(plan.result)), plan.result)
    }

    func testConflictingNoteKeepsCurrentContentAndMediaEvenWhenIncomingIsNewer() throws {
        let original = note("عنواني", body: "المحتوى الأصلي")
        var changed = original
        changed.title = "عنوان آخر"
        changed.body = "محتوى مختلف"
        changed.imageJPEG = Data([9])
        changed.audioM4A = nil
        changed.updatedAt = now.addingTimeInterval(500)
        let additional = card(for: changed)
        let plan = try StudyImportPlanner.make(
            current: StudySnapshot(notes: [original]),
            incoming: StudySnapshot(notes: [changed], cards: [additional]), mode: .mergeKeepingCurrent)

        XCTAssertEqual(plan.result.notes, [original])
        XCTAssertEqual(plan.result.cards, [additional])
        XCTAssertEqual(plan.summary.conflictingNotes, 1)
        XCTAssertEqual(plan.summary.addedNotes, 0)
        XCTAssertEqual(plan.summary.addedCards, 1)
    }

    func testFSRSScheduleAndHistoryRemainTogetherOnConflict() throws {
        let source = note("ذاكرة")
        let initial = ReviewScheduler.newCard(noteID: source.id, question: "س", answer: "ج", now: now)
        let localCard = try ReviewScheduler.scheduled(initial, grade: .good, now: now)
        let remoteCard = try ReviewScheduler.scheduled(initial, grade: .again, now: now)
        let localEvent = ReviewEvent(cardID: initial.id, grade: .good, at: now)
        let remoteEvent = ReviewEvent(cardID: initial.id, grade: .again, at: now)
        let current = StudySnapshot(notes: [source], cards: [localCard], reviews: [localEvent])
        let plan = try StudyImportPlanner.make(current: current,
            incoming: StudySnapshot(notes: [source], cards: [remoteCard], reviews: [remoteEvent]),
            mode: .mergeKeepingCurrent)

        XCTAssertEqual(plan.result, current)
        XCTAssertFalse(plan.hasChanges)
        XCTAssertEqual(plan.summary.conflictingCards, 1)
        XCTAssertEqual(plan.summary.skippedReviews, 1)
        XCTAssertEqual(plan.summary.addedReviews, 0)
        XCTAssertEqual(plan.result.cards[0].fsrs, localCard.fsrs)
    }

    func testHistoryConflictIsReportedEvenWhenCardFieldsAreIdentical() throws {
        let source = note("بطاقة")
        let actualCard = card(for: source)
        let existing = ReviewEvent(cardID: actualCard.id, grade: .good, at: now)
        let extra = ReviewEvent(cardID: actualCard.id, grade: .hard, at: now.addingTimeInterval(1))
        let current = StudySnapshot(notes: [source], cards: [actualCard], reviews: [existing])
        let plan = try StudyImportPlanner.make(current: current,
            incoming: StudySnapshot(notes: [source], cards: [actualCard], reviews: [existing, extra]),
            mode: .mergeKeepingCurrent)

        XCTAssertEqual(plan.result, current)
        XCTAssertEqual(plan.summary.conflictingCards, 1)
        XCTAssertEqual(plan.summary.skippedReviews, 1)
    }

    func testRepeatedNativeImportIsNoOpAndDoesNotInventConflicts() throws {
        let first = note("أ"), second = note("ب")
        let newCard = card(for: second)
        let event = ReviewEvent(cardID: newCard.id, grade: .good, at: now)
        let incoming = StudySnapshot(notes: [second], cards: [newCard], reviews: [event])
        let firstPlan = try StudyImportPlanner.make(current: StudySnapshot(notes: [first]),
                                                   incoming: incoming, mode: .mergeKeepingCurrent)
        let repeated = try StudyImportPlanner.make(current: firstPlan.result,
                                                  incoming: incoming, mode: .mergeKeepingCurrent)
        XCTAssertEqual(repeated.result, firstPlan.result)
        XCTAssertFalse(repeated.hasChanges)
        XCTAssertEqual(repeated.summary.addedNotes + repeated.summary.addedCards + repeated.summary.addedReviews, 0)
        XCTAssertEqual(repeated.summary.conflictingNotes + repeated.summary.conflictingCards + repeated.summary.skippedReviews, 0)
    }

    func testReviewOrderDoesNotConflictAndNoOpPreservesExistingVersion() throws {
        let source = note("ترتيب"), another = note("آخر")
        let storedCard = card(for: source)
        let a = ReviewEvent(cardID: storedCard.id, grade: .good, at: now)
        let b = ReviewEvent(cardID: storedCard.id, grade: .hard, at: now.addingTimeInterval(1))
        var current = StudySnapshot(notes: [source, another], cards: [storedCard], reviews: [a, b])
        current.version = 2 // A valid v2 store may contain only legacy cards.
        let incoming = StudySnapshot(notes: [another, source], cards: [storedCard], reviews: [b, a])
        let plan = try StudyImportPlanner.make(current: current, incoming: incoming, mode: .mergeKeepingCurrent)
        XCTAssertEqual(plan.result, current)
        XCTAssertFalse(plan.hasChanges)
        XCTAssertEqual(plan.result.version, 2)
        XCTAssertEqual(plan.summary.conflictingCards, 0)
        XCTAssertEqual(plan.summary.skippedReviews, 0)
    }

    func testImportingNewFSRSCardUpgradesVersionWithoutChangingLegacyCard() throws {
        let source = note("نسخة")
        let legacy = card(for: source)
        let newCard = ReviewScheduler.newCard(noteID: source.id, question: "جديد", answer: "ج", now: now)
        let current = StudySnapshot(notes: [source], cards: [legacy])
        let plan = try StudyImportPlanner.make(current: current,
            incoming: StudySnapshot(notes: [source], cards: [newCard]), mode: .mergeKeepingCurrent)
        XCTAssertEqual(current.version, 1)
        XCTAssertEqual(plan.result.version, 2)
        XCTAssertEqual(plan.result.cards, [legacy, newCard])
    }

    func testReviewIDCollisionForNewCardRejectsWholeMerge() {
        let a = note("أ"), b = note("ب")
        let localCard = card(for: a), remoteCard = card(for: b)
        let local = ReviewEvent(cardID: localCard.id, grade: .good, at: now)
        let collision = ReviewEvent(id: local.id, cardID: remoteCard.id, grade: .good, at: now)
        XCTAssertThrowsError(try StudyImportPlanner.make(
            current: StudySnapshot(notes: [a], cards: [localCard], reviews: [local]),
            incoming: StudySnapshot(notes: [b], cards: [remoteCard], reviews: [collision]),
            mode: .mergeKeepingCurrent)) { error in
                XCTAssertEqual(error as? StudyImportError, .reviewIdentityConflict(local.id))
        }
    }

    func testInvalidInputsAreRejectedBeforeBuildingIDLookups() {
        let item = note("مكرر")
        var future = StudySnapshot.empty
        future.version = 99
        let invalid: [StudySnapshot] = [
            StudySnapshot(notes: [item, item]),
            StudySnapshot(cards: [card(for: item)]),
            StudySnapshot(reviews: [ReviewEvent(cardID: UUID(), grade: .good, at: now)]),
            future
        ]
        for snapshot in invalid {
            for mode in StudyImportMode.allCases {
                XCTAssertThrowsError(try StudyImportPlanner.make(current: snapshot, incoming: .empty, mode: mode))
                XCTAssertThrowsError(try StudyImportPlanner.make(current: .empty, incoming: snapshot, mode: mode))
            }
        }
    }

    func testCombinedCountLimitRejectsIndividuallyValidSnapshots() {
        let current = StudySnapshot(notes: (0..<10_000).map { note("ملاحظة \($0)") })
        let incoming = StudySnapshot(notes: [note("زيادة")])
        XCTAssertTrue(current.isValid())
        XCTAssertTrue(incoming.isValid())
        XCTAssertThrowsError(try StudyImportPlanner.make(current: current, incoming: incoming, mode: .mergeKeepingCurrent))
    }

    func testCombinedEncodedMediaSizeIsRejectedBeforeReturningPlan() throws {
        let media = Data(repeating: 0x5A, count: 4_000_000)
        func batch(_ prefix: String) -> StudySnapshot {
            StudySnapshot(notes: (0..<8).map {
                StudyNote(title: "\(prefix) \($0)", body: "", createdAt: now, updatedAt: now, imageJPEG: media)
            })
        }
        let current = batch("حالي"), incoming = batch("وارد")
        XCTAssertTrue(current.isValid())
        XCTAssertTrue(incoming.isValid())
        XCTAssertNoThrow(try StudyRepository.encode(current))
        XCTAssertNoThrow(try StudyRepository.encode(incoming))
        XCTAssertThrowsError(try StudyImportPlanner.make(current: current, incoming: incoming, mode: .mergeKeepingCurrent))
    }

    func testDuplicateTitleImportReportsPreviouslyResolvedGraphLinkLoss() throws {
        let source = note("بداية", body: "[[التعلم]]")
        let target = note("التعلم")
        let duplicate = note(" التعلم ")
        let current = StudySnapshot(notes: [source, target])
        let plan = try StudyImportPlanner.make(current: current,
            incoming: StudySnapshot(notes: [duplicate]), mode: .mergeKeepingCurrent)
        XCTAssertEqual(StudyEngine.graphEdges(current.notes).count, 1)
        XCTAssertTrue(StudyEngine.graphEdges(plan.result.notes).isEmpty)
        XCTAssertEqual(plan.summary.lostGraphLinks, 1)
        XCTAssertEqual(plan.result.notes, [source, target, duplicate])
    }

    func testReplaceUsesExactIncomingSnapshotAndCountsLossOfExistingLinks() throws {
        let a = note("أ", body: "[[ب]]"), b = note("ب")
        let current = StudySnapshot(notes: [a, b])
        let imported = note("بديل")
        let importedCard = card(for: imported)
        let event = ReviewEvent(cardID: importedCard.id, grade: .easy, at: now)
        let incoming = StudySnapshot(notes: [imported], cards: [importedCard], reviews: [event])
        let plan = try StudyImportPlanner.make(current: current, incoming: incoming, mode: .replace)
        XCTAssertEqual(plan.result, incoming)
        XCTAssertTrue(plan.hasChanges)
        XCTAssertEqual(plan.summary.addedNotes, 1)
        XCTAssertEqual(plan.summary.addedCards, 1)
        XCTAssertEqual(plan.summary.addedReviews, 1)
        XCTAssertEqual(plan.summary.lostGraphLinks, 1)
        XCTAssertEqual(plan.summary.conflictingNotes + plan.summary.conflictingCards + plan.summary.skippedReviews, 0)
        XCTAssertFalse(try StudyImportPlanner.make(current: incoming, incoming: incoming, mode: .replace).hasChanges)
    }
}
