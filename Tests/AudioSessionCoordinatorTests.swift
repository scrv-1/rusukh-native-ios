import XCTest
@testable import RusukhCore

private final class RecordingAudioDriver: AudioSessionDriver, @unchecked Sendable {
    private let lock = NSLock()
    private var events: [String] = []
    private var mainThreadCalls = 0
    private var failNext: Bool
    private let failDeactivation: Bool
    let started: XCTestExpectation?
    let unblock: DispatchSemaphore?

    init(failNext: Bool = false, failDeactivation: Bool = false, started: XCTestExpectation? = nil, unblock: DispatchSemaphore? = nil) {
        self.failNext = failNext; self.started = started; self.unblock = unblock
        self.failDeactivation = failDeactivation
    }
    func activate(_ mode: AudioSessionMode) throws {
        lock.lock()
        events.append(mode == .recording ? "record" : "play")
        if Thread.isMainThread { mainThreadCalls += 1 }
        let fail = failNext; failNext = false
        lock.unlock()
        started?.fulfill()
        if let unblock, unblock.wait(timeout: .now() + 5) == .timedOut { throw CocoaError(.fileReadUnknown) }
        if fail { throw CocoaError(.fileReadUnknown) }
    }
    func deactivate() throws {
        lock.lock(); defer { lock.unlock() }
        events.append("release")
        if Thread.isMainThread { mainThreadCalls += 1 }
        if failDeactivation { throw CocoaError(.fileWriteUnknown) }
    }
    func snapshot() -> ([String], Int) {
        lock.lock(); defer { lock.unlock() }
        return (events, mainThreadCalls)
    }
}

final class AudioSessionCoordinatorTests: XCTestCase {
    func testCleanupFailureIsReported() async {
        let failure = expectation(description: "Cleanup error reported")
        let released = expectation(description: "Cleanup attempt finished")
        let driver = RecordingAudioDriver(failDeactivation: true)
        let coordinator = AudioSessionCoordinator(driver: driver) { error in
            XCTAssertTrue(error is CocoaError)
            failure.fulfill()
        }
        let owner = UUID()
        coordinator.activate(owner: owner, mode: .playback) { result in
            if case .failure(let error) = result { XCTFail("Unexpected activation failure: \(error)") }
            coordinator.release(owner: owner) { released.fulfill() }
        }
        await fulfillment(of: [failure, released], timeout: 3)
        XCTAssertEqual(driver.snapshot().0, ["play", "release"])
    }

    @MainActor
    func testDriverNeverRunsOnUIThread() async throws {
        let driver = RecordingAudioDriver()
        let coordinator = AudioSessionCoordinator(driver: driver)
        let owner = UUID()
        try await activate(coordinator, owner, .recording)
        await release(coordinator, owner)
        XCTAssertEqual(driver.snapshot().0, ["record", "release"])
        XCTAssertEqual(driver.snapshot().1, 0)
    }

    @MainActor
    func testLateReleaseCannotStopNewPlayback() async throws {
        let driver = RecordingAudioDriver()
        let coordinator = AudioSessionCoordinator(driver: driver)
        let old = UUID(), new = UUID()
        try await activate(coordinator, old, .recording)
        await release(coordinator, old)
        try await activate(coordinator, new, .playback)
        await release(coordinator, old)
        XCTAssertEqual(driver.snapshot().0, ["record", "release", "play"])
        await release(coordinator, new)
        XCTAssertEqual(driver.snapshot().0, ["record", "release", "play", "release"])
    }

    @MainActor
    func testActivationFailureDoesNotPoisonNextRequest() async throws {
        let driver = RecordingAudioDriver(failNext: true)
        let coordinator = AudioSessionCoordinator(driver: driver)
        do { try await activate(coordinator, UUID(), .recording); XCTFail("Expected driver failure") }
        catch { XCTAssertTrue(error is CocoaError) }
        let owner = UUID()
        try await activate(coordinator, owner, .playback)
        await release(coordinator, owner)
        XCTAssertEqual(driver.snapshot().0, ["record", "release", "play", "release"])
    }

    @MainActor
    func testSecondOwnerCannotStealAnActiveSession() async throws {
        let driver = RecordingAudioDriver()
        let coordinator = AudioSessionCoordinator(driver: driver)
        let first = UUID(), second = UUID()
        try await activate(coordinator, first, .recording)
        do { try await activate(coordinator, second, .playback); XCTFail("Expected ownership rejection") }
        catch { XCTAssertTrue(error is AudioSessionCoordinator.Failure) }
        await release(coordinator, second)
        XCTAssertEqual(driver.snapshot().0, ["record"])
        await release(coordinator, first)
    }

    func testCloseQueuedDuringBlockedActivationReleasesAfterIt() async {
        let started = expectation(description: "Activation entered driver")
        let activated = expectation(description: "Activation returned")
        let released = expectation(description: "Close completed")
        let unblock = DispatchSemaphore(value: 0)
        let driver = RecordingAudioDriver(started: started, unblock: unblock)
        let coordinator = AudioSessionCoordinator(driver: driver)
        let owner = UUID()
        coordinator.activate(owner: owner, mode: .recording) { result in
            if case .failure(let error) = result { XCTFail("Unexpected failure: \(error)") }
            activated.fulfill()
        }
        await fulfillment(of: [started], timeout: 3)
        coordinator.release(owner: owner) { released.fulfill() }
        XCTAssertEqual(driver.snapshot().0, ["record"])
        unblock.signal()
        await fulfillment(of: [activated, released], timeout: 3)
        XCTAssertEqual(driver.snapshot().0, ["record", "release"])
        XCTAssertEqual(driver.snapshot().1, 0)
    }

    @MainActor private func activate(_ coordinator: AudioSessionCoordinator, _ owner: UUID, _ mode: AudioSessionMode) async throws {
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            coordinator.activate(owner: owner, mode: mode) { continuation.resume(with: $0) }
        }
    }
    @MainActor private func release(_ coordinator: AudioSessionCoordinator, _ owner: UUID) async {
        await withCheckedContinuation { continuation in
            coordinator.release(owner: owner) { continuation.resume() }
        }
    }
}
