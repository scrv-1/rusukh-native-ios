import CryptoKit
import Foundation

/// File download that continues from a `.partial` file. A later request sends a Range header.
/// This is the piece CI can run. A suspended-app background URLSession is not used here.
public enum ModelDownload {
    public struct File: Sendable, Equatable {
        public var name: String
        public var bytes: Int64
        public var sha256: String
        public var source: URL
        public init(name: String, bytes: Int64, sha256: String, source: URL) {
            self.name = name
            self.bytes = bytes
            self.sha256 = sha256
            self.source = source
        }
    }

    public enum Failure: Error, Equatable {
        case response(Int)
        case invalidFile
    }

    public static func request(for file: File, existingBytes: Int64) -> URLRequest {
        var request = URLRequest(url: file.source)
        if existingBytes > 0 && existingBytes < file.bytes {
            request.setValue("bytes=\(existingBytes)-", forHTTPHeaderField: "Range")
        }
        return request
    }

    public static func transfer(_ file: File, to directory: URL, session: URLSession) async throws {
        guard file.name == (file.name as NSString).lastPathComponent, !file.name.isEmpty else { throw Failure.invalidFile }
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let finalURL = directory.appendingPathComponent(file.name)
        if FileManager.default.fileExists(atPath: finalURL.path), try hashMatches(file, at: finalURL) { return }
        let partialURL = directory.appendingPathComponent(file.name + ".partial")
        var existing = existingPartialBytes(file, at: partialURL)
        let request = request(for: file, existingBytes: existing)
        let stream = StreamDelegate(partialURL: partialURL, existing: existing, limit: file.bytes)
        let streaming = URLSession(configuration: session.configuration, delegate: stream, delegateQueue: nil)
        defer { streaming.finishTasksAndInvalidate() }
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            stream.continuation = continuation
            streaming.dataTask(with: request).resume()
        }
        guard try hashMatches(file, at: partialURL) else {
            try? FileManager.default.removeItem(at: partialURL)
            throw Failure.invalidFile
        }
        if FileManager.default.fileExists(atPath: finalURL.path) { try FileManager.default.removeItem(at: finalURL) }
        try FileManager.default.moveItem(at: partialURL, to: finalURL)
    }

    private final class StreamDelegate: NSObject, URLSessionDataDelegate, @unchecked Sendable {
        let partialURL: URL
        var existing: Int64
        let limit: Int64
        var written: Int64 = 0
        var status = -1
        var handle: FileHandle?
        var failure: Error?
        var continuation: CheckedContinuation<Void, Error>?

        init(partialURL: URL, existing: Int64, limit: Int64) {
            self.partialURL = partialURL
            self.existing = existing
            self.limit = limit
        }

        func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive response: URLResponse, completionHandler: @escaping (URLSession.ResponseDisposition) -> Void) {
            status = (response as? HTTPURLResponse)?.statusCode ?? -1
            if existing > 0 && status == 200 {
                existing = 0
                try? FileManager.default.removeItem(at: partialURL)
            }
            let acceptable = (existing == 0 && status == 200) || (existing > 0 && status == 206)
            guard acceptable else {
                failure = Failure.response(status)
                completionHandler(.cancel)
                return
            }
            if existing == 0 { FileManager.default.createFile(atPath: partialURL.path, contents: nil) }
            handle = try? FileHandle(forWritingTo: partialURL)
            if existing > 0 { try? handle?.seekToEnd() }
            written = existing
            completionHandler(.allow)
        }

        func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
            written += Int64(data.count)
            if written > limit {
                failure = Failure.invalidFile
                dataTask.cancel()
                return
            }
            try? handle?.write(contentsOf: data)
        }

        func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
            try? handle?.close()
            guard let continuation else { return }
            self.continuation = nil
            if let failure {
                continuation.resume(throwing: failure)
            } else if let error = error as? URLError, error.code == .cancelled {
                continuation.resume(throwing: CancellationError())
            } else if let error {
                continuation.resume(throwing: error)
            } else {
                continuation.resume()
            }
        }
    }

    private static func existingPartialBytes(_ file: File, at url: URL) -> Int64 {
        guard let size = try? FileManager.default.attributesOfItem(atPath: url.path)[.size] as? NSNumber else { return 0 }
        let value = size.int64Value
        guard value > 0 && value < file.bytes else {
            try? FileManager.default.removeItem(at: url)
            return 0
        }
        return value
    }

    private static func hashMatches(_ file: File, at url: URL) throws -> Bool {
        let size = try FileManager.default.attributesOfItem(atPath: url.path)[.size] as? NSNumber
        guard size?.int64Value == file.bytes else { return false }
        let handle = try FileHandle(forReadingFrom: url)
        defer { try? handle.close() }
        var digest = SHA256()
        var read: Int64 = 0
        while let chunk = try handle.read(upToCount: 1_048_576), !chunk.isEmpty {
            read += Int64(chunk.count)
            guard read <= file.bytes else { return false }
            digest.update(data: chunk)
        }
        let actual = digest.finalize().map { String(format: "%02x", $0) }.joined()
        return read == file.bytes && actual == file.sha256
    }
}
