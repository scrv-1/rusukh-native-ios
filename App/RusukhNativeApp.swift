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
    @UIApplicationDelegateAdaptor(SwitcherCover.self) private var switcherCover
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

/// QA1838: the task-switcher snapshot is taken shortly after
/// applicationDidEnterBackground returns, so the cover has to be in the
/// hierarchy before that method returns. This does not block screenshots.
final class SwitcherCover: NSObject, UIApplicationDelegate {
    private weak var cover: UIView?

    func applicationDidEnterBackground(_ application: UIApplication) {
        guard let window = application.connectedScenes
            .compactMap({ $0 as? UIWindowScene })
            .flatMap(\.windows)
            .first(where: \.isKeyWindow) else { return }
        cover?.removeFromSuperview()
        let view = UIView(frame: window.bounds)
        view.backgroundColor = .black
        view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.isAccessibilityElement = false
        window.addSubview(view)
        cover = view
    }

    func applicationWillEnterForeground(_ application: UIApplication) { removeCover() }
    func applicationDidBecomeActive(_ application: UIApplication) { removeCover() }

    private func removeCover() {
        cover?.removeFromSuperview()
        cover = nil
    }
}
