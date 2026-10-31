import SwiftUI
import AVFoundation

@MainActor
final class VoiceAttachment: NSObject, ObservableObject, AVAudioRecorderDelegate, AVAudioPlayerDelegate {
    @Published var data: Data?
    @Published private(set) var recording = false
    @Published private(set) var playing = false
    @Published private(set) var requestingPermission = false
    @Published var error: String?
    private var recorder: AVAudioRecorder?
    private var player: AVAudioPlayer?
    private var recordingURL: URL?
    private var closed = false
    private var permissionRequest = UUID()

    init(data: Data?) { self.data = data; super.init() }

    func start() async {
        guard !recording, !requestingPermission, !closed else { return }
        requestingPermission = true
        let request = permissionRequest
        let allowed = await AVAudioApplication.requestRecordPermission()
        requestingPermission = false
        guard !closed, request == permissionRequest else { return }
        guard allowed else { error = "لم يُمنح إذن الميكروفون. يمكنك السماح به من إعدادات الآيفون."; return }
        stopPlayback()
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker])
            try session.setActive(true)
            let url = FileManager.default.temporaryDirectory.appendingPathComponent("rusukh-voice-\(UUID().uuidString).m4a")
            recordingURL = url
            let recorder = try AVAudioRecorder(url: url, settings: [
                AVFormatIDKey: kAudioFormatMPEG4AAC,
                AVSampleRateKey: 22_050,
                AVNumberOfChannelsKey: 1,
                AVEncoderBitRateKey: 64_000
            ])
            recorder.delegate = self
            self.recorder = recorder
            guard recorder.record(forDuration: 180) else { throw CocoaError(.fileWriteUnknown) }
            try FileManager.default.setAttributes([.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication], ofItemAtPath: url.path)
            recording = true
            error = nil
        } catch {
            discardRecorder()
            self.error = "تعذّر التسجيل: \(error.localizedDescription)"
        }
    }

    @discardableResult
    func finish() -> Bool {
        guard let recorder else { return true }
        self.recorder = nil
        recorder.delegate = nil
        recorder.stop()
        recording = false
        defer { clearTemporaryRecording(); deactivateSession() }
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

    func play() {
        guard let data, !recording else { return }
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playback)
            try session.setActive(true)
            let player = try AVAudioPlayer(data: data)
            player.delegate = self
            self.player = player
            guard player.play() else { throw CocoaError(.fileReadCorruptFile) }
            playing = true
            error = nil
        } catch { stopPlayback(); self.error = "تعذّر تشغيل التسجيل: \(error.localizedDescription)" }
    }

    func stopPlayback() { player?.delegate = nil; player?.stop(); player = nil; playing = false; deactivateSession() }
    func pauseForBackground() { permissionRequest = UUID(); finish(); stopPlayback() }
    func open() { closed = false }
    func close() { closed = true; permissionRequest = UUID(); discardRecorder(); stopPlayback() }
    func remove() { discardRecorder(); stopPlayback(); data = nil }

    private func discardRecorder() {
        let recorder = self.recorder
        self.recorder = nil
        recorder?.delegate = nil
        recorder?.stop()
        recording = false
        clearTemporaryRecording()
        deactivateSession()
    }
    private func clearTemporaryRecording() {
        if let recordingURL { try? FileManager.default.removeItem(at: recordingURL) }
        recordingURL = nil
    }
    private func deactivateSession() { try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation) }

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
