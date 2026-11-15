import Foundation
import XCTest
@testable import RusukhCore

final class ModelDownloadTests: XCTestCase {
    func testResumeSendsRangeAndCompletesTheHash() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let payload = Data("abc".utf8)
        let file = ModelDownload.File(
            name: "fixture-a.txt", bytes: 3,
            sha256: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
            source: URL(string: "https://model.test/fixture-a.txt")!)
        try Data("ab".utf8).write(to: directory.appendingPathComponent("fixture-a.txt.partial"))
        StubDownload.handler = { request in
            XCTAssertEqual(request.value(forHTTPHeaderField: "Range"), "bytes=2-")
            return (206, Data("c".utf8))
        }
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [StubDownload.self]
        let session = URLSession(configuration: configuration)
        defer { session.invalidateAndCancel() }
        try await ModelDownload.transfer(file, to: directory, session: session)
        XCTAssertEqual(try Data(contentsOf: directory.appendingPathComponent("fixture-a.txt")), payload)
        XCTAssertFalse(FileManager.default.fileExists(atPath: directory.appendingPathComponent("fixture-a.txt.partial").path))
    }

    func testFreshRequestDoesNotSendRange() {
        let file = ModelDownload.File(name: "a.txt", bytes: 3, sha256: "abc", source: URL(string: "https://model.test/a.txt")!)
        XCTAssertNil(ModelDownload.request(for: file, existingBytes: 0).value(forHTTPHeaderField: "Range"))
        XCTAssertEqual(ModelDownload.request(for: file, existingBytes: 2).value(forHTTPHeaderField: "Range"), "bytes=2-")
    }
}

private final class StubDownload: URLProtocol, @unchecked Sendable {
    nonisolated(unsafe) static var handler: ((URLRequest) -> (Int, Data))?
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        let (status, data) = Self.handler?(request) ?? (500, Data())
        let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: data)
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}
