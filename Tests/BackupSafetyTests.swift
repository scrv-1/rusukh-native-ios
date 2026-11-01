import Foundation
import XCTest
@testable import RusukhCore

final class BackupSafetyTests: XCTestCase {
    private func legacy(title: String = "قديم") -> Data {
        Data("""
        {"format":"rusukh-backup","version":1,"notes":[{"id":"n1","title":"\(title)","body":"معرفة","createdAt":1790000000000,"updatedAt":1790000000000}],"cards":[{"id":"c1","noteId":"n1","question":"س","answer":"ج","dueAt":1790000000000,"intervalDays":0,"ease":2.5,"repetitions":0,"updatedAt":1790000000000}],"reviews":[{"id":"r1","cardId":"c1","grade":"good","reviewedAt":1790000000000}]}
        """.utf8)
    }

    func testLegacyImportIdentityIsStableAcrossRepeatedReads() throws {
        let first = try StudyRepository.decode(legacy())
        let second = try StudyRepository.decode(legacy())
        XCTAssertEqual(first.notes.map(\.id), second.notes.map(\.id))
        XCTAssertEqual(first.cards.map(\.id), second.cards.map(\.id))
        XCTAssertEqual(first.reviews.map(\.id), second.reviews.map(\.id))
        XCTAssertEqual(first, second)
    }

    func testLegacyEditedContentKeepsOriginalIdentity() throws {
        let first = try StudyRepository.decode(legacy())
        let edited = try StudyRepository.decode(legacy(title: "معدل"))
        XCTAssertEqual(first.notes[0].id, edited.notes[0].id)
        XCTAssertEqual(first.cards[0].id, edited.cards[0].id)
        XCTAssertEqual(first.reviews[0].id, edited.reviews[0].id)
        XCTAssertNotEqual(first.notes[0].title, edited.notes[0].title)
    }

    func testLegacyRepeatedMergeDoesNotDuplicateTheLibrary() throws {
        let first = try StudyImportPlanner.make(current: .empty, incoming: StudyRepository.decode(legacy()), mode: .mergeKeepingCurrent)
        let again = try StudyImportPlanner.make(current: first.result, incoming: StudyRepository.decode(legacy()), mode: .mergeKeepingCurrent)
        XCTAssertFalse(again.hasChanges)
        XCTAssertEqual(again.result.notes.count, 1)
        XCTAssertEqual(again.result.cards.count, 1)
        XCTAssertEqual(again.result.reviews.count, 1)
    }

    func testLegacyGenericIDsAtDifferentCreationTimesDoNotCollide() throws {
        let first = try StudyRepository.decode(legacy())
        let otherData = Data(String(decoding: legacy(), as: UTF8.self)
            .replacingOccurrences(of: "1790000000000", with: "1790000000001").utf8)
        let other = try StudyRepository.decode(otherData)
        XCTAssertNotEqual(first.notes[0].id, other.notes[0].id)
        XCTAssertNotEqual(first.cards[0].id, other.cards[0].id)
        XCTAssertNotEqual(first.reviews[0].id, other.reviews[0].id)
        let merged = try StudyImportPlanner.make(current: first, incoming: other, mode: .mergeKeepingCurrent)
        XCTAssertEqual(merged.result.notes.count, 2)
        XCTAssertEqual(merged.result.cards.count, 2)
        XCTAssertEqual(merged.result.reviews.count, 2)
    }
}
