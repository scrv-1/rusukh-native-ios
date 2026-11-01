import Foundation
import XCTest
@testable import RusukhCore

final class ReviewSchedulerStressTests: XCTestCase {
    func testMixedReviewsAndRepeatedBackupsPreserveThousandCards() throws {
        let start = Date(timeIntervalSince1970: 1_700_000_000)
        let note = StudyNote(title: "اختبار ضغط اصطناعي", body: "", createdAt: start, updatedAt: start)
        var snapshot = StudySnapshot(notes: [note], cards: (0..<1_000).map {
            ReviewScheduler.newCard(noteID: note.id, question: "س \($0)", answer: "ج \($0)", now: start)
        })
        let originalIDs = snapshot.cards.map(\.id)
        var seed: UInt64 = 42
        for round in 0..<32 {
            for index in snapshot.cards.indices {
                // Reproducible mixed grades and delays, independent of system RNG.
                seed = seed &* 6_364_136_223_846_793_005 &+ 1
                let grade = ReviewGrade.allCases[Int((seed >> 32) % 4)]
                let date = snapshot.cards[index].dueAt.addingTimeInterval(Double((seed >> 40) % 15) * 86_400)
                snapshot.cards[index] = try ReviewScheduler.scheduled(snapshot.cards[index], grade: grade, now: date)
                snapshot.reviews.append(ReviewEvent(cardID: snapshot.cards[index].id, grade: grade, at: date))
            }
            let reopened = try StudyRepository.decode(StudyRepository.encode(snapshot))
            XCTAssertEqual(reopened, snapshot, "Backup round \(round)")
            snapshot = reopened
        }
        XCTAssertEqual(snapshot.cards.map(\.id), originalIDs)
        XCTAssertEqual(snapshot.reviews.count, 32_000)
        XCTAssertTrue(snapshot.cards.allSatisfy { $0.repetitions == 32 && $0.fsrs?.isValid(for: $0) == true })
    }
}
