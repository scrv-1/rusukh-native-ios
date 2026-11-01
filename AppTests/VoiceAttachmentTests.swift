import XCTest
import AVFoundation
@testable import RusukhNative

private final class AudioFactoryProbe: @unchecked Sendable {
    private let lock = NSLock()
    private var count = 0
    private var capturedURL: URL?
    private var capturedObject: AnyObject?
    func increment(url: URL? = nil) { lock.lock(); count += 1; capturedURL = url; lock.unlock() }
    var value: Int { lock.lock(); defer { lock.unlock() }; return count }
    var url: URL? { lock.lock(); defer { lock.unlock() }; return capturedURL }
    func store(_ object: AnyObject) { lock.lock(); capturedObject = object; lock.unlock() }
    var object: AnyObject? { lock.lock(); defer { lock.unlock() }; return capturedObject }
}
private struct ImmediateAudioDriver: AudioSessionDriver {
    func activate(_ mode: AudioSessionMode) throws { }
    func deactivate() throws { }
}
private final class StubRecorder: AVAudioRecorder, @unchecked Sendable {
    let recordCalls = AudioFactoryProbe()
    override func record(forDuration duration: TimeInterval) -> Bool { recordCalls.increment(); return true }
}
private final class AlreadyFinishedPlayer: AVAudioPlayer, @unchecked Sendable {
    override func play() -> Bool { true }
    override var isPlaying: Bool { false }
}

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
    func testSuccessfulRecorderFactoryReturningAfterCloseNeverStarts() async throws {
        let entered = expectation(description: "Factory entered")
        let unblock = DispatchSemaphore(value: 0)
        let probe = AudioFactoryProbe()
        let session = AudioSessionCoordinator(driver: ImmediateAudioDriver())
        let voice = VoiceAttachment(data: Data([1, 2, 3]), session: session, requestPermission: { true }, makeRecorder: { url in
            let recorder = try StubRecorder(url: url, settings: [AVFormatIDKey: kAudioFormatMPEG4AAC, AVSampleRateKey: 22_050, AVNumberOfChannelsKey: 1])
            probe.increment(url: url)
            probe.store(recorder)
            entered.fulfill()
            guard unblock.wait(timeout: .now() + 5) == .success else { throw CocoaError(.fileWriteUnknown) }
            // A successful object creation must still be canceled before record().
            return recorder
        })
        let task = Task { await voice.start() }
        await fulfillment(of: [entered], timeout: 3)
        voice.close()
        unblock.signal()
        await task.value
        XCTAssertEqual(try XCTUnwrap(probe.object as? StubRecorder).recordCalls.value, 0)
        XCTAssertFalse(FileManager.default.fileExists(atPath: try XCTUnwrap(probe.url).path))
        XCTAssertEqual(voice.data, Data([1, 2, 3]))
        XCTAssertFalse(voice.recording)
        XCTAssertFalse(voice.busy)
    }

    func testPlaybackEndedBeforeHandoffDoesNotRemainPlaying() async throws {
        let session = AudioSessionCoordinator(driver: ImmediateAudioDriver())
        let voice = VoiceAttachment(data: Data([1]), session: session, makePlayer: { _ in
            // A valid one-frame PCM WAV initializes AVAudioPlayer; the stub
            // models successful play followed by completion before UI handoff.
            let bytes: [UInt8] = [82,73,70,70,38,0,0,0,87,65,86,69,102,109,116,32,16,0,0,0,1,0,1,0,128,62,0,0,0,125,0,0,2,0,16,0,100,97,116,97,2,0,0,0,0,0]
            return try AlreadyFinishedPlayer(data: Data(bytes))
        })
        await voice.play()
        XCTAssertFalse(voice.playing)
        XCTAssertFalse(voice.busy)
        XCTAssertNil(voice.error)
        let next = UUID()
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            session.activate(owner: next, mode: .playback) { continuation.resume(with: $0) }
        }
        await withCheckedContinuation { continuation in session.release(owner: next) { continuation.resume() } }
    }
    func testCloseDuringRecorderInitializationCleansPendingFileOffMain() async throws {
        let started = expectation(description: "Recorder factory entered")
        let unblock = DispatchSemaphore(value: 0)
        let probe = AudioFactoryProbe()
        let activeSession = AudioSessionCoordinator(driver: ImmediateAudioDriver())
        let voice = VoiceAttachment(data: Data([1, 2, 3]), session: activeSession, requestPermission: { true }, makeRecorder: { url in
            XCTAssertFalse(Thread.isMainThread)
            probe.increment(url: url)
            try Data([9]).write(to: url)
            started.fulfill()
            guard unblock.wait(timeout: .now() + 5) == .success else { throw CocoaError(.fileWriteUnknown) }
            throw CocoaError(.fileWriteUnknown)
        })
        let task = Task { await voice.start() }
        await fulfillment(of: [started], timeout: 3)
        voice.close()
        unblock.signal()
        await task.value
        XCTAssertEqual(probe.value, 1)
        XCTAssertFalse(FileManager.default.fileExists(atPath: try XCTUnwrap(probe.url).path))
        XCTAssertEqual(voice.data, Data([1, 2, 3]))
        XCTAssertFalse(voice.busy)
        XCTAssertFalse(voice.recording)
        XCTAssertNil(voice.error)
    }
    func testClosingDuringPermissionNeverCreatesRecorder() async {
        let permissionEntered = expectation(description: "Permission requested")
        var permission: CheckedContinuation<Bool, Never>?
        let recorderAttempts = AudioFactoryProbe()
        let original = Data([1, 2, 3])
        let voice = VoiceAttachment(data: original, requestPermission: {
            guard !Task.isCancelled else { return false }
            return await withCheckedContinuation { continuation in
                permission = continuation
                permissionEntered.fulfill()
            }
        }, makeRecorder: { _ in recorderAttempts.increment(); throw CocoaError(.fileWriteUnknown) })
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
        XCTAssertEqual(recorderAttempts.value, 0)
        XCTAssertFalse(voice.busy)
        XCTAssertFalse(voice.recording)
        XCTAssertEqual(voice.data, original)
        XCTAssertNil(voice.error)
    }

    func testBackgroundDuringActivationNeverCreatesRecorderAndReleasesSession() async throws {
        let started = expectation(description: "Activation blocked")
        let driver = DelayedSessionDriver(started: started)
        let session = AudioSessionCoordinator(driver: driver)
        let recorderAttempts = AudioFactoryProbe()
        let original = Data([1, 2, 3])
        let voice = VoiceAttachment(data: original, session: session, requestPermission: { true },
                                    makeRecorder: { _ in recorderAttempts.increment(); throw CocoaError(.fileWriteUnknown) })
        let task = Task { await voice.start() }
        await fulfillment(of: [started], timeout: 3)
        XCTAssertTrue(voice.preparing)
        voice.pauseForBackground()
        driver.unblock.signal()
        await task.value
        XCTAssertEqual(recorderAttempts.value, 0)
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
        let playerAttempts = AudioFactoryProbe()
        let original = Data([1, 2, 3])
        let voice = VoiceAttachment(data: original, session: session,
                                    makePlayer: { _ in playerAttempts.increment(); throw CocoaError(.fileReadUnknown) })
        let task = Task { await voice.play() }
        await fulfillment(of: [started], timeout: 3)
        voice.close()
        driver.unblock.signal()
        await task.value
        XCTAssertEqual(playerAttempts.value, 0)
        XCTAssertFalse(voice.playing)
        XCTAssertFalse(voice.busy)
        XCTAssertEqual(voice.data, original)
        XCTAssertNil(voice.error)
    }

    func testPermissionDeniedPreservesPreviousAttachmentAndAllowsRetry() async {
        var requests = 0
        let recorderAttempts = AudioFactoryProbe()
        let original = Data([1, 2, 3])
        let voice = VoiceAttachment(data: original, requestPermission: { requests += 1; return false },
                                    makeRecorder: { _ in recorderAttempts.increment(); throw CocoaError(.fileWriteUnknown) })
        await voice.start()
        XCTAssertNotNil(voice.error)
        XCTAssertFalse(voice.busy)
        await voice.start()
        XCTAssertEqual(requests, 2)
        XCTAssertEqual(recorderAttempts.value, 0)
        XCTAssertEqual(voice.data, original)
        voice.close()
    }
}
