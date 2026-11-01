import XCTest
import AVFoundation
@testable import RusukhNative

private final class DelayedSessionDriver: AudioSessionDriver, @unchecked Sendable {
    private let lock = NSLock()
    private var first = true
    let started: XCTestExpectation
    let unblock = DispatchSemaphore(value: 0)
    init(started: XCTestExpectation) { self.started = started }
    func activate(_ mode: AudioSessionMode) throws {
        lock.lock(); let shouldBlock = first; first = false; lock.unlock()
        if shouldBlock {
            started.fulfill()
            guard unblock.wait(timeout: .now() + 5) == .success else { throw CocoaError(.fileReadUnknown) }
        }
    }
    func deactivate() throws { }
}

@MainActor
final class VoiceAttachmentTests: XCTestCase {
    func testClosingDuringPermissionNeverCreatesRecorder() async {
        let permissionEntered = expectation(description: "Permission requested")
        var permission: CheckedContinuation<Bool, Never>?
        var recorderAttempts = 0
        let original = Data([1, 2, 3])
        let voice = VoiceAttachment(data: original, requestPermission: {
            guard !Task.isCancelled else { return false }
            return await withCheckedContinuation { continuation in
                permission = continuation
                permissionEntered.fulfill()
            }
        }, makeRecorder: { _ in recorderAttempts += 1; throw CocoaError(.fileWriteUnknown) })
        let task = Task { await voice.start() }
        await fulfillment(of: [permissionEntered], timeout: 3)
        guard let permission else {
            task.cancel()
            voice.close()
            XCTFail("Permission callback did not arrive")
            return
        }
        XCTAssertTrue(voice.requestingPermission)
        voice.close()
        permission.resume(returning: true)
        await task.value
        XCTAssertEqual(recorderAttempts, 0)
        XCTAssertFalse(voice.busy)
        XCTAssertFalse(voice.recording)
        XCTAssertEqual(voice.data, original)
        XCTAssertNil(voice.error)
    }

    func testBackgroundDuringActivationNeverCreatesRecorderAndReleasesSession() async throws {
        let started = expectation(description: "Activation blocked")
        let driver = DelayedSessionDriver(started: started)
        let session = AudioSessionCoordinator(driver: driver)
        var recorderAttempts = 0
        let original = Data([1, 2, 3])
        let voice = VoiceAttachment(data: original, session: session, requestPermission: { true },
                                    makeRecorder: { _ in recorderAttempts += 1; throw CocoaError(.fileWriteUnknown) })
        let task = Task { await voice.start() }
        await fulfillment(of: [started], timeout: 3)
        XCTAssertTrue(voice.preparing)
        voice.pauseForBackground()
        driver.unblock.signal()
        await task.value
        XCTAssertEqual(recorderAttempts, 0)
        XCTAssertFalse(voice.recording)
        XCTAssertFalse(voice.busy)
        XCTAssertEqual(voice.data, original)
        XCTAssertNil(voice.error)
        // The canceled editor must not leave the singleton owned forever.
        let nextOwner = UUID()
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            session.activate(owner: nextOwner, mode: .playback) { continuation.resume(with: $0) }
        }
        await withCheckedContinuation { continuation in
            session.release(owner: nextOwner) { continuation.resume() }
        }
    }

    func testCloseDuringPlaybackActivationNeverCreatesPlayer() async {
        let started = expectation(description: "Playback activation blocked")
        let driver = DelayedSessionDriver(started: started)
        let session = AudioSessionCoordinator(driver: driver)
        var playerAttempts = 0
        let original = Data([1, 2, 3])
        let voice = VoiceAttachment(data: original, session: session,
                                    makePlayer: { _ in playerAttempts += 1; throw CocoaError(.fileReadUnknown) })
        let task = Task { await voice.play() }
        await fulfillment(of: [started], timeout: 3)
        voice.close()
        driver.unblock.signal()
        await task.value
        XCTAssertEqual(playerAttempts, 0)
        XCTAssertFalse(voice.playing)
        XCTAssertFalse(voice.busy)
        XCTAssertEqual(voice.data, original)
        XCTAssertNil(voice.error)
    }

    func testPermissionDeniedPreservesPreviousAttachmentAndAllowsRetry() async {
        var requests = 0
        var recorderAttempts = 0
        let original = Data([1, 2, 3])
        let voice = VoiceAttachment(data: original, requestPermission: { requests += 1; return false },
                                    makeRecorder: { _ in recorderAttempts += 1; throw CocoaError(.fileWriteUnknown) })
        await voice.start()
        XCTAssertNotNil(voice.error)
        XCTAssertFalse(voice.busy)
        await voice.start()
        XCTAssertEqual(requests, 2)
        XCTAssertEqual(recorderAttempts, 0)
        XCTAssertEqual(voice.data, original)
        voice.close()
    }
}
