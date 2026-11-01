import Foundation

public enum AudioSessionMode: Sendable { case recording, playback }

public protocol AudioSessionDriver: Sendable {
    func activate(_ mode: AudioSessionMode) throws
    func deactivate() throws
}

/// The driver and owner are accessed only on this serial queue. Callbacks must
/// hop to the UI actor before touching recorder/player or published state.
public final class AudioSessionCoordinator: @unchecked Sendable {
    public enum Failure: Error { case alreadyOwned }
    private let queue = DispatchQueue(label: "com.scrv1.rusukh.audio-session", qos: .userInitiated)
    private let driver: any AudioSessionDriver
    private let onCleanupError: @Sendable (Error) -> Void
    private var owner: UUID?

    public init(driver: any AudioSessionDriver, onCleanupError: @escaping @Sendable (Error) -> Void = { _ in }) {
        self.driver = driver
        self.onCleanupError = onCleanupError
    }

    // Synchronous enqueue is intentional: close/background can enqueue release
    // even while activation is blocked in the operating system.
    public func activate(owner: UUID, mode: AudioSessionMode,
                         completion: @escaping @Sendable (Result<Void, Error>) -> Void) {
        queue.async {
            guard self.owner == nil else {
                completion(.failure(Failure.alreadyOwned))
                return
            }
            do {
                try self.driver.activate(mode)
                self.owner = owner
                completion(.success(()))
            } catch {
                self.deactivate()
                completion(.failure(error))
            }
        }
    }

    public func release(owner: UUID, completion: @escaping @Sendable () -> Void = {}) {
        queue.async {
            defer { completion() }
            // An old editor's late cleanup must never deactivate a new editor.
            guard self.owner == owner else { return }
            self.owner = nil
            self.deactivate()
        }
    }
    private func deactivate() {
        do { try driver.deactivate() }
        catch { onCleanupError(error) }
    }
}
