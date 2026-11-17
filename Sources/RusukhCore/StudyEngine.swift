import Foundation

public enum StudyEngine {
    public static func matches(_ note: StudyNote, query: String) -> Bool {
        let terms = searchText(query).split(separator: " ")
        // A query that collapses to nothing (tatweel or marks only) must not match every note.
        if terms.isEmpty { return false }
        let text = searchText(note.title + "\n" + note.body)
        return terms.allSatisfy { text.contains($0) }
    }

    /// Search folding only. Graph titles stay on `normalized` so hamza variants are not merged into one node.
    private static func searchText(_ text: String) -> String {
        let withoutMarks = String(String.UnicodeScalarView(text.unicodeScalars.filter {
            $0.properties.generalCategory != .nonspacingMark
        }))
        let folded = withoutMarks.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: Locale(identifier: "ar"))
            .replacingOccurrences(of: "ـ", with: "")
        return normalized(foldArabicLetters(folded))
    }

    /// أ إ آ ٱ → ا and ى → ي. ة stays distinct from ه.
    private static func foldArabicLetters(_ text: String) -> String {
        var result = ""
        result.reserveCapacity(text.count)
        for scalar in text.unicodeScalars {
            switch scalar {
            case "أ", "إ", "آ", "ٱ": result.append("ا")
            case "ى": result.append("ي")
            default: result.unicodeScalars.append(scalar)
            }
        }
        return result
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
        var result: [GraphEdge] = []
        var seen = Set<GraphEdge>()
        for note in notes {
            for link in wikiLinks(in: note.body) {
                // Every note with that title. Never pick one duplicate and hide the rest.
                for target in groups[normalized(link), default: []] where target.id != note.id {
                    let edge = GraphEdge(from: note.id, to: target.id)
                    if seen.insert(edge).inserted { result.append(edge) }
                }
            }
        }
        return result
    }

    public static func notes(matching title: String, in notes: [StudyNote], excluding id: UUID? = nil) -> [StudyNote] {
        let key = normalized(title)
        return notes.filter { normalized($0.title) == key && $0.id != id }
    }

    // Explicit human-written Q: / A: lines; not an AI generator.
    // Continuation lines belong to the open question or answer. A blank line ends an answer.
    public static func questionAnswers(from text: String) -> [(question: String, answer: String)] {
        let prompt = #"^(س|Q)\s*[:：]\s*"#
        let response = #"^(ج|A)\s*[:：]\s*"#
        var question: [String] = []
        var answer: [String] = []
        var inAnswer = false
        var result: [(question: String, answer: String)] = []
        func close() {
            let q = question.joined(separator: "\n").trimmingCharacters(in: .whitespacesAndNewlines)
            let a = answer.joined(separator: "\n").trimmingCharacters(in: .whitespacesAndNewlines)
            if !q.isEmpty, !a.isEmpty { result.append((q, a)) }
            question = []
            answer = []
            inAnswer = false
        }
        for raw in text.components(separatedBy: .newlines) {
            let line = raw.trimmingCharacters(in: .whitespacesAndNewlines)
            if let match = line.range(of: prompt, options: [.regularExpression, .caseInsensitive]) {
                close()
                let value = String(line[match.upperBound...]).trimmingCharacters(in: .whitespacesAndNewlines)
                if !value.isEmpty { question = [value] }
            } else if let match = line.range(of: response, options: [.regularExpression, .caseInsensitive]) {
                guard !question.isEmpty else { continue }
                let value = String(line[match.upperBound...]).trimmingCharacters(in: .whitespacesAndNewlines)
                answer = value.isEmpty ? [] : [value]
                inAnswer = true
            } else if line.isEmpty {
                if inAnswer { close() }
            } else if inAnswer {
                answer.append(line)
            } else if !question.isEmpty {
                question.append(line)
            }
        }
        close()
        return result
    }

    /// True when a line looks like a card marker, even if it did not form a pair.
    public static func looksLikeCardPrompt(_ text: String) -> Bool {
        let marker = #"^(س|ج|Q|A)\s*[:：]"#
        return text.components(separatedBy: .newlines).contains { line in
            line.trimmingCharacters(in: .whitespacesAndNewlines)
                .range(of: marker, options: [.regularExpression, .caseInsensitive]) != nil
        }
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
