import SwiftUI

struct GraphView: View {
    @EnvironmentObject private var library: LibraryStore
    @State private var zoom: CGFloat = 1
    @State private var zoomStart: CGFloat = 1
    @State private var pan: CGSize = .zero
    @State private var panStart: CGSize = .zero
    @State private var selectedNote: StudyNote?

    var body: some View {
        NavigationStack {
            VStack(spacing: 8) {
                Text("اضغط على عقدة لفتحها. استخدم السحب والتكبير لتحريك الشبكة.")
                    .font(.footnote).foregroundStyle(.secondary).padding(.horizontal)
                GeometryReader { geometry in
                    let size = geometry.size
                    let notes = library.snapshot.notes
                    let edges = StudyEngine.graphEdges(notes)
                    let positions = Dictionary(uniqueKeysWithValues: notes.enumerated().map {
                        ($0.element.id, position(for: $0.offset, total: notes.count, size: size))
                    })
                    ZStack {
                        Canvas { context, _ in
                            for edge in edges {
                                guard let start = positions[edge.from], let end = positions[edge.to] else { continue }
                                var path = Path()
                                path.move(to: start)
                                path.addLine(to: end)
                                context.stroke(path, with: .color(.secondary.opacity(0.65)), lineWidth: 1.5)
                            }
                        }
                        ForEach(notes) { note in
                            Button { selectedNote = note } label: {
                                VStack(spacing: 6) {
                                    Image(systemName: "circle.hexagongrid.fill")
                                        .font(.system(size: 37))
                                        .foregroundStyle(.primary)
                                    Text(note.title)
                                        .font(.caption2.bold())
                                        .lineLimit(2)
                                        .multilineTextAlignment(.center)
                                        .environment(\.layoutDirection, .rightToLeft)
                                        .frame(width: 94)
                                }
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel("فتح ملاحظة \(note.title)")
                            .position(positions[note.id] ?? .zero)
                        }
                    }
                    .scaleEffect(zoom)
                    .offset(pan)
                    .environment(\.layoutDirection, .leftToRight)
                    .contentShape(Rectangle())
                    .simultaneousGesture(DragGesture()
                        .onChanged { value in pan = CGSize(width: panStart.width + value.translation.width,
                                                          height: panStart.height + value.translation.height) }
                        .onEnded { _ in panStart = pan })
                    .simultaneousGesture(MagnifyGesture().onChanged { value in
                        zoom = min(3, max(0.55, zoomStart * value.magnification))
                    }.onEnded { _ in zoomStart = zoom })
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                }
                .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16))
                .padding(.horizontal)
                HStack {
                    Label("\(BidirectionalText.count(library.snapshot.notes.count)) عقدة", systemImage: "circle.fill")
                    Spacer()
                    Text("\(BidirectionalText.count(StudyEngine.graphEdges(library.snapshot.notes).count)) علاقة").accessibilityIdentifier("graph.edge-count")
                    Spacer()
                    Button("توسيط") { zoom = 1; zoomStart = 1; pan = .zero; panStart = .zero }
                }
                .font(.footnote).padding()
            }
            .navigationTitle("شبكة أفكاري")
            .sheet(item: $selectedNote) { note in
                NoteEditorView(note: note)
            }
        }
    }

    private func position(for index: Int, total: Int, size: CGSize) -> CGPoint {
        guard total > 1 else { return CGPoint(x: size.width / 2, y: size.height / 2) }
        let angle = (2 * Double.pi * Double(index) / Double(total)) - Double.pi / 2
        let radius = min(size.width * 0.34, size.height * 0.33, 180)
        return CGPoint(x: size.width / 2 + CGFloat(cos(angle)) * radius,
                       y: size.height / 2 + CGFloat(sin(angle)) * radius)
    }
}
