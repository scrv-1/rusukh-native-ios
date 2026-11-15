import SwiftUI
import UIKit
import UniformTypeIdentifiers
import AVFoundation

private struct EditingNote: Identifiable {
    let id = UUID()
    let note: StudyNote?
}

struct NotesView: View {
    @EnvironmentObject private var library: LibraryStore
    @State private var editing: EditingNote?
    @State private var search = ""
    @State private var choosingPDF = false
    @State private var importingPDF = false
    @State private var pendingDelete: StudyNote?

    private var results: [StudyNote] {
        let query = search.trimmingCharacters(in: .whitespacesAndNewlines)
        let notes = library.snapshot.notes.sorted { $0.updatedAt > $1.updatedAt }
        if query.isEmpty { return notes }
        return notes.filter { StudyEngine.matches($0, query: query) }
    }

    var body: some View {
        NavigationStack {
            List {
                ForEach(results) { note in
                    Button { editing = EditingNote(note: note) } label: {
                        HStack(spacing: 12) {
                            if let bytes = note.imageJPEG, let image = UIImage(data: bytes) {
                                Image(uiImage: image).resizable().scaledToFill()
                                    .frame(width: 48, height: 48).clipShape(RoundedRectangle(cornerRadius: 9))
                            }
                            VStack(alignment: .leading, spacing: 5) {
                                Text(note.title).foregroundStyle(.primary).font(.headline)
                                Text(note.body).font(.caption).foregroundStyle(.secondary).lineLimit(2)
                            }
                            Spacer(minLength: 4)
                            Image(systemName: "chevron.forward").font(.caption).foregroundStyle(.tertiary)
                        }
                    }
                    .swipeActions {
                        Button("حذف", role: .destructive) { pendingDelete = note }
                    }
                }
            }
            .overlay {
                if results.isEmpty {
                    ContentUnavailableView(search.isEmpty ? "لا توجد ملاحظات" : "لا توجد نتائج", systemImage: "note.text")
                }
            }
            .searchable(text: $search, prompt: "ابحث في ملاحظاتك")
            .navigationTitle("ملاحظاتي")
            .toolbar {
                Button { choosingPDF = true } label: { Image(systemName: "doc.badge.plus") }
                    .accessibilityLabel("استيراد نص PDF").accessibilityIdentifier("notes.import-pdf")
                    .disabled(importingPDF)
                if importingPDF { ProgressView("استخراج النص") }
                Button { editing = EditingNote(note: nil) } label: { Image(systemName: "plus") }
                    .accessibilityLabel("ملاحظة جديدة").accessibilityIdentifier("notes.add")
            }
            .sheet(item: $editing) { route in NoteEditorView(note: route.note) }
            .confirmationDialog("حذف هذه الملاحظة وبطاقاتها؟", isPresented: Binding(
                get: { pendingDelete != nil },
                set: { if !$0 { pendingDelete = nil } }
            ), titleVisibility: .visible) {
                Button("حذف الملاحظة", role: .destructive) {
                    if let pendingDelete { library.delete(pendingDelete) }
                    self.pendingDelete = nil
                }
            }
            .fileImporter(isPresented: $choosingPDF, allowedContentTypes: [.pdf]) { result in
                switch result {
                case .success(let url): importPDF(url)
                case .failure(let error): library.message = error.localizedDescription
                }
            }
        }
    }

    private func importPDF(_ url: URL) {
        guard !importingPDF else { return }
        importingPDF = true
        let access = url.startAccessingSecurityScopedResource()
        let name = String(url.deletingPathExtension().lastPathComponent.prefix(500))
        Task {
            defer {
                if access { url.stopAccessingSecurityScopedResource() }
                importingPDF = false
            }
            do {
                let text = try await Task.detached(priority: .userInitiated) { try PDFTextImport.read(from: url) }.value
                if let note = library.saveNote(title: name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "ملف PDF" : name, body: text, imageJPEG: nil) {
                    _ = library.importQACards(for: note.id)
                }
            } catch { library.message = error.localizedDescription }
        }
    }
}

struct NoteEditorView: View {
    @EnvironmentObject private var library: LibraryStore
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scenePhase
    @StateObject private var voice: VoiceAttachment
    let note: StudyNote?
    @State private var title: String
    @State private var noteBody: String
    @State private var imageJPEG: Data?
    @State private var cameraOpen = false
    @State private var photoError = false
    @State private var confirmDiscard = false
    @State private var linkedNote: StudyNote?
    @State private var linkChoices: [StudyNote] = []

    init(note: StudyNote?) {
        self.note = note
        _title = State(initialValue: note?.title ?? "")
        _noteBody = State(initialValue: note?.body ?? "")
        _imageJPEG = State(initialValue: note?.imageJPEG)
        _voice = StateObject(wrappedValue: VoiceAttachment(data: note?.audioM4A))
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("العنوان") {
                    TextField("مثال: التعلّم النشط", text: $title)
                        .multilineTextAlignment(.leading)
                        .accessibilityIdentifier("note.title")
                    if title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                        Text("أدخل عنوانًا لتفعيل الحفظ.")
                            .font(.caption).foregroundStyle(.secondary)
                    } else if voice.busy {
                        Text("انتظر انتهاء تجهيز الصوت ثم احفظ.")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                }
                Section("المحتوى") {
                    TextEditor(text: $noteBody)
                        .multilineTextAlignment(.leading)
                        .accessibilityLabel("محتوى الملاحظة").accessibilityIdentifier("note.body")
                        .frame(minHeight: 220)
                        .autocorrectionDisabled(false)
                    Text("اربط ملاحظة: [[عنوان آخر]]  ·  بطاقة: س: السؤال ثم ج: الإجابة")
                        .font(.caption).foregroundStyle(.secondary)
                    let links = StudyEngine.wikiLinks(in: noteBody)
                    if !links.isEmpty {
                        ForEach(links, id: \.self) { link in
                            Button("فتح: \(link)") { openLink(link) }
                        }
                    }
                }
                Section("مرفق صوتي") {
                    Text("تسجيل محلي حتى 3 دقائق. يتوقف عند مغادرة التطبيق؛ اضغط حفظ للاحتفاظ به.")
                        .font(.footnote).foregroundStyle(.secondary)
                    if voice.recording {
                        Button("إيقاف التسجيل") { voice.finish() }.accessibilityIdentifier("voice.stop")
                    } else {
                        Button(voice.data == nil ? "تسجيل صوت" : "استبدال التسجيل") { Task { await voice.start() } }
                            .disabled(voice.busy).accessibilityIdentifier("voice.record")
                    }
                    if voice.data != nil && !voice.recording {
                        Button(voice.playing ? "إيقاف التشغيل" : "تشغيل التسجيل") {
                            if voice.playing { voice.stopPlayback() } else { Task { await voice.play() } }
                        }
                        .disabled(voice.busy)
                        Button("حذف التسجيل", role: .destructive) { voice.remove() }
                    }
                    if voice.preparing { ProgressView("تهيئة الصوت") }
                    if let error = voice.error { Text(error).foregroundStyle(.secondary).accessibilityIdentifier("voice.error") }
                }
                Section("الكاميرا الأصلية") {
                    if let bytes = imageJPEG, let image = UIImage(data: bytes) {
                        Image(uiImage: image).resizable().scaledToFit().frame(maxHeight: 200)
                        Button("إزالة الصورة", role: .destructive) { imageJPEG = nil }
                    }
                    Button {
                        if UIImagePickerController.isSourceTypeAvailable(.camera) { cameraOpen = true }
                        else { photoError = true }
                    } label: { Label("التقاط صورة", systemImage: "camera") }
                }
            }
            .navigationTitle(note == nil ? "ملاحظة جديدة" : "تحرير الملاحظة")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("إلغاء") {
                        if isDirty { confirmDiscard = true } else { dismiss() }
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("حفظ") {
                        guard voice.finish() else { return }
                        if let saved = library.saveNote(id: note?.id, title: title, body: noteBody, imageJPEG: imageJPEG, audioM4A: voice.data) {
                            let pairs = StudyEngine.questionAnswers(from: noteBody)
                            _ = library.importQACards(for: saved.id)
                            if pairs.isEmpty, StudyEngine.looksLikeCardPrompt(noteBody) {
                                library.message = "حُفظت الملاحظة دون بطاقات. اكتب س: ثم السؤال، وفي سطر لاحق ج: ثم الإجابة. الأسطر التي تليهما تُحسب مع البطاقة حتى سطر فارغ."
                            }
                            dismiss()
                        }
                    }
                    .disabled(title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || voice.busy)
                    .accessibilityIdentifier("note.save")
                }
            }
            .sheet(isPresented: $cameraOpen) {
                CameraPicker { image in
                    imageJPEG = image.rusukhScaledJPEG()
                }
            }
            .alert("الكاميرا غير متاحة", isPresented: $photoError) {
                Button("حسنًا", role: .cancel) { }
            } message: { Text("استخدم آيفون حقيقيًا يدعم التصوير.") }
            .confirmationDialog("تجاهل التغييرات غير المحفوظة؟", isPresented: $confirmDiscard, titleVisibility: .visible) {
                Button("تجاهل", role: .destructive) { dismiss() }
                Button("متابعة التحرير", role: .cancel) { }
            }
            .sheet(item: $linkedNote) { linked in NoteEditorView(note: linked) }
            .sheet(isPresented: Binding(get: { !linkChoices.isEmpty }, set: { if !$0 { linkChoices = [] } })) {
                NavigationStack {
                    List(linkChoices) { match in
                        Button(match.title) { linkedNote = match; linkChoices = [] }
                    }
                    .navigationTitle("اختر الملاحظة")
                    .toolbar { ToolbarItem(placement: .cancellationAction) { Button("إغلاق") { linkChoices = [] } } }
                }
            }
            .onChange(of: scenePhase) { _, phase in
                if phase == .background { voice.pauseForBackground() }
            }
            .onReceive(NotificationCenter.default.publisher(for: AVAudioSession.interruptionNotification)) { _ in voice.pauseForBackground() }
            .onAppear { voice.open() }
            .onDisappear { voice.close() }
        }
    }

    private var isDirty: Bool {
        let originalTitle = note?.title ?? ""
        let originalBody = note?.body ?? ""
        return title != originalTitle || noteBody != originalBody || imageJPEG != note?.imageJPEG || voice.data != note?.audioM4A || voice.recording
    }

    private func openLink(_ title: String) {
        let matches = StudyEngine.notes(matching: title, in: library.snapshot.notes, excluding: note?.id)
        if matches.isEmpty {
            library.message = "لا توجد ملاحظة بعنوان «\(title)»."
        } else if matches.count == 1 {
            linkedNote = matches[0]
        } else {
            linkChoices = matches
        }
    }
}

private extension UIImage {
    func rusukhScaledJPEG(maxPixels: CGFloat = 1200) -> Data? {
        let factor = min(1, maxPixels / max(size.width, size.height))
        let targetSize = CGSize(width: max(1, size.width * factor), height: max(1, size.height * factor))
        let renderer = UIGraphicsImageRenderer(size: targetSize)
        let resized = renderer.image { _ in self.draw(in: CGRect(origin: .zero, size: targetSize)) }
        return resized.jpegData(compressionQuality: 0.65)
    }
}

struct CameraPicker: UIViewControllerRepresentable {
    let onCapture: (UIImage) -> Void
    @Environment(\.dismiss) private var dismiss

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.sourceType = .camera
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ uiViewController: UIImagePickerController, context: Context) { }

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        private let parent: CameraPicker
        init(_ parent: CameraPicker) { self.parent = parent }
        func imagePickerController(_ picker: UIImagePickerController,
                                   didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            if let image = info[.originalImage] as? UIImage { parent.onCapture(image) }
            parent.dismiss()
        }
        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) { parent.dismiss() }
    }
}
