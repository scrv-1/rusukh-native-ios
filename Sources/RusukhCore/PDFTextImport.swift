import Foundation

public enum PDFImportError: LocalizedError {
    case tooLarge, invalidDocument, locked, tooManyPages, noText, textTooLong
    public var errorDescription: String? {
        switch self {
        case .tooLarge: return "اختر ملف PDF أصغر من 20 ميغابايت."
        case .invalidDocument: return "تعذّر فتح ملف PDF."
        case .locked: return "الملف محمي بكلمة مرور؛ صدّر نسخة مفتوحة أولًا."
        case .tooManyPages: return "يمكن استيراد 100 صفحة في المرة الواحدة. قسّم الملف أولًا."
        case .noText: return "لم يُعثر على نص قابل للاستخراج. هذا الإصدار لا يحوّل الصفحات المصوّرة إلى نص بعد."
        case .textTooLong: return "نص الملف أطول من حجم الملاحظة المسموح؛ قسّم الملف أولًا."
        }
    }
}

/// Text only: a blank/scanned page stays represented so later page numbers never shift.
public struct PDFTextPage: Equatable, Sendable {
    public let number: Int
    public let text: String
    public init(number: Int, text: String) { self.number = number; self.text = text }
    public var hasText: Bool { !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
}

public struct PDFTextDocument: Equatable, Sendable {
    public let pages: [PDFTextPage]
    public init(pages: [PDFTextPage]) { self.pages = pages }
    public var pagesWithoutText: [Int] { pages.filter { !$0.hasText }.map(\.number) }
    /// Kept for the original read/text API. New imports use the provenance-bearing draft.
    public var text: String { pages.filter(\.hasText).map(\.text).joined(separator: "\n\n") }
}

/// An editable, uncommitted proposal. Creating it never writes notes or review cards.
public struct PDFImportDraft: Equatable, Sendable {
    public let title: String
    public let body: String
    public let totalPages: Int
    public let pagesWithoutText: [Int]

    public init(document: PDFTextDocument, sourceFileName: String) throws {
        guard document.pages.contains(where: \.hasText) else { throw PDFImportError.noText }
        guard document.pages.count <= 100 else { throw PDFImportError.tooManyPages }
        let name = String(sourceFileName.replacingOccurrences(of: "\r", with: " ")
            .replacingOccurrences(of: "\n", with: " ").prefix(500))
        let cleanTitle = (name as NSString).deletingPathExtension.trimmingCharacters(in: .whitespacesAndNewlines)
        title = cleanTitle.isEmpty ? "ملف PDF" : cleanTitle
        totalPages = document.pages.count
        pagesWithoutText = document.pagesWithoutText
        var extracted = "المصدر: \(name.isEmpty ? "ملف PDF" : name)"
        var characters = extracted.count
        for page in document.pages {
            let section = page.hasText
                ? "\n\n[صفحة \(page.number)]\n\(page.text)"
                : "\n\n[صفحة \(page.number) — لم يُستخرج نص]"
            // Include labels in the storage limit, not only the extracted PDF text.
            characters += section.count
            guard characters <= 1_000_000 else { throw PDFImportError.textTooLong }
            extracted += section
        }
        body = extracted
    }
}

#if canImport(PDFKit)
import PDFKit

public enum PDFTextImport {
    public static let maximumBytes = 20_000_000

    // Caller retains security-scoped access for the duration of this synchronous read.
    // Create PDFKit objects on the worker that owns them; only return value types.
    public static func read(from url: URL) throws -> String {
        try readDocument(from: url).text
    }

    public static func readDocument(from url: URL) throws -> PDFTextDocument {
        try Task.checkCancellation()
        let size = try url.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
        guard size < maximumBytes else { throw PDFImportError.tooLarge }
        let handle = try FileHandle(forReadingFrom: url)
        defer { try? handle.close() }
        let data = try handle.read(upToCount: maximumBytes) ?? Data()
        guard data.count < maximumBytes else { throw PDFImportError.tooLarge }
        return try document(from: data)
    }

    public static func text(from data: Data) throws -> String {
        try document(from: data).text
    }

    public static func document(from data: Data) throws -> PDFTextDocument {
        try Task.checkCancellation()
        guard data.count < maximumBytes else { throw PDFImportError.tooLarge }
        guard let document = PDFDocument(data: data) else { throw PDFImportError.invalidDocument }
        guard !document.isLocked else { throw PDFImportError.locked }
        guard document.pageCount <= 100 else { throw PDFImportError.tooManyPages }
        var pages: [PDFTextPage] = []
        var characters = 0
        for index in 0..<document.pageCount {
            try Task.checkCancellation()
            let text = document.page(at: index)?.string ?? ""
            characters += text.count + 2
            guard characters <= 1_000_000 else { throw PDFImportError.textTooLong }
            pages.append(PDFTextPage(number: index + 1, text: text))
        }
        guard pages.contains(where: \.hasText) else { throw PDFImportError.noText }
        return PDFTextDocument(pages: pages)
    }
}
#endif
