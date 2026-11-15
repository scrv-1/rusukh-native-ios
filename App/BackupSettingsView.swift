import Foundation
import SwiftUI
import UniformTypeIdentifiers

struct SettingsView: View {
    @EnvironmentObject private var library: LibraryStore
    @Environment(\.dismiss) private var dismiss
    @State private var shareURL: URL?
    @State private var shareDescription = ""
    @State private var importing = false
    @State private var preview: StudyImportPreview?
    @State private var previewIsRecovery = false
    @State private var deletingPoint: StudyRecoveryPoint?
    @State private var localError: String?
    @State private var status: String?

    var body: some View {
        NavigationStack {
            Form {
                ReviewReminderView()
                if library.storageLocked {
                    Section("البيانات الحالية محمية") {
                        Text("تعذّر قراءة ملف البيانات. لن نصدّر نسخة فارغة أو نستبدله. يمكنك مشاركة نقاط الرجوع المحفوظة أدناه لحمايتها.")
                            .accessibilityIdentifier("backup.locked")
                    }
                }
                Section("النسخ الاحتياطي") {
                    Button("تصدير نسخة احتياطية") {
                        Task { await exportCurrent() }
                    }
                    .accessibilityIdentifier("backup.export")
                    .disabled(library.backupBusy || library.storageLocked)

                    Button("استيراد نسخة") { importing = true }
                        .accessibilityIdentifier("backup.import")
                        .disabled(library.backupBusy || library.storageLocked)

                    if let shareURL {
                        ShareLink(item: shareURL) {
                            Label("مشاركة النسخة أو حفظها في الملفات", systemImage: "square.and.arrow.up")
                        }
                        .accessibilityIdentifier("backup.share")
                        .disabled(library.backupBusy)
                        Text(shareDescription).font(.footnote).foregroundStyle(.secondary)
                    }
                    Text("ملف JSON يشمل الملاحظات والبطاقات وسجل المراجعات والصور والتسجيلات. النسخة غير مشفّرة؛ احفظها في مكان آمن.")
                        .font(.footnote).foregroundStyle(.secondary)
                }
                if library.backupBusy {
                    Section {
                        ProgressView("جارٍ تنفيذ العملية…")
                            .accessibilityIdentifier("backup.busy")
                    }
                }
                if let status {
                    Section {
                        Text(status).accessibilityIdentifier("backup.status")
                    }
                }
                recoverySection
                Section("الأمان") {
                    Text("كل الملاحظات تُحفظ محليًا. حذف التطبيق قد يحذف البيانات ونقاط الرجوع؛ صدّر نسخة دورية إلى الملفات.")
                }
                Section("وضع التطوير") {
                    Text("تجربة بدون عضوية Apple Developer مدفوعة. قد تحتاج إعادة توقيع كل 7 أيام.")
                }
            }
            .navigationTitle("الإعدادات")
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("إغلاق") { dismiss() }.disabled(library.backupBusy)
                }
            }
            .interactiveDismissDisabled(library.backupBusy)
            .fileImporter(isPresented: $importing, allowedContentTypes: [.json]) { result in
                switch result {
                case .success(let url):
                    Task { await prepareFile(url) }
                case .failure(let error):
                    localError = error.localizedDescription
                }
            }
            .sheet(item: $preview) { item in
                BackupImportPreviewView(preview: item, isRecovery: previewIsRecovery) { receipt in
                    shareURL = nil
                    if receipt.changed {
                        status = previewIsRecovery
                            ? "استُعيدت النسخة، وحُفظت نقطة رجوع للبيانات التي سبقت هذه المحاولة."
                            : "اكتمل الاستيراد، وحُفظت نقطة رجوع للبيانات التي سبقت هذه المحاولة."
                    } else {
                        status = "النسخة لا تضيف تغييرًا؛ بقيت بياناتك ونقاط الرجوع كما هي."
                    }
                }
                .environmentObject(library)
            }
            .alert("تعذّر تنفيذ العملية", isPresented: errorPresented) {
                Button("حسنًا") { localError = nil }
            } message: {
                Text(localError ?? "").accessibilityIdentifier("backup.error")
            }
            .confirmationDialog("حذف نقطة الرجوع؟", isPresented: deletePresented, titleVisibility: .visible) {
                if let point = deletingPoint {
                    Button("حذف نقطة الرجوع", role: .destructive) {
                        Task { await deletePoint(point) }
                    }
                    .accessibilityIdentifier("backup.confirm-delete-recovery")
                }
                Button("إلغاء", role: .cancel) { deletingPoint = nil }
            } message: {
                Text("هذا يحذف نقطة الرجوع المحددة فقط ولا يحذف بياناتك الحالية. احفظها في الملفات أولًا إن كنت تحتاجها؛ لا يمكن التراجع عن حذفها من هنا.")
            }
            .task {
                do { try await library.refreshRecoveryPoints() }
                catch { localError = error.localizedDescription }
            }
        }
    }

    private var recoverySection: some View {
        Section("نقاط الرجوع") {
            Text("\(library.recoveryPoints.count) من \(StudyRepository.maximumRecoveryPoints) نقاط محفوظة")
                .accessibilityIdentifier("backup.recovery.count")
            Text("تُحفظ نقطة قبل كل محاولة استيراد تغيّر البيانات، وقد تبقى إذا فشل الحفظ بعدها. الحد 5 نقاط أو 200 MB؛ لا تُحذف أي نقطة تلقائيًا.")
                .font(.footnote).foregroundStyle(.secondary)
            if library.recoveryPoints.isEmpty {
                Text("لا توجد نقاط رجوع بعد.").foregroundStyle(.secondary)
            }
            ForEach(library.recoveryPoints) { point in
                VStack(alignment: .leading, spacing: 10) {
                    Text(point.createdAt, format: .dateTime.day().month().year().hour().minute())
                        .font(.headline)
                    Text(ByteCountFormatter.string(fromByteCount: Int64(point.fileBytes), countStyle: .file))
                        .font(.footnote).foregroundStyle(.secondary)
                    Button {
                        Task { await preparePoint(point) }
                    } label: {
                        Text("معاينة هذه النقطة واستعادتها")
                            .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                    }
                    .accessibilityIdentifier("backup.recovery.\(point.id.uuidString).restore")
                    .disabled(library.backupBusy || library.storageLocked)
                    Button {
                        Task { await exportPoint(point) }
                    } label: {
                        Text("تجهيز نقطة الرجوع للمشاركة")
                            .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                    }
                    .accessibilityIdentifier("backup.recovery.\(point.id.uuidString).export")
                    .disabled(library.backupBusy)
                    Button(role: .destructive) { deletingPoint = point } label: {
                        Text("حذف نقطة الرجوع")
                            .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                    }
                    .accessibilityIdentifier("backup.recovery.\(point.id.uuidString).delete")
                    .disabled(library.backupBusy)
                }
                // Each action belongs to this row but must be independently
                // tappable; Form's automatic button style can select a row.
                .buttonStyle(.borderless)
                .padding(.vertical, 6)
            }
        }
    }

    private var errorPresented: Binding<Bool> {
        Binding(get: { localError != nil }, set: { if !$0 { localError = nil } })
    }

    private var deletePresented: Binding<Bool> {
        Binding(get: { deletingPoint != nil }, set: { if !$0 { deletingPoint = nil } })
    }

    @MainActor private func exportCurrent() async {
        do {
            let exported = try await library.exportToTemporaryFile()
            shareDescription = "نسخة بياناتك وقت تجهيز التصدير. افتح المشاركة لحفظها خارج التطبيق."
            shareURL = exported
            status = "النسخة جاهزة للمشاركة؛ لم تُحفظ خارج التطبيق بعد."
        } catch { localError = error.localizedDescription }
    }

    @MainActor private func prepareFile(_ url: URL) async {
        do {
            let prepared = try await library.prepareImport(from: url)
            previewIsRecovery = false
            preview = prepared
        } catch { localError = error.localizedDescription }
    }

    @MainActor private func preparePoint(_ point: StudyRecoveryPoint) async {
        do {
            let prepared = try await library.prepareRecovery(point)
            previewIsRecovery = true
            preview = prepared
        } catch { localError = error.localizedDescription }
    }

    @MainActor private func exportPoint(_ point: StudyRecoveryPoint) async {
        do {
            let exported = try await library.exportRecovery(point)
            shareDescription = "هذه نسخة من نقطة الرجوع المختارة، وليست بالضرورة أحدث بياناتك."
            shareURL = exported
            status = "نقطة الرجوع جاهزة للمشاركة من قسم النسخ الاحتياطي أعلاه."
        } catch { localError = error.localizedDescription }
    }

    @MainActor private func deletePoint(_ point: StudyRecoveryPoint) async {
        do {
            try await library.deleteRecovery(point)
            deletingPoint = nil
            status = "حُذفت نقطة الرجوع المحددة. بياناتك الحالية لم تتغير."
        } catch { localError = error.localizedDescription }
    }
}

struct BackupImportPreviewView: View {
    @EnvironmentObject private var library: LibraryStore
    @Environment(\.dismiss) private var dismiss
    let preview: StudyImportPreview
    let isRecovery: Bool
    let onApplied: (StudyImportReceipt) -> Void
    @State private var mode: StudyImportMode
    @State private var confirmReplace = false
    @State private var localError: String?

    init(preview: StudyImportPreview, isRecovery: Bool = false,
         onApplied: @escaping (StudyImportReceipt) -> Void) {
        self.preview = preview
        self.isRecovery = isRecovery
        self.onApplied = onApplied
        _mode = State(initialValue: isRecovery ? .replace : .mergeKeepingCurrent)
    }

    private var selectedPlan: StudyImportPlan? {
        mode == .mergeKeepingCurrent ? preview.mergePlan : preview.replacementPlan
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("النسخة المختارة") {
                    Text(preview.sourceName).accessibilityIdentifier("backup.preview")
                    counts(preview.replacementPlan.incoming)
                        .accessibilityIdentifier("backup.incoming.counts")
                }
                Section("بياناتك الحالية") {
                    counts(preview.replacementPlan.current)
                        .accessibilityIdentifier("backup.current.counts")
                }
                if !isRecovery {
                    Section("طريقة الاستيراد") {
                        modeButton("إضافة الجديد مع إبقاء الموجود", value: .mergeKeepingCurrent,
                                   identifier: "backup.mode.merge")
                            .disabled(preview.mergePlan == nil || library.backupBusy)
                        modeButton("استبدال المحتوى", value: .replace, identifier: "backup.mode.replace")
                            .disabled(library.backupBusy)
                        if let problem = preview.mergeProblem {
                            Text("الدمج غير متاح: \(problem)")
                                .font(.footnote).accessibilityIdentifier("backup.merge-problem")
                        }
                    }
                }
                if let plan = selectedPlan {
                    Section(mode == .replace ? "المحتوى بعد الاستبدال" : "المحتوى بعد الدمج") {
                        counts(plan.result).accessibilityIdentifier("backup.result.counts")
                        if mode == .mergeKeepingCurrent {
                            Text("الإضافات — الملاحظات: \(plan.summary.addedNotes)، البطاقات: \(plan.summary.addedCards)، المراجعات: \(plan.summary.addedReviews).")
                                .accessibilityIdentifier("backup.additions")
                            Text("تعارضات الملاحظات: \(plan.summary.conflictingNotes). تعارضات البطاقات أو سجلاتها: \(plan.summary.conflictingCards). ستبقى نسختك الحالية عند التعارض.")
                                .accessibilityIdentifier("backup.conflicts")
                            Text("مراجعات واردة لن تُضاف للبطاقات الموجودة: \(plan.summary.skippedReviews). نحتفظ بجدول كل بطاقة موجودة وسجلها معًا.")
                                .accessibilityIdentifier("backup.skipped-reviews")
                        }
                        if plan.summary.lostGraphLinks > 0 {
                            Text("تنبيه: \(plan.summary.lostGraphLinks) من روابط الشبكة الحالية لن تظهر بعد هذه العملية، وقد تتسبب عناوين متكررة بذلك.")
                                .accessibilityIdentifier("backup.lost-links")
                        }
                        if !plan.hasChanges {
                            Text("لا يوجد تغيير لتطبيقه. بياناتك ونقاط الرجوع ستبقى كما هي.")
                                .accessibilityIdentifier("backup.no-changes")
                        }
                    }
                    Section {
                        Text("ستُحفظ نقطة رجوع قبل محاولة تغيير البيانات. إذا تعذّر حفظها فلن يُطبّق الاستيراد.")
                            .font(.footnote)
                        Button(isRecovery ? "استعادة هذه النسخة" : (mode == .replace ? "استبدال المحتوى" : "دمج الجديد")) {
                            if mode == .replace { confirmReplace = true }
                            else { Task { await apply(plan) } }
                        }
                        .accessibilityIdentifier("backup.apply")
                        .disabled(library.backupBusy || !plan.hasChanges)
                    }
                }
                Section("كيف تُطابق البيانات؟") {
                    Text("المطابقة بالمعرّفات المحفوظة، لا بالعناوين. نسخ Expo التي حُوّلت قديمًا بمعرّفات عشوائية لا يمكن مطابقتها تلقائيًا، وقد تظهر عناصر مكررة عند دمجها.")
                        .font(.footnote).foregroundStyle(.secondary)
                }
                if library.backupBusy {
                    Section { ProgressView("جارٍ حفظ نقطة الرجوع وتطبيق النسخة…") }
                }
            }
            .navigationTitle(isRecovery ? "مراجعة الاستعادة" : "مراجعة الاستيراد")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("إلغاء") { dismiss() }
                        .accessibilityIdentifier("backup.cancel")
                        .disabled(library.backupBusy)
                }
            }
            .interactiveDismissDisabled(library.backupBusy)
            .confirmationDialog("استبدال البيانات الحالية؟", isPresented: $confirmReplace, titleVisibility: .visible) {
                Button("تأكيد الاستبدال", role: .destructive) {
                    Task { await apply(preview.replacementPlan) }
                }
                .accessibilityIdentifier("backup.confirm-replace")
                Button("إلغاء", role: .cancel) { }
            } message: {
                Text("سيُستبدل المحتوى الحالي. الملاحظات: \(preview.replacementPlan.current.notes.count)، البطاقات: \(preview.replacementPlan.current.cards.count)، المراجعات: \(preview.replacementPlan.current.reviews.count). ستُحفظ نقطة رجوع قبل محاولة الحفظ.")
            }
            .alert("لم يُطبّق الاستيراد", isPresented: Binding(
                get: { localError != nil }, set: { if !$0 { localError = nil } }
            )) {
                Button("حسنًا") { localError = nil }
            } message: {
                Text(localError ?? "").accessibilityIdentifier("backup.preview.error")
            }
        }
    }

    private func counts(_ snapshot: StudySnapshot) -> some View {
        Text("الملاحظات: \(snapshot.notes.count) · البطاقات: \(snapshot.cards.count) · المراجعات: \(snapshot.reviews.count)")
    }

    private func modeButton(_ title: String, value: StudyImportMode, identifier: String) -> some View {
        Button { mode = value } label: {
            HStack {
                Text(title)
                Spacer()
                Image(systemName: mode == value ? "checkmark.circle.fill" : "circle")
                    .accessibilityHidden(true)
            }
            .padding(.vertical, 8)
            .contentShape(Rectangle())
        }
        .accessibilityIdentifier(identifier)
        .accessibilityAddTraits(mode == value ? .isSelected : [])
    }

    @MainActor private func apply(_ plan: StudyImportPlan) async {
        do {
            let receipt = try await library.applyImport(plan)
            onApplied(receipt)
            dismiss()
        } catch { localError = error.localizedDescription }
    }
}
