import Foundation

public enum StudyEngine {
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
        let lookup = Dictionary(notes.map { (normalized($0.title), $0.id) }, uniquingKeysWith: { first, _ in first })
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
        switch grade {
        case .again:
            result.repetitions = 0
            result.intervalDays = 0
            result.dueAt = now.addingTimeInterval(600)
        case .hard:
            result.repetitions += 1
            result.intervalDays = max(1, Int(ceil(Double(card.intervalDays) * 1.2)))
            result.dueAt = now.addingTimeInterval(Double(result.intervalDays) * 86_400)
        case .good:
            result.repetitions += 1
            result.intervalDays = card.repetitions == 0 ? 1 : (card.repetitions == 1 ? 3 : max(1, Int(ceil(Double(card.intervalDays) * result.ease))))
            result.dueAt = now.addingTimeInterval(Double(result.intervalDays) * 86_400)
        case .easy:
            result.repetitions += 1
            result.intervalDays = card.repetitions == 0 ? 4 : max(4, Int(ceil(Double(card.intervalDays) * result.ease * 1.3)))
            result.dueAt = now.addingTimeInterval(Double(result.intervalDays) * 86_400)
        }
        result.updatedAt = now
        return result
    }

    public static func dueCards(_ cards: [StudyCard], at date: Date = .now) -> [StudyCard] {
        cards.filter { $0.dueAt <= date }.sorted { $0.dueAt < $1.dueAt }
    }

    public static func quiz(from cards: [StudyCard], limit: Int = 8) -> [QuizQuestion] {
        var unique: [StudyCard] = []
        var seen = Set<String>()
        for card in cards {
            if seen.insert(normalized(card.answer)).inserted { unique.append(card) }
        }
        guard unique.count >= 2 else { return [] }
        return unique.prefix(max(0, limit)).enumerated().map { index, card in
            let distractors = unique.filter { $0.id != card.id }.prefix(3).map(\.answer)
            let options = [card.answer] + distractors
            let rotate = index % options.count
            return QuizQuestion(cardID: card.id, question: card.question, answer: card.answer,
                                options: Array(options[rotate...]) + Array(options[..<rotate]))
        }
    }
}
