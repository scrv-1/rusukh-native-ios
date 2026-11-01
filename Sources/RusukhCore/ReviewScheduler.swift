import Foundation
import FSRS

/// Persist the algorithm and parameter identity alongside memory state.
/// The legacy scheduler remains available for cards created before this feature.
public struct FSRSSchedule: Codable, Equatable, Sendable {
    public var algorithm: String
    public var parameterSet: String
    public var card: Card

    public init(card: Card) {
        algorithm = "fsrs-6"
        parameterSet = "canonical-v6-retention-0.9-steps-1m-10m"
        self.card = card
    }

    private enum CodingKeys: String, CodingKey { case algorithm, parameterSet, card }
    private enum MemoryKeys: String, CodingKey, CaseIterable {
        case due, stability, difficulty, elapsedDays, scheduledDays, learningSteps, reps, lapses, state
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        algorithm = try container.decode(String.self, forKey: .algorithm)
        parameterSet = try container.decode(String.self, forKey: .parameterSet)
        let memory = try container.nestedContainer(keyedBy: MemoryKeys.self, forKey: .card)
        // Upstream accepts incomplete legacy cards; our v2 format must not
        // silently replace missing memory or learning state with defaults.
        for key in MemoryKeys.allCases {
            guard memory.contains(key), try !memory.decodeNil(forKey: key) else {
                throw DecodingError.dataCorruptedError(forKey: key, in: memory, debugDescription: "Missing FSRS memory field")
            }
        }
        card = try container.decode(Card.self, forKey: .card)
    }

    public func isValid(for studyCard: StudyCard) -> Bool {
        guard algorithm == "fsrs-6",
              parameterSet == "canonical-v6-retention-0.9-steps-1m-10m",
              card.due.timeIntervalSince1970.isFinite,
              card.due == studyCard.dueAt,
              card.scheduledDays.isFinite, card.scheduledDays >= 0, card.scheduledDays <= 36_500,
              card.scheduledDays == Double(studyCard.intervalDays),
              card.elapsedDays.isFinite, card.elapsedDays >= 0,
              card.reps >= 0, card.reps <= StudyCard.maximumRepetitions,
              card.reps == studyCard.repetitions,
              card.lapses >= 0, card.lapses <= card.reps,
              card.stability.isFinite, card.difficulty.isFinite else { return false }
        if card.state == .learning {
            guard (0..<2).contains(card.learningSteps) else { return false }
        } else if card.learningSteps != 0 { return false }
        if card.state == .new {
            return card.stability == 0 && card.difficulty == 0 && card.reps == 0 &&
                card.lastReview == nil && card.elapsedDays == 0 && card.scheduledDays == 0
        }
        guard let lastReview = card.lastReview else { return false }
        return card.reps > 0 && lastReview.timeIntervalSince1970.isFinite && lastReview <= card.due &&
            card.stability >= 0.001 && card.difficulty >= 1 && card.difficulty <= 10
    }
}

public enum ReviewScheduler {
    public enum Failure: Error { case invalidState, reviewLimitReached, clockBeforeLastReview }

    public static func newCard(noteID: UUID, question: String, answer: String, now: Date = .now) -> StudyCard {
        StudyCard(noteID: noteID, question: question, answer: answer, dueAt: now,
                  updatedAt: now, fsrs: FSRSSchedule(card: Card(due: now)))
    }

    public static func scheduled(_ card: StudyCard, grade: ReviewGrade, now: Date = .now) throws -> StudyCard {
        guard let memory = card.fsrs else { return StudyEngine.scheduled(card, grade: grade, now: now) }
        guard memory.isValid(for: card), now.timeIntervalSince1970.isFinite else { throw Failure.invalidState }
        guard memory.card.reps < StudyCard.maximumRepetitions else { throw Failure.reviewLimitReached }
        if let last = memory.card.lastReview, now < last { throw Failure.clockBeforeLastReview }
        let rating: Rating = switch grade {
        case .again: .again
        case .hard: .hard
        case .good: .good
        case .easy: .easy
        }
        // A fresh scheduler avoids sharing the library's mutable algorithm state.
        let scheduler = FSRS(parameters: FSRSParameters(
            requestRetention: 0.9, maximumInterval: 36_500,
            w: FSRSDefaults.defaultWv6, enableFuzz: false, enableShortTerm: true,
            learningSteps: ["1m", "10m"], relearningSteps: ["10m"]))
        var next = try scheduler.next(card: memory.card, now: now, grade: rating).card
        guard next.scheduledDays.isFinite, next.scheduledDays >= 0 else {
            throw Failure.invalidState
        }
        // Upstream separates Good/Easy by +1 day after its interval cap.
        // Keep the persisted due date and day count consistent at our cap.
        if next.scheduledDays > 36_500 {
            next.scheduledDays = 36_500
            next.due = now.addingTimeInterval(36_500 * 86_400)
        }
        var result = card
        result.fsrs = FSRSSchedule(card: next)
        result.dueAt = next.due
        result.intervalDays = Int(next.scheduledDays)
        result.repetitions = next.reps
        result.updatedAt = now
        guard result.fsrs!.isValid(for: result) else { throw Failure.invalidState }
        return result
    }
}
