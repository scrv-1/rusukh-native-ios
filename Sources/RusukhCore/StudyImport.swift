import Foundation

public enum StudyImportMode: String, CaseIterable, Sendable {
    case mergeKeepingCurrent
    case replace
}

public struct StudyImportSummary: Equatable, Sendable {
    public let addedNotes: Int
    public let addedCards: Int
    public let addedReviews: Int
    public let conflictingNotes: Int
    public let conflictingCards: Int
    /// Incoming events excluded from an existing card's history, excluding
    /// events already represented by an identical event in the current store.
    public let skippedReviews: Int
    public let lostGraphLinks: Int
}

public enum StudyImportError: Error, LocalizedError, Equatable {
    case invalidSnapshot
    case reviewIdentityConflict(UUID)

    public var errorDescription: String? {
        switch self {
        case .invalidSnapshot:
            return "تعذّر تجهيز الاستيراد: البيانات غير صالحة أو تتجاوز حدود المخزن."
        case .reviewIdentityConflict:
            return "تعارض معرّف مراجعة مع سجل بطاقة أخرى؛ لم يتم دمج البيانات."
        }
    }
}

/// An immutable, validated preview. Only the planner can construct a plan.
/// The repository must still check `current` immediately before committing.
public struct StudyImportPlan: Sendable {
    public let current: StudySnapshot
    public let incoming: StudySnapshot
    public let result: StudySnapshot
    public let mode: StudyImportMode
    public let summary: StudyImportSummary

    public var hasChanges: Bool { result != current }

    fileprivate init(current: StudySnapshot, incoming: StudySnapshot,
                     result: StudySnapshot, mode: StudyImportMode,
                     summary: StudyImportSummary) {
        self.current = current
        self.incoming = incoming
        self.result = result
        self.mode = mode
        self.summary = summary
    }
}

public enum StudyImportPlanner {
    public static func make(current: StudySnapshot, incoming: StudySnapshot,
                            mode: StudyImportMode) throws -> StudyImportPlan {
        // Validate before constructing dictionaries: duplicate IDs must fail
        // safely rather than triggering Dictionary's duplicate-key precondition.
        guard current.isValid(), incoming.isValid() else {
            throw StudyImportError.invalidSnapshot
        }

        var result: StudySnapshot
        var addedNotes = 0
        var addedCards = 0
        var addedReviews = 0
        var conflictingNotes = 0
        var conflictingCards = 0
        var skippedReviews = 0

        switch mode {
        case .replace:
            result = incoming
            addedNotes = incoming.notes.count
            addedCards = incoming.cards.count
            addedReviews = incoming.reviews.count

        case .mergeKeepingCurrent:
            // Keep every existing value and its ordering, including format
            // version. A no-op must not rewrite an existing version-2 store.
            result = current
            let notesByID = Dictionary(uniqueKeysWithValues: current.notes.map { ($0.id, $0) })
            let cardsByID = Dictionary(uniqueKeysWithValues: current.cards.map { ($0.id, $0) })
            let reviewsByID = Dictionary(uniqueKeysWithValues: current.reviews.map { ($0.id, $0) })
            let currentHistories = histories(current.reviews)
            let incomingHistories = histories(incoming.reviews)
            var newCardIDs = Set<UUID>()

            for note in incoming.notes {
                if let existing = notesByID[note.id] {
                    if existing != note { conflictingNotes += 1 }
                } else {
                    result.notes.append(note)
                    addedNotes += 1
                }
            }

            for card in incoming.cards {
                if let existing = cardsByID[card.id] {
                    // A card's schedule and history belong to the same branch
                    // of learning. Never merge events while retaining a
                    // schedule that was calculated from a different history.
                    if existing != card || currentHistories[card.id, default: [:]] != incomingHistories[card.id, default: [:]] {
                        conflictingCards += 1
                    }
                } else {
                    result.cards.append(card)
                    newCardIDs.insert(card.id)
                    addedCards += 1
                }
            }

            for event in incoming.reviews {
                if newCardIDs.contains(event.cardID) {
                    // Dropping or renaming this event silently would detach
                    // the newly imported card from its original review log.
                    guard reviewsByID[event.id] == nil else {
                        throw StudyImportError.reviewIdentityConflict(event.id)
                    }
                    result.reviews.append(event)
                    addedReviews += 1
                } else if reviewsByID[event.id] != event {
                    skippedReviews += 1
                }
            }

            if result.cards.contains(where: { $0.fsrs != nil }) { result.version = 2 }
        }

        guard result.isValid() else { throw StudyImportError.invalidSnapshot }
        // Model count limits alone do not account for base64 media expansion.
        // Reject an oversized combined backup before any recovery/store write.
        _ = try StudyRepository.encode(result)

        let before = Set(StudyEngine.graphEdges(current.notes))
        let after = Set(StudyEngine.graphEdges(result.notes))
        let summary = StudyImportSummary(
            addedNotes: addedNotes, addedCards: addedCards, addedReviews: addedReviews,
            conflictingNotes: conflictingNotes, conflictingCards: conflictingCards,
            skippedReviews: skippedReviews, lostGraphLinks: before.subtracting(after).count)
        return StudyImportPlan(current: current, incoming: incoming, result: result,
                               mode: mode, summary: summary)
    }

    private static func histories(_ events: [ReviewEvent]) -> [UUID: [UUID: ReviewEvent]] {
        var result: [UUID: [UUID: ReviewEvent]] = [:]
        for event in events { result[event.cardID, default: [:]][event.id] = event }
        return result
    }
}
