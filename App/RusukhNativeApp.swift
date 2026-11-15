import SwiftUI
import UIKit

enum RusukhTab: Hashable {
    case home, notes, review, graph, intelligence
}

private struct RusukhTabKey: EnvironmentKey {
    static let defaultValue: Binding<RusukhTab> = .constant(.home)
}

extension EnvironmentValues {
    var rusukhTab: Binding<RusukhTab> {
        get { self[RusukhTabKey.self] }
        set { self[RusukhTabKey.self] = newValue }
    }
}

@main
struct RusukhNativeApp: App {
    @StateObject private var library = LibraryStore()

    init() {
        // SwiftUI's layoutDirection does not reach UIKit pickers (camera, files).
        UIView.appearance().semanticContentAttribute = .forceRightToLeft
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(library)
                .environment(\.layoutDirection, .rightToLeft)
                .environment(\.locale, Locale(identifier: "ar_SA@numbers=latn"))
                .tint(.primary)
        }
    }
}

struct RootView: View {
    @EnvironmentObject private var library: LibraryStore
    @State private var tab = RusukhTab.home

    var body: some View {
        TabView(selection: $tab) {
            HomeView()
                .tag(RusukhTab.home)
                .tabItem { Label("الرئيسية", systemImage: "house") }
            NotesView()
                .tag(RusukhTab.notes)
                .tabItem { Label("ملاحظاتي", systemImage: "note.text") }
            ReviewView()
                .tag(RusukhTab.review)
                .tabItem { Label("المراجعة", systemImage: "rectangle.on.rectangle") }
            GraphView()
                .tag(RusukhTab.graph)
                .tabItem { Label("الشبكة", systemImage: "point.3.connected.trianglepath.dotted") }
            LocalAIView()
                .tag(RusukhTab.intelligence)
                .tabItem { Label("ذكاء محلي", systemImage: "cpu") }
        }
        .environment(\.rusukhTab, $tab)
        .alert("إشعار رُسوخ", isPresented: Binding(
            get: { library.message != nil },
            set: { if !$0 { library.message = nil } }
        )) { Button("حسنًا") { library.message = nil } }
        message: { Text(library.message ?? "") }
    }
}
