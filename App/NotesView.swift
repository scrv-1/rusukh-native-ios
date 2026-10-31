import SwiftUI
import UIKit

private struct EditingNote: Identifiable {
    let id = UUID()
    let note: StudyNote?
}

struct NotesView: View {
    @EnvironmentObject private var library: LibraryStore
    @State private var editing: EditingNote?
    @State private var search = ""

    private var results: [StudyNote] {
        let query = search.trimmingCharacters(in: .whitespacesAndNewlines)
        let notes = library.snapshot.notes.sorted { $0.updatedAt > $1.updatedAt }
        if query.isEmpty { return notes }
        return notes.filter { $0.title.localizedCaseInsensitiveContains(query) || $0.body.localizedCaseInsensitiveContains(query) }
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
                            Image(systemName: "chevron.left").font(.caption).foregroundStyle(.tertiary)
                        }
                    }
                    .swipeActions {
                        Button("حذف", role: .destructive) { library.delete(note) }
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
            .toolbar { Button { editing = EditingNote(note: nil) } label: { Image(systemName: "plus") } }
            .sheet(item: $editing) { route in NoteEditorView(note: route.note) }
        }
    }
}

struct NoteEditorView: View {
    @EnvironmentObject private var library: LibraryStore
    @Environment(\.dismiss) private var dismiss
    let note: StudyNote?
    @State private var title: String
    @State private var noteBody: String
    @State private var imageJPEG: Data?
    @State private var cameraOpen = false
    @State private var photoError = false

    init(note: StudyNote?) {
        self.note = note
        _title = State(initialValue: note?.title ?? "")
        _noteBody = State(initialValue: note?.body ?? "")
        _imageJPEG = State(initialValue: note?.imageJPEG)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("العنوان") {
                    TextField("مثال: التعلّم النشط", text: $title)
                }
                Section("المحتوى") {
                    TextEditor(text: $noteBody)
                        .frame(minHeight: 220)
                        .autocorrectionDisabled(false)
                    Text("اربط ملاحظة: [[عنوان آخر]]  ·  بطاقة: س: السؤال ثم ج: الإجابة")
                        .font(.caption).foregroundStyle(.secondary)
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
                ToolbarItem(placement: .cancellationAction) { Button("إلغاء") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("حفظ") {
                        if let saved = library.saveNote(id: note?.id, title: title, body: noteBody, imageJPEG: imageJPEG) {
                            _ = library.importQACards(for: saved.id)
                            dismiss()
                        }
                    }
                    .disabled(title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
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
