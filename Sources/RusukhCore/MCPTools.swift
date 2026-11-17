import Foundation

/// Minimal, verifiable tool layer that MCP (or any external controller) can call.
/// Operates purely on StudySnapshot so it can be tested without the full app.
/// Later this will be the contract between the Remote MCP Server and the app services.
public struct RusukhMCPTools {
    public var snapshot: StudySnapshot

    public init(snapshot: StudySnapshot) {
        self.snapshot = snapshot
    }

    // MARK: - Notes

    public func listNotes(limit: Int = 50) -> [[String: Any]] {
        snapshot.notes.prefix(limit).map { note in
            [
                "id": note.id.uuidString,
                "title": note.title,
                "updatedAt": ISO8601DateFormatter().string(from: note.updatedAt),
                "bodyPreview": String(note.body.prefix(200))
            ]
        }
    }

    public func getNote(id: String) -> [String: Any]? {
        guard let uuid = UUID(uuidString: id),
              let note = snapshot.notes.first(where: { $0.id == uuid }) else { return nil }
        return [
            "id": note.id.uuidString,
            "title": note.title,
            "body": note.body,
            "createdAt": ISO8601DateFormatter().string(from: note.createdAt),
            "updatedAt": ISO8601DateFormatter().string(from: note.updatedAt)
        ]
    }

    public func searchNotes(query: String) -> [[String: Any]] {
        snapshot.notes.filter { StudyEngine.matches($0, query: query) }.map { note in
            [
                "id": note.id.uuidString,
                "title": note.title,
                "bodyPreview": String(note.body.prefix(200))
            ]
        }
    }

    public mutating func createNote(title: String, body: String) -> [String: Any]? {
        let cleaned = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleaned.isEmpty else { return nil }
        let now = Date()
        let note = StudyNote(title: cleaned, body: body, createdAt: now, updatedAt: now)
        snapshot.notes.insert(note, at: 0)
        return [
            "id": note.id.uuidString,
            "title": note.title,
            "created": true
        ]
    }

    // MARK: - Cards

    public func listDueCards() -> [[String: Any]] {
        StudyEngine.dueCards(snapshot.cards).map { card in
            [
                "id": card.id.uuidString,
                "question": card.question,
                "answer": card.answer,
                "dueAt": ISO8601DateFormatter().string(from: card.dueAt)
            ]
        }
    }

    public func getAppStatus() -> [String: Any] {
        [
            "notes": snapshot.notes.count,
            "cards": snapshot.cards.count,
            "due": StudyEngine.dueCards(snapshot.cards).count,
            "reviews": snapshot.reviews.count,
            "version": snapshot.version,
            "independent": true,
            "mcpReady": true
        ]
    }
}
