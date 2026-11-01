import SwiftUI

struct ReviewView: View {
    @EnvironmentObject private var library: LibraryStore
    @State private var showAnswer = false
    @State private var creatingCard = false
    @State private var takingQuiz = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    HStack {
                        Text("\(library.due.count) بطاقات مستحقة").font(.headline)
                        Spacer()
                        Button { creatingCard = true } label: { Label("بطاقة", systemImage: "plus") }
                    }
                    if let card = library.due.first {
                        VStack(alignment: .leading, spacing: 20) {
                            Text("السؤال").font(.caption).foregroundStyle(.secondary)
                            Text(card.question).font(.title2.bold())
                            if showAnswer {
                                Divider()
                                Text("الإجابة").font(.caption).foregroundStyle(.secondary)
                                Text(card.answer).font(.title3)
                                LazyVGrid(columns: [.init(.flexible()), .init(.flexible())], spacing: 10) {
                                    grade("مجدّدًا", grade: .again)
                                    grade("صعب", grade: .hard)
                                    grade("جيد", grade: .good)
                                    grade("سهل", grade: .easy)
                                }
                            } else {
                                Button("إظهار الإجابة") { showAnswer = true }
                                    .buttonStyle(.borderedProminent).tint(.primary)
                            }
                        }
                        .padding(20)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 20))
                        .id(card.id)
                    } else {
                        ContentUnavailableView("انتهت المراجعات الحالية", systemImage: "checkmark.circle", description: Text("أضف بطاقة أو انتظر الموعد التالي."))
                    }
                    Button("اختبار اختيار من متعدد") { takingQuiz = true }
                        .buttonStyle(.bordered)
                        .disabled(StudyEngine.quiz(from: library.snapshot.cards).isEmpty)
                    Text("البطاقات الجديدة تستخدم FSRS-6. البطاقات القديمة تحتفظ بجدولتها الحالية.")
                        .font(.footnote).foregroundStyle(.secondary)
                }
                .padding(18)
            }
            .navigationTitle("المراجعة")
            .sheet(isPresented: $creatingCard) { CardComposerView() }
            .sheet(isPresented: $takingQuiz) { QuizView() }
        }
    }

    private func grade(_ title: String, grade: ReviewGrade) -> some View {
        Button(title) {
            if let card = library.due.first { library.review(card: card, grade: grade) }
            showAnswer = false
        }
        .buttonStyle(.bordered)
        .frame(maxWidth: .infinity)
    }
}

struct CardComposerView: View {
    @EnvironmentObject private var library: LibraryStore
    @Environment(\.dismiss) private var dismiss
    @State private var noteID: UUID?
    @State private var question = ""
    @State private var answer = ""

    var body: some View {
        NavigationStack {
            Form {
                Picker("الملاحظة", selection: $noteID) {
                    Text("اختر ملاحظة").tag(nil as UUID?)
                    ForEach(library.snapshot.notes) { note in
                        Text(note.title).tag(Optional(note.id))
                    }
                }
                TextField("السؤال", text: $question, axis: .vertical)
                TextField("الإجابة", text: $answer, axis: .vertical)
            }
            .navigationTitle("بطاقة جديدة")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("إلغاء") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("إضافة") {
                        if let noteID, library.addCard(noteID: noteID, question: question, answer: answer) { dismiss() }
                    }
                    .disabled(noteID == nil || question.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || answer.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
    }
}

struct QuizView: View {
    @EnvironmentObject private var library: LibraryStore
    @Environment(\.dismiss) private var dismiss
    @State private var index = 0
    @State private var selectedAnswer: String?
    @State private var score = 0
    private var questions: [QuizQuestion] { StudyEngine.quiz(from: library.snapshot.cards) }

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 20) {
                if index < questions.count {
                    let question = questions[index]
                    Text("سؤال \(index+1) من \(questions.count)").foregroundStyle(.secondary)
                    Text(question.question).font(.title2.bold())
                    ForEach(question.options, id: \.self) { option in
                        Button(option) { if selectedAnswer == nil {
                            selectedAnswer = option
                            if option == question.answer { score += 1 }
                        } }
                        .buttonStyle(.bordered)
                        .frame(maxWidth: .infinity)
                        .disabled(selectedAnswer != nil)
                    }
                    if let selectedAnswer {
                        Text(selectedAnswer == question.answer ? "إجابة صحيحة" : "الإجابة الصحيحة: \(question.answer)")
                        Button("التالي") { self.selectedAnswer = nil; index += 1 }
                            .buttonStyle(.borderedProminent).tint(.primary)
                    }
                } else {
                    Text("النتيجة: \(score) / \(questions.count)").font(.largeTitle.bold())
                    Button("إغلاق") { dismiss() }
                }
                Spacer()
            }
            .padding(20)
            .navigationTitle("اختبار سريع")
            .toolbar { Button("إغلاق") { dismiss() } }
        }
    }
}
