import Foundation

public struct StudyNote: Codable, Identifiable, Equatable, Sendable {
    public var id: UUID
    public var title: String
    public var body: String
    public var createdAt: Date
    public var updatedAt: Date
    public var imageJPEG: Data?
    public var audioM4A: Data?

    public init(id: UUID = UUID(), title: String, body: String, createdAt: Date = .now, updatedAt: Date = .now, imageJPEG: Data? = nil, audioM4A: Data? = nil) {
        self.id = id
        self.title = title
        self.body = body
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.imageJPEG = imageJPEG
        self.audioM4A = audioM4A
    }
}

public enum ReviewGrade: String, Codable, CaseIterable, Sendable {
    case again, hard, good, easy
}

public struct StudyCard: Codable, Identifiable, Equatable, Sendable {
    public static let maximumIntervalDays = 365_000
    public static let maximumRepetitions = 100_000
    public var id: UUID
    public var noteID: UUID
    public var question: String
    public var answer: String
    public var dueAt: Date
    public var intervalDays: Int
    public var ease: Double
    public var repetitions: Int
    public var updatedAt: Date

    public init(id: UUID = UUID(), noteID: UUID, question: String, answer: String,
                dueAt: Date = .now, intervalDays: Int = 0, ease: Double = 2.5,
                repetitions: Int = 0, updatedAt: Date = .now) {
        self.id = id
        self.noteID = noteID
        self.question = question
        self.answer = answer
        self.dueAt = dueAt
        self.intervalDays = intervalDays
        self.ease = ease
        self.repetitions = repetitions
        self.updatedAt = updatedAt
    }
}

public struct ReviewEvent: Codable, Identifiable, Equatable, Sendable {
    public var id: UUID
    public var cardID: UUID
    public var grade: ReviewGrade
    public var at: Date

    public init(id: UUID = UUID(), cardID: UUID, grade: ReviewGrade, at: Date = .now) {
        self.id = id
        self.cardID = cardID
        self.grade = grade
        self.at = at
    }
}

public struct StudySnapshot: Codable, Equatable, Sendable {
    public var format: String
    public var version: Int
    public var notes: [StudyNote]
    public var cards: [StudyCard]
    public var reviews: [ReviewEvent]

    public init(notes: [StudyNote] = [], cards: [StudyCard] = [], reviews: [ReviewEvent] = []) {
        format = "rusukh-native-backup"
        version = 1
        self.notes = notes
        self.cards = cards
        self.reviews = reviews
    }

    public static let empty = StudySnapshot()

    public func isValid() -> Bool {
        guard format == "rusukh-native-backup", version == 1,
              notes.count <= 10_000, cards.count <= 50_000, reviews.count <= 100_000 else { return false }
        let noteIDs = Set(notes.map(\.id))
        let cardIDs = Set(cards.map(\.id))
        guard noteIDs.count == notes.count, cardIDs.count == cards.count,
              Set(reviews.map(\.id)).count == reviews.count else { return false }
        for note in notes {
            if note.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
                note.title.count > 500 || note.body.count > 1_000_000 ||
                (note.imageJPEG?.count ?? 0) > 4_000_000 ||
                (note.audioM4A?.count ?? 0) > 2_000_000 { return false }
        }
        for card in cards {
            // Preserve v1 backup compatibility; the composer trims new cards.
            if !noteIDs.contains(card.noteID) || card.question.isEmpty || card.answer.isEmpty ||
                card.question.count > 10_000 || card.answer.count > 100_000 ||
                card.intervalDays < 0 || card.intervalDays > StudyCard.maximumIntervalDays ||
                !card.ease.isFinite || card.ease < 1 || card.ease > 5 ||
                card.repetitions < 0 || card.repetitions > StudyCard.maximumRepetitions { return false }
        }
        return reviews.allSatisfy { cardIDs.contains($0.cardID) }
    }
}

public struct GraphEdge: Equatable, Hashable, Sendable {
    public let from: UUID
    public let to: UUID
    public init(from: UUID, to: UUID) { self.from = from; self.to = to }
}

public struct QuizQuestion: Equatable, Sendable {
    public let cardID: UUID
    public let question: String
    public let answer: String
    public let options: [String]
}
