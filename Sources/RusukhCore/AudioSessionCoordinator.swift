import Foundation

public enum AudioSessionMode: Sendable { case recording, playback }

public protocol AudioSessionDriver: Sendable {
    func activate(_ mode: AudioSessionMode) throws
    func deactivate() throws
}

/// The driver, lease owner, and media initialization use one serial queue.
/// Callbacks must hop to the UI actor before changing published state.
public final class AudioSessionCoordinator: @unchecked Sendable {
    public enum Failure: Error { case alreadyOwned, notOwned }
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

    /// Run media initialization on the same queue as activation and release.
    public func perform<T: Sendable>(owner: UUID, operation: @escaping @Sendable () throws -> T,
                                     completion: @escaping @Sendable (Result<T, Error>) -> Void) {
        queue.async {
            guard self.owner == owner else { completion(.failure(Failure.notOwned)); return }
            do { completion(.success(try operation())) }
            catch { completion(.failure(error)) }
        }
    }
    private func deactivate() {
        do { try driver.deactivate() }
        catch { onCleanupError(error) }
    }
}
