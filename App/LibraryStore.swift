import Foundation
import SwiftUI

@MainActor
final class LibraryStore: ObservableObject {
    @Published private(set) var snapshot: StudySnapshot = .empty
    @Published var message: String?
    @Published private(set) var storageLocked = false
    private let repository: StudyRepository

    init(repository override: StudyRepository? = nil) {
        if let override {
            repository = override
        } else {
        let directory = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        var relativePath = "RusukhNative/study.json"
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("-ui-testing") {
            relativePath = "RusukhNativeUITests/study.json"
            if ProcessInfo.processInfo.arguments.contains("-reset-test-data") {
                try? FileManager.default.removeItem(at: directory.appendingPathComponent(relativePath))
            }
        }
        #endif
        repository = StudyRepository(fileURL: directory.appendingPathComponent(relativePath))
        }
        let restored = repository.restoringLoad()
        snapshot = restored.snapshot
        message = restored.notice
    }

    struct PendingImport {
        var incoming: StudySnapshot
        var noteCount: Int
        var cardCount: Int
    }
    @Published var pendingImport: PendingImport?

    var due: [StudyCard] { StudyEngine.dueCards(snapshot.cards) }

    private func commit(_ updated: StudySnapshot) -> Bool {
        var updated = updated
        if updated.cards.contains(where: { $0.fsrs != nil }) { updated.version = 2 }
        guard !storageLocked else { message = "البيانات مقفلة للحفاظ على نسخة الملف المعطوبة."; return false }
        do {
            try repository.save(updated)
            snapshot = updated
            message = nil
            return true
        } catch {
            message = "تعذّر الحفظ: \(error.localizedDescription)"
            return false
        }
    }

    @discardableResult
    func saveNote(id: UUID? = nil, title: String, body: String, imageJPEG: Data?, audioM4A: Data? = nil) -> StudyNote? {
        let cleaned = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleaned.isEmpty else { message = "أدخل عنوانًا للملاحظة."; return nil }
        var draft = snapshot
        let now = Date()
        let saved: StudyNote
        if let id, draft.notes.contains(where: { $0.id == id }) {
            guard var renamed = StudyEngine.renamedNotes(draft.notes, id: id, to: cleaned, now: now),
                  let index = renamed.firstIndex(where: { $0.id == id }) else {
                message = "تعذّر إعادة التسمية."
                return nil
            }
            renamed[index].body = body
            renamed[index].imageJPEG = imageJPEG
            renamed[index].audioM4A = audioM4A
            renamed[index].updatedAt = now
            draft.notes = renamed
            saved = renamed[index]
        } else {
            saved = StudyNote(title: cleaned, body: body, createdAt: now, updatedAt: now, imageJPEG: imageJPEG, audioM4A: audioM4A)
            draft.notes.insert(saved, at: 0)
        }
        return commit(draft) ? saved : nil
    }

    func delete(_ note: StudyNote) {
        var draft = snapshot
        let ids = Set(draft.cards.filter { $0.noteID == note.id }.map(\.id))
        draft.notes.removeAll { $0.id == note.id }
        draft.cards.removeAll { $0.noteID == note.id }
        draft.reviews.removeAll { ids.contains($0.cardID) }
        _ = commit(draft)
    }

    func addCard(noteID: UUID, question: String, answer: String) -> Bool {
        let q = question.trimmingCharacters(in: .whitespacesAndNewlines)
        let a = answer.trimmingCharacters(in: .whitespacesAndNewlines)
        guard snapshot.notes.contains(where: { $0.id == noteID }), !q.isEmpty, !a.isEmpty else { return false }
        var draft = snapshot
        draft.cards.append(ReviewScheduler.newCard(noteID: noteID, question: q, answer: a))
        return commit(draft)
    }

    func importQACards(for noteID: UUID) -> Int {
        guard let note = snapshot.notes.first(where: { $0.id == noteID }) else { return 0 }
        let pairs = StudyEngine.questionAnswers(from: note.body)
        var draft = snapshot
        let before = draft.cards.filter { $0.noteID == noteID }.count
        let synced = StudyEngine.syncedCards(existing: draft.cards, noteID: noteID, pairs: pairs)
        let changed = synced != draft.cards
        draft.cards = synced
        if changed && !commit(draft) { return 0 }
        return max(0, synced.filter { $0.noteID == noteID }.count - before)
    }

    func review(card: StudyCard, grade: ReviewGrade) {
        guard let index = snapshot.cards.firstIndex(where: { $0.id == card.id }) else { return }
        var draft = snapshot
        let now = Date()
        do {
            draft.cards[index] = try ReviewScheduler.scheduled(draft.cards[index], grade: grade, now: now)
            draft.reviews.append(ReviewEvent(cardID: card.id, grade: grade, at: now))
            _ = commit(draft)
        } catch {
            message = "تعذّر تحديث موعد المراجعة؛ لم تتغير البطاقة."
        }
    }

    func exportToTemporaryFile() -> URL? {
        do {
            let data = try StudyRepository.encode(snapshot)
            let location = FileManager.default.temporaryDirectory.appendingPathComponent("rusukh-native-backup-\(UUID().uuidString).json")
            try data.write(to: location, options: .atomic)
            return location
        } catch {
            message = "تعذّر التصدير: \(error.localizedDescription)"
            return nil
        }
    }

    func importFromFile(_ url: URL, mode: StudyImportMode = .replace) {
        guard !storageLocked else { message = "الملف الحالي محمي؛ لا يمكن الاستيراد قبل معالجة خطأ القراءة."; return }
        let access = url.startAccessingSecurityScopedResource()
        defer { if access { url.stopAccessingSecurityScopedResource() } }
        do {
            let incoming = try StudyRepository.read(from: url)
            if mode == .replace {
                pendingImport = PendingImport(incoming: incoming, noteCount: incoming.notes.count, cardCount: incoming.cards.count)
                message = "الملف صالح: \(incoming.notes.count) ملاحظة و\(incoming.cards.count) بطاقة. أكّد الاستبدال قبل أن يحل محل بياناتك."
                return
            }
            let result = try StudyLibrary.applying(snapshot, incoming: incoming, mode: .merge)
            guard commit(result) else { return }
            message = "دُمجت البيانات مع الحالي. نُسخت النسخة السابقة تلقائيًا قبل الحفظ."
        } catch {
            message = "لم يتم تغيير بياناتك؛ فشل الاستيراد: \(error.localizedDescription)"
        }
    }

    func confirmPendingImport() {
        guard let pending = pendingImport else { return }
        do {
            let result = try repository.replace(snapshot, with: pending.incoming, confirmed: true)
            pendingImport = nil
            guard commit(result) else { return }
            message = "استُبدلت البيانات. النسخة السابقة محفوظة على الجهاز."
        } catch {
            message = "لم يتم تغيير بياناتك؛ فشل الاستيراد: \(error.localizedDescription)"
        }
    }

    func cancelPendingImport() {
        pendingImport = nil
    }
}
