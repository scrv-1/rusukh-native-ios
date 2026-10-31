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
