#if canImport(PDFKit)
import Foundation
import PDFKit

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

public enum PDFTextImport {
    public static let maximumBytes = 20_000_000

    // Caller retains security-scoped access for the duration of this synchronous read.
    // Create PDFKit objects on the worker that owns them; only return a String.
    public static func read(from url: URL) throws -> String {
        let size = try url.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
        guard size < maximumBytes else { throw PDFImportError.tooLarge }
        let handle = try FileHandle(forReadingFrom: url)
        defer { try? handle.close() }
        let data = try handle.read(upToCount: maximumBytes) ?? Data()
        guard data.count < maximumBytes else { throw PDFImportError.tooLarge }
        return try text(from: data)
    }

    public static func text(from data: Data) throws -> String {
        guard data.count < maximumBytes else { throw PDFImportError.tooLarge }
        guard let document = PDFDocument(data: data) else { throw PDFImportError.invalidDocument }
        guard !document.isLocked else { throw PDFImportError.locked }
        guard document.pageCount <= 100 else { throw PDFImportError.tooManyPages }
        var pages: [String] = []
        var characters = 0
        for index in 0..<document.pageCount {
            let text = document.page(at: index)?.string ?? ""
            characters += text.count + 2
            guard characters <= 1_000_000 else { throw PDFImportError.textTooLong }
            if !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { pages.append(text) }
        }
        guard !pages.isEmpty else { throw PDFImportError.noText }
        return pages.joined(separator: "\n\n")
    }
}
#endif
