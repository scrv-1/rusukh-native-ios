import SwiftUI
import AVFoundation
import OSLog

private struct NativeAudioSessionDriver: AudioSessionDriver {
    func activate(_ mode: AudioSessionMode) throws {
        let session = AVAudioSession.sharedInstance()
        switch mode {
        case .recording: try session.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker])
        case .playback: try session.setCategory(.playback)
        }
        try session.setActive(true)
    }
    func deactivate() throws {
        try AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }
}

/// Used on the session queue until handed back to MainActor. Cancellation is
/// the only concurrent operation; it never touches AVFoundation objects.
private final class PendingAudioMedia: @unchecked Sendable {
    private let lock = NSLock()
    private var cancelled = false
    var recorder: AVAudioRecorder?
    var player: AVAudioPlayer?
    let url: URL?
    init(url: URL? = nil) { self.url = url }
    func cancel() { lock.lock(); cancelled = true; lock.unlock() }
    func checkCancellation() throws {
        lock.lock(); let value = cancelled; lock.unlock()
        if value { throw CancellationError() }
    }
    func stopAndRemove() {
        recorder?.delegate = nil; recorder?.stop(); recorder = nil
        player?.delegate = nil; player?.stop(); player = nil
        if let url { try? FileManager.default.removeItem(at: url) }
    }
}

@MainActor
final class VoiceAttachment: NSObject, ObservableObject, AVAudioRecorderDelegate, AVAudioPlayerDelegate {
    @Published var data: Data?
    @Published private(set) var recording = false
    @Published private(set) var playing = false
    @Published private(set) var requestingPermission = false
    @Published private(set) var preparing = false
    @Published var error: String?
    @Published private(set) var microphoneDenied = false
    var busy: Bool { requestingPermission || preparing }
    private static let sharedSession = AudioSessionCoordinator(driver: NativeAudioSessionDriver()) { error in
        Logger(subsystem: "com.scrv1.rusukhnative", category: "audio").error("Audio session cleanup failed: \(error.localizedDescription, privacy: .private)")
    }
    private let session: AudioSessionCoordinator
    private let requestPermission: () async -> Bool
    private let makeRecorder: @Sendable (URL) throws -> AVAudioRecorder
    private let makePlayer: @Sendable (Data) throws -> AVAudioPlayer
    private var recorder: AVAudioRecorder?
    private var player: AVAudioPlayer?
    private var recordingURL: URL?
    private var closed = false
    private var permissionRequest = UUID()
    private var sessionOwner: UUID?
    private var pendingMedia: (owner: UUID, media: PendingAudioMedia)?

    init(data: Data?, session: AudioSessionCoordinator? = nil,
         requestPermission: (() async -> Bool)? = nil,
         makeRecorder: (@Sendable (URL) throws -> AVAudioRecorder)? = nil,
         makePlayer: (@Sendable (Data) throws -> AVAudioPlayer)? = nil) {
        self.data = data
        self.session = session ?? Self.sharedSession
        self.requestPermission = requestPermission ?? { await AVAudioApplication.requestRecordPermission() }
        self.makeRecorder = makeRecorder ?? { url in
            try AVAudioRecorder(url: url, settings: [
                AVFormatIDKey: kAudioFormatMPEG4AAC, AVSampleRateKey: 22_050,
                AVNumberOfChannelsKey: 1, AVEncoderBitRateKey: 64_000
            ])
        }
        self.makePlayer = makePlayer ?? { try AVAudioPlayer(data: $0) }
        super.init()
    }

    func start() async {
        guard !recording, !busy, !closed else { return }
        stopPlayback()
        permissionRequest = UUID()
        requestingPermission = true
        let request = permissionRequest
        let allowed = await requestPermission()
        guard !closed, request == permissionRequest else { return }
        requestingPermission = false
        guard allowed else {
            microphoneDenied = true
            error = "لم يُمنح إذن الميكروفون. يمكنك السماح به من إعدادات الآيفون."
            return
        }
        microphoneDenied = false
        do {
            try await activateSession(owner: request, mode: .recording)
            guard acceptActivation(request) else { return }
            let url = FileManager.default.temporaryDirectory.appendingPathComponent("rusukh-voice-\(UUID().uuidString).m4a")
            let media = PendingAudioMedia(url: url)
            pendingMedia = (request, media)
            preparing = true
            let factory = makeRecorder
            try await performMedia(owner: request) {
                do {
                    try media.checkCancellation()
                    let recorder = try factory(url)
                    media.recorder = recorder
                    try media.checkCancellation()
                    guard recorder.record(forDuration: 180) else { throw CocoaError(.fileWriteUnknown) }
                    try FileManager.default.setAttributes([.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication], ofItemAtPath: url.path)
                    try media.checkCancellation()
                } catch { media.stopAndRemove(); throw error }
            }
            guard acceptActivation(request) else { return }
            pendingMedia = nil
            guard let recorder = media.recorder else { throw CocoaError(.fileWriteUnknown) }
            recordingURL = url
            recorder.delegate = self
            self.recorder = recorder
            guard recorder.isRecording else { throw CocoaError(.fileWriteUnknown) }
            recording = true
            error = nil
        } catch {
            guard !closed, request == permissionRequest else { return }
            discardRecorder()
            self.error = "تعذّر التسجيل: \(error.localizedDescription)"
        }
    }

    @discardableResult
    func finish() -> Bool {
        cancelPendingRequest()
        guard let recorder else {
            if !playing { releaseSession() }
            return true
        }
        self.recorder = nil
        recorder.delegate = nil
        recorder.stop()
        recording = false
        defer { clearTemporaryRecording(); releaseSession() }
        guard let url = recordingURL else { error = "تعذّر العثور على التسجيل الجديد."; return false }
        do {
            let handle = try FileHandle(forReadingFrom: url)
            defer { try? handle.close() }
            let recorded = try handle.read(upToCount: 2_000_001) ?? Data()
            guard !recorded.isEmpty, recorded.count <= 2_000_000 else { throw CocoaError(.fileReadTooLarge) }
            // A failed recording leaves the previous attachment intact.
            data = recorded
            error = nil
            return true
        } catch { self.error = "لم يُحفظ التسجيل الجديد: \(error.localizedDescription)"; return false }
    }

    func play() async {
        guard let data, !recording, !busy, !closed else { return }
        stopPlayback()
        permissionRequest = UUID()
        let request = permissionRequest
        do {
            try await activateSession(owner: request, mode: .playback)
            guard acceptActivation(request) else { return }
            let media = PendingAudioMedia()
            pendingMedia = (request, media)
            preparing = true
            let factory = makePlayer
            try await performMedia(owner: request) {
                do {
                    try media.checkCancellation()
                    let player = try factory(data)
                    media.player = player
                    try media.checkCancellation()
                    guard player.play() else { throw CocoaError(.fileReadCorruptFile) }
                    try media.checkCancellation()
                } catch { media.stopAndRemove(); throw error }
            }
            guard acceptActivation(request) else { return }
            pendingMedia = nil
            guard let player = media.player else { throw CocoaError(.fileReadCorruptFile) }
            player.delegate = self
            self.player = player
            guard player.isPlaying else { stopPlayback(); return }
            playing = true
            error = nil
        } catch {
            guard !closed, request == permissionRequest else { return }
            stopPlayback(); self.error = "تعذّر تشغيل التسجيل: \(error.localizedDescription)"
        }
    }

    func stopPlayback() {
        cancelPendingRequest()
        player?.delegate = nil; player?.stop(); player = nil; playing = false
        if !recording { releaseSession() }
    }
    func pauseForBackground() { finish(); stopPlayback() }
    func open() { closed = false }
    func close() { closed = true; discardRecorder(); stopPlayback() }
    func remove() { discardRecorder(); stopPlayback(); data = nil }

    private func discardRecorder() {
        cancelPendingRequest()
        let recorder = self.recorder
        self.recorder = nil
        recorder?.delegate = nil
        recorder?.stop()
        recording = false
        clearTemporaryRecording()
        if !playing { releaseSession() }
    }
    private func clearTemporaryRecording() {
        if let recordingURL { try? FileManager.default.removeItem(at: recordingURL) }
        recordingURL = nil
    }
    private func cancelPendingRequest() {
        cancelPendingMedia()
        permissionRequest = UUID()
        requestingPermission = false
        preparing = false
    }
    private func cancelPendingMedia() {
        guard let pending = pendingMedia else { return }
        pendingMedia = nil
        pending.media.cancel()
        // Queue cleanup before release, including when start is still blocked.
        session.perform(owner: pending.owner, operation: { pending.media.stopAndRemove() }) { _ in }
    }
    private func performMedia(owner: UUID, operation: @escaping @Sendable () throws -> Void) async throws {
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            session.perform(owner: owner, operation: operation) { continuation.resume(with: $0) }
        }
    }
    private func activateSession(owner: UUID, mode: AudioSessionMode) async throws {
        sessionOwner = owner
        preparing = true
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            session.activate(owner: owner, mode: mode) { continuation.resume(with: $0) }
        }
    }
    private func acceptActivation(_ owner: UUID) -> Bool {
        guard !closed, permissionRequest == owner, !Task.isCancelled else {
            if pendingMedia?.owner == owner { cancelPendingMedia() }
            session.release(owner: owner)
            if sessionOwner == owner { sessionOwner = nil; preparing = false }
            return false
        }
        preparing = false
        return true
    }
    private func releaseSession() {
        guard let owner = sessionOwner else { return }
        sessionOwner = nil
        session.release(owner: owner)
    }

    nonisolated func audioRecorderDidFinishRecording(_ recorder: AVAudioRecorder, successfully flag: Bool) {
        let identity = ObjectIdentifier(recorder)
        Task { @MainActor [weak self] in
            guard let self, self.recorder.map(ObjectIdentifier.init) == identity else { return }
            if flag { self.finish() }
            else { self.discardRecorder(); self.error = "انقطع التسجيل؛ لم يُستبدل المرفق السابق." }
        }
    }
    nonisolated func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        let identity = ObjectIdentifier(player)
        Task { @MainActor [weak self] in
            guard let self, self.player.map(ObjectIdentifier.init) == identity else { return }
            self.stopPlayback()
        }
    }
}
