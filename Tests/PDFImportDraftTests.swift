import XCTest
@testable import RusukhCore

final class PDFImportDraftTests: XCTestCase {
    func testDraftPreservesPageNumbersSourceAndMissingTextWarning() throws {
        let document = PDFTextDocument(pages: [
            PDFTextPage(number: 1, text: "الماء أساس الحياة"),
            PDFTextPage(number: 2, text: " \n "),
            PDFTextPage(number: 3, text: "س: ما الأساس؟\nج: الماء")
        ])
        let draft = try PDFImportDraft(document: document, sourceFileName: "علوم.pdf")
        XCTAssertEqual(draft.title, "علوم")
        XCTAssertEqual(draft.totalPages, 3)
        XCTAssertEqual(draft.pagesWithoutText, [2])
        XCTAssertTrue(draft.body.contains("المصدر: علوم.pdf"))
        XCTAssertTrue(draft.body.contains("[صفحة 1]\nالماء أساس الحياة"))
        XCTAssertTrue(draft.body.contains("[صفحة 2 — لم يُستخرج نص]"))
        XCTAssertTrue(draft.body.contains("[صفحة 3]\nس: ما الأساس؟\nج: الماء"))
        // The ordinary note/backup schema carries the provenance without migration.
        let note = StudyNote(title: draft.title, body: draft.body)
        let snapshot = try StudyRepository.decode(StudyRepository.encode(StudySnapshot(notes: [note])))
        XCTAssertEqual(snapshot.notes, [note])
        XCTAssertTrue(snapshot.cards.isEmpty, "Preparing/reviewing extracted text must not create cards")
    }

    func testPageAndSourceLabelsCountTowardsPersistedNoteLimit() {
        let document = PDFTextDocument(pages: [PDFTextPage(number: 1, text: String(repeating: "ع", count: 1_000_000))])
        XCTAssertThrowsError(try PDFImportDraft(document: document, sourceFileName: "علوم.pdf")) { error in
            guard case PDFImportError.textTooLong = error else { return XCTFail("Wrong rejection: \(error)") }
        }
    }

    func testNoTextDraftIsRejectedRatherThanSavingOnlyLabels() {
        let document = PDFTextDocument(pages: [PDFTextPage(number: 1, text: " \n")])
        XCTAssertThrowsError(try PDFImportDraft(document: document, sourceFileName: "scan.pdf"))
    }

    func testExactStoredCharacterBoundaryIsAcceptedWithoutRemovingFinalFact() throws {
        let prefix = "المصدر: علوم.pdf\n\n[صفحة 1]\n"
        let finalFact = "العاصمة باريس"
        let text = String(repeating: "ع", count: 1_000_000 - prefix.count - finalFact.count) + finalFact
        let document = PDFTextDocument(pages: [PDFTextPage(number: 1, text: text)])
        let draft = try PDFImportDraft(document: document, sourceFileName: "علوم.pdf")
        XCTAssertEqual(draft.body.count, 1_000_000)
        XCTAssertTrue(draft.body.hasSuffix(finalFact))
    }
}
