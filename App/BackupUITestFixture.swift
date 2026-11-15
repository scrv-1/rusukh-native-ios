#if DEBUG
import Foundation

/// Seeds only a document the UI test can choose using Apple's file picker.
/// It neither opens the library store nor invokes any import/restore API.
enum BackupUITestFixture {
    static func prepareIfRequested() throws {
        let arguments = ProcessInfo.processInfo.arguments
        guard arguments.contains("-ui-testing"), arguments.contains("-backup-fixture") else { return }

        let directory = try FileManager.default.url(for: .documentDirectory, in: .userDomainMask,
                                                    appropriateFor: nil, create: true)
        let createdAt = Date(timeIntervalSince1970: 1_700_000_000)
        let first = StudyNote(id: UUID(uuidString: "B35B338D-F0C1-4E37-9549-E5090DAA7A01")!,
                              title: "نسخة الاختبار المستوردة", body: "[[رابط النسخة المستوردة]]",
                              createdAt: createdAt, updatedAt: createdAt)
        let second = StudyNote(id: UUID(uuidString: "B35B338D-F0C1-4E37-9549-E5090DAA7A02")!,
                               title: "رابط النسخة المستوردة", body: "بيانات اصطناعية لاختبار الاستيراد.",
                               createdAt: createdAt, updatedAt: createdAt)
        let card = StudyCard(id: UUID(uuidString: "B35B338D-F0C1-4E37-9549-E5090DAA7A03")!,
                             noteID: first.id, question: "ما نوع هذه البيانات؟", answer: "بيانات اختبار اصطناعية",
                             dueAt: createdAt, updatedAt: createdAt)
        let snapshot = StudySnapshot(notes: [first, second], cards: [card])
        let destination = directory.appendingPathComponent("RusukhBackupUITest.json")
        try StudyRepository.encode(snapshot).write(to: destination, options: [.atomic])
    }
}
#endif
