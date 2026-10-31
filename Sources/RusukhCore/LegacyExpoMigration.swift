import Foundation

/// Reads the JSON backup made by the original Rusukh Expo prototype.
/// Does not overwrite an existing store until the converted snapshot has validated.
public enum LegacyExpoMigration {
    private struct LegacyNote: Decodable {
        let id: String
        let title: String
        let body: String
        let createdAt: Double
        let updatedAt: Double
    }
    private struct LegacyCard: Decodable {
        let id: String
        let noteId: String
        let question: String
        let answer: String
        let dueAt: Double
        let intervalDays: Int
        let ease: Double
        let repetitions: Int
        let updatedAt: Double
    }
    private struct LegacyReview: Decodable {
        let id: String
        let cardId: String
        let grade: String
        let reviewedAt: Double
    }
    private struct LegacyBackup: Decodable {
        let format: String
        let version: Int
        let notes: [LegacyNote]
        let cards: [LegacyCard]
        let reviews: [LegacyReview]
    }

    public static func converted(from data: Data) throws -> StudySnapshot {
        guard data.count < 80_000_000 else { throw StudyStorageError.invalidBackup }
        let backup = try JSONDecoder().decode(LegacyBackup.self, from: data)
        guard backup.format == "rusukh-backup", backup.version == 1,
              backup.notes.count <= 10_000, backup.cards.count <= 50_000, backup.reviews.count <= 100_000 else {
            throw StudyStorageError.invalidBackup
        }
        func safeTime(_ value: Double) throws -> Date {
            guard value.isFinite, value >= 0, value < 32_503_680_000_000 else { throw StudyStorageError.invalidBackup }
            return Date(timeIntervalSince1970: value / 1000)
        }
        var notes: [StudyNote] = []
        var noteIDMap: [String: UUID] = [:]
        for n in backup.notes {
            guard !n.id.isEmpty, noteIDMap[n.id] == nil else { throw StudyStorageError.invalidBackup }
            let id = UUID()
            noteIDMap[n.id] = id
            notes.append(StudyNote(id: id, title: n.title, body: n.body, createdAt: try safeTime(n.createdAt), updatedAt: try safeTime(n.updatedAt)))
        }
        var cards: [StudyCard] = []
        var cardIDMap: [String: UUID] = [:]
        for c in backup.cards {
            guard !c.id.isEmpty, cardIDMap[c.id] == nil, let noteID = noteIDMap[c.noteId] else { throw StudyStorageError.invalidBackup }
            let id = UUID()
            cardIDMap[c.id] = id
            cards.append(StudyCard(id: id, noteID: noteID, question: c.question, answer: c.answer,
                                   dueAt: try safeTime(c.dueAt), intervalDays: c.intervalDays, ease: c.ease,
                                   repetitions: c.repetitions, updatedAt: try safeTime(c.updatedAt)))
        }
        var reviews: [ReviewEvent] = []
        var reviewIDSet = Set<String>()
        for r in backup.reviews {
            guard !r.id.isEmpty, reviewIDSet.insert(r.id).inserted,
                  let cardID = cardIDMap[r.cardId], let grade = ReviewGrade(rawValue: r.grade) else {
                throw StudyStorageError.invalidBackup
            }
            reviews.append(ReviewEvent(cardID: cardID, grade: grade, at: try safeTime(r.reviewedAt)))
        }
        let result = StudySnapshot(notes: notes, cards: cards, reviews: reviews)
        guard result.isValid() else { throw StudyStorageError.invalidBackup }
        return result
    }
}
