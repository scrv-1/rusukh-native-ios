import SwiftUI

@main
struct RusukhNativeApp: App {
    @StateObject private var library = LibraryStore()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(library)
                .environment(\.layoutDirection, .rightToLeft)
                .tint(.primary)
        }
    }
}

struct RootView: View {
    @EnvironmentObject private var library: LibraryStore

    var body: some View {
        TabView {
            HomeView()
                .tabItem { Label("الرئيسية", systemImage: "house") }
            NotesView()
                .tabItem { Label("ملاحظاتي", systemImage: "note.text") }
            ReviewView()
                .tabItem { Label("المراجعة", systemImage: "rectangle.on.rectangle") }
            GraphView()
                .tabItem { Label("الشبكة", systemImage: "point.3.connected.trianglepath.dotted") }
            LocalAIView()
                .tabItem { Label("ذكاء محلي", systemImage: "cpu") }
        }
        .alert("إشعار رُسوخ", isPresented: Binding(
            get: { library.message != nil },
            set: { if !$0 { library.message = nil } }
        )) { Button("حسنًا") { library.message = nil } }
        message: { Text(library.message ?? "") }
    }
}
