import Foundation

public enum StudyEngine {
    public static func matches(_ note: StudyNote, query: String) -> Bool {
        let terms = searchKey(query).split(separator: " ")
        let text = searchKey(note.title + "\n" + note.body)
        return terms.allSatisfy { text.contains($0) }
    }

    /// Search copy only. Stored titles and wiki-link identity keep `normalized` unchanged.
    public static func searchKey(_ text: String) -> String {
        let withoutMarks = String(String.UnicodeScalarView(text.unicodeScalars.filter {
            $0.properties.generalCategory != .nonspacingMark
        }))
        let folded = normalized(withoutMarks.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: Locale(identifier: "ar"))
            .replacingOccurrences(of: "ـ", with: ""))
        return folded
            .replacingOccurrences(of: "أ", with: "ا")
            .replacingOccurrences(of: "إ", with: "ا")
            .replacingOccurrences(of: "آ", with: "ا")
            .replacingOccurrences(of: "ٱ", with: "ا")
            .replacingOccurrences(of: "ة", with: "ه")
            .replacingOccurrences(of: "ى", with: "ي")
    }

    public static func normalized(_ title: String) -> String {
        title.split(whereSeparator: \.isWhitespace).joined(separator: " ").lowercased()
    }

    public static func wikiLinks(in text: String) -> [String] {
        guard let expression = try? NSRegularExpression(pattern: #"\[\[([^\]|\n]+)(?:\|[^\]\n]*)?\]\]"#) else { return [] }
        let whole = NSRange(text.startIndex..<text.endIndex, in: text)
        var seen = Set<String>()
        var result: [String] = []
        for match in expression.matches(in: text, range: whole) {
            guard let range = Range(match.range(at: 1), in: text) else { continue }
            let title = String(text[range]).trimmingCharacters(in: .whitespacesAndNewlines)
            if !title.isEmpty && seen.insert(normalized(title)).inserted { result.append(title) }
        }
        return result
    }

    public static func graphEdges(_ notes: [StudyNote]) -> [GraphEdge] {
        let groups = Dictionary(grouping: notes, by: { normalized($0.title) })
        let lookup = groups.compactMapValues { $0.count == 1 ? $0.first?.id : nil }
        var result: [GraphEdge] = []
        var seen = Set<GraphEdge>()
        for note in notes {
            for link in wikiLinks(in: note.body) {
                guard let target = lookup[normalized(link)], target != note.id else { continue }
                let edge = GraphEdge(from: note.id, to: target)
                if seen.insert(edge).inserted { result.append(edge) }
            }
        }
        return result
    }

    /// Notes that link to `note`. Ambiguous duplicate titles resolve to nothing, matching `graphEdges`.
    public static func backlinks(to note: StudyNote, in notes: [StudyNote]) -> [StudyNote] {
        let key = normalized(note.title)
        let titled = Dictionary(grouping: notes, by: { normalized($0.title) })
        guard titled[key]?.count == 1 else { return [] }
        return notes.filter { other in
            other.id != note.id && wikiLinks(in: other.body).contains { normalized($0) == key }
        }
    }

    /// Renames one note. Wiki links are rewritten only when the old title is unique and the new title is free.
    /// A colliding new title still renames the note, but leaves existing links untouched so they cannot point at the wrong note.
    public static func renamedNotes(_ notes: [StudyNote], id: UUID, to rawTitle: String, now: Date = .now) -> [StudyNote]? {
        let newTitle = rawTitle.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !newTitle.isEmpty, newTitle.count <= 500,
              !newTitle.contains(where: { $0 == "[" || $0 == "]" || $0 == "|" || $0.isNewline }),
              let current = notes.first(where: { $0.id == id }) else { return nil }
        let oldKey = normalized(current.title)
        let newKey = normalized(newTitle)
        let oldIsUnique = notes.filter { normalized($0.title) == oldKey }.count == 1
        let newIsFree = !notes.contains { $0.id != id && normalized($0.title) == newKey }
        let rewrite = oldIsUnique && newIsFree && oldKey != newKey
        return notes.map { note in
            var copy = note
            if copy.id == id {
                copy.title = newTitle
                copy.updatedAt = now
            } else if rewrite {
                let updated = replacingWikiTarget(in: copy.body, from: oldKey, to: newTitle)
                if updated != copy.body {
                    copy.body = updated
                    copy.updatedAt = now
                }
            }
            return copy
        }
    }

    static func replacingWikiTarget(in text: String, from oldKey: String, to newTitle: String) -> String {
        guard let expression = try? NSRegularExpression(pattern: #"\[\[([^\]|\n]+)(\|[^\]\n]*)?\]\]"#) else { return text }
        let mutable = NSMutableString(string: text)
        let whole = NSRange(location: 0, length: (text as NSString).length)
        for match in expression.matches(in: text, range: whole).reversed() {
            guard let titleRange = Range(match.range(at: 1), in: text) else { continue }
            guard normalized(String(text[titleRange])) == oldKey else { continue }
            let alias = match.range(at: 2).location == NSNotFound ? "" : mutable.substring(with: match.range(at: 2))
            mutable.replaceCharacters(in: match.range, with: "[[\(newTitle)\(alias)]]")
        }
        return mutable as String
    }

    // Explicit human-written Q: / A: lines; not an AI generator.
    public static func questionAnswers(from text: String) -> [(question: String, answer: String)] {
        var question: String?
        var result: [(question: String, answer: String)] = []
        for raw in text.components(separatedBy: .newlines) {
            let line = raw.trimmingCharacters(in: .whitespacesAndNewlines)
            if let match = line.range(of: #"^(س|Q)\s*[:：]\s*"#, options: [.regularExpression, .caseInsensitive]) {
                let value = String(line[match.upperBound...]).trimmingCharacters(in: .whitespacesAndNewlines)
                question = value.isEmpty ? nil : value
            } else if let match = line.range(of: #"^(ج|A)\s*[:：]\s*"#, options: [.regularExpression, .caseInsensitive]), let q = question {
                let answer = String(line[match.upperBound...]).trimmingCharacters(in: .whitespacesAndNewlines)
                if !answer.isEmpty { result.append((q, answer)) }
                question = nil
            }
        }
        return result
    }

    // An intentionally simple SM-2-like scheduler, NOT FSRS.
    public static func scheduled(_ card: StudyCard, grade: ReviewGrade, now: Date = .now) -> StudyCard {
        var result = card
        let easeChange: Double = switch grade {
        case .again: -0.2
        case .hard: -0.15
        case .good: 0
        case .easy: 0.15
        }
        result.ease = min(3, max(1.3, card.ease + easeChange))
        let interval = Double(min(StudyCard.maximumIntervalDays, max(0, card.intervalDays)))
        let nextRepetition = min(max(0, card.repetitions), StudyCard.maximumRepetitions - 1) + 1
        func days(_ proposed: Double, minimum: Int) -> Int {
            min(StudyCard.maximumIntervalDays, max(minimum, Int(ceil(proposed))))
        }
        switch grade {
        case .again:
            result.repetitions = 0
            result.intervalDays = 0
            result.dueAt = now.addingTimeInterval(600)
        case .hard:
            result.repetitions = nextRepetition
            result.intervalDays = days(interval * 1.2, minimum: 1)
            result.dueAt = now.addingTimeInterval(Double(result.intervalDays) * 86_400)
        case .good:
            result.repetitions = nextRepetition
            result.intervalDays = card.repetitions == 0 ? 1 : (card.repetitions == 1 ? 3 : days(interval * result.ease, minimum: 1))
            result.dueAt = now.addingTimeInterval(Double(result.intervalDays) * 86_400)
        case .easy:
            result.repetitions = nextRepetition
            result.intervalDays = card.repetitions == 0 ? 4 : days(interval * result.ease * 1.3, minimum: 4)
            result.dueAt = now.addingTimeInterval(Double(result.intervalDays) * 86_400)
        }
        result.updatedAt = now
        return result
    }

    public static func dueCards(_ cards: [StudyCard], at date: Date = .now) -> [StudyCard] {
        cards.filter { $0.dueAt <= date }.sorted { $0.dueAt < $1.dueAt }
    }

    public static func quiz(from cards: [StudyCard], limit: Int = 8) -> [QuizQuestion] {
        var generator = SystemRandomNumberGenerator()
        return quiz(from: cards, limit: limit, using: &generator)
    }

    public static func quiz<Generator: RandomNumberGenerator>(from cards: [StudyCard], limit: Int = 8, using generator: inout Generator) -> [QuizQuestion] {
        var unique: [StudyCard] = []
        var seen = Set<String>()
        for card in cards {
            if seen.insert(normalized(card.answer)).inserted { unique.append(card) }
        }
        guard unique.count >= 2 else { return [] }
        return unique.prefix(max(0, limit)).map { card in
            let distractors = unique.filter { $0.id != card.id }.prefix(3).map(\.answer)
            var options = [card.answer] + distractors
            options.shuffle(using: &generator)
            return QuizQuestion(cardID: card.id, question: card.question, answer: card.answer, options: options)
        }
    }

    /// Updates question and answer text for one note. Card ids, FSRS memory, and review history stay attached to the same card.
    /// Pairs that no longer match a question update the remaining cards in order. Extra cards are kept. Missing pairs become new FSRS cards.
    public static func syncedCards(existing: [StudyCard], noteID: UUID, pairs: [(question: String, answer: String)], now: Date = .now) -> [StudyCard] {
        let others = existing.filter { $0.noteID != noteID }
        var mine = existing.filter { $0.noteID == noteID }
        var used = Set<UUID>()
        var synced: [StudyCard] = []
        var unmatched: [(question: String, answer: String)] = []
        for pair in pairs {
            if let index = mine.firstIndex(where: { !used.contains($0.id) && $0.question == pair.question }) {
                var card = mine[index]
                used.insert(card.id)
                if card.answer != pair.answer {
                    card.answer = pair.answer
                    card.updatedAt = now
                }
                synced.append(card)
            } else {
                unmatched.append(pair)
            }
        }
        var leftover = mine.filter { !used.contains($0.id) }
        for pair in unmatched {
            if leftover.isEmpty {
                synced.append(ReviewScheduler.newCard(noteID: noteID, question: pair.question, answer: pair.answer, now: now))
            } else {
                var card = leftover.removeFirst()
                card.question = pair.question
                card.answer = pair.answer
                card.updatedAt = now
                synced.append(card)
            }
        }
        return others + synced + leftover
    }
}
