#if canImport(PDFKit)
import Foundation
import CoreGraphics
import CoreText
import XCTest
@testable import RusukhCore

final class PDFImportTests: XCTestCase {
    func testExtractsTextFromRealPDFPages() throws {
        let data = try makePDF(pages: ["Rusukh local learning", "Recall and retention"])
        let text = try PDFTextImport.text(from: data)
        XCTAssertTrue(text.contains("Rusukh local learning"))
        XCTAssertTrue(text.contains("Recall and retention"))
        let note = StudyNote(title: "ملف دراسي", body: text)
        XCTAssertEqual(try StudyRepository.decode(StudyRepository.encode(StudySnapshot(notes: [note]))).notes, [note])
    }
    func testRejectsMalformedAndImageOnlyPDF() throws {
        XCTAssertThrowsError(try PDFTextImport.text(from: Data("not a PDF".utf8)))
        XCTAssertThrowsError(try PDFTextImport.text(from: makePDF(pages: [""])))
    }
    func testRejectsOversizedPDFBeforeParsing() {
        XCTAssertThrowsError(try PDFTextImport.text(from: Data(count: PDFTextImport.maximumBytes)))
    }
    func testRejectsTooManyPagesWithoutTruncation() throws {
        XCTAssertThrowsError(try PDFTextImport.text(from: makePDF(pages: Array(repeating: "page", count: 101))))
    }
    func testStructuredExtractionKeepsEmptyPagePositionsAndFinalPage() throws {
        let data = try makePDF(pages: ["First page", "", "Last page"])
        let document = try PDFTextImport.document(from: data)
        XCTAssertEqual(document.pages.map(\.number), [1, 2, 3])
        XCTAssertEqual(document.pagesWithoutText, [2])
        XCTAssertTrue(document.pages[0].text.contains("First page"))
        XCTAssertTrue(document.pages[2].text.contains("Last page"))
        let draft = try PDFImportDraft(document: document, sourceFileName: "lecture.pdf")
        XCTAssertTrue(draft.body.contains("[صفحة 3]"))
        XCTAssertTrue(draft.body.contains("Last page"))
    }
    @MainActor
    func testCancelledExtractionDoesNotReturnAPartialDocument() async throws {
        let data = try makePDF(pages: ["First page", "Last page"])
        let task = Task { try PDFTextImport.document(from: data) }
        task.cancel()
        do {
            _ = try await task.value
            XCTFail("A canceled import must not return a draft")
        } catch is CancellationError {
            // Expected: canceled before entering PDFKit parsing.
        } catch {
            XCTFail("Unexpected error: \(error)")
        }
    }
    private func makePDF(pages: [String]) throws -> Data {
        let data = NSMutableData()
        let consumer = try XCTUnwrap(CGDataConsumer(data: data as CFMutableData))
        var box = CGRect(x: 0, y: 0, width: 300, height: 300)
        let context = try XCTUnwrap(CGContext(consumer: consumer, mediaBox: &box, nil))
        for text in pages {
            context.beginPDFPage(nil)
            context.textPosition = CGPoint(x: 20, y: 240)
            let line = CTLineCreateWithAttributedString(NSAttributedString(string: text) as CFAttributedString)
            CTLineDraw(line, context)
            context.endPDFPage()
        }
        context.closePDF()
        return data as Data
    }
}
#endif
