import SwiftUI

/// Horizontal row that starts at the trailing edge in RTL.
/// Short rows: alignment. Long rows: scrollTo trailing (does not mirror glyphs).
/// `flipsForRightToLeftLayoutDirection` is intentionally not used; it mirrors letters.
struct HorizontalRail<Content: View>: View {
    @ViewBuilder var content: () -> Content
    @Environment(\.layoutDirection) private var layoutDirection

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView(.horizontal, showsIndicators: false) {
                content()
                    .frame(maxWidth: .infinity, alignment: layoutDirection == .rightToLeft ? .trailing : .leading)
                    .id("rail")
                    .onAppear {
                        if layoutDirection == .rightToLeft {
                            proxy.scrollTo("rail", anchor: .trailing)
                        }
                    }
            }
        }
    }
}
