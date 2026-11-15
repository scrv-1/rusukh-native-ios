import Foundation

enum TourHooks {
    static var enabled: Bool {
        #if DEBUG
        ProcessInfo.processInfo.arguments.contains("-ui-tour")
        #else
        false
        #endif
    }

    /// 8×8 PNG. UIImage accepts it, and the tour does not need the camera.
    static let sampleImage = Data([
        137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 8, 0, 0, 0, 8, 8, 2, 0, 0, 0, 75, 109, 41, 220,
        0, 0, 0, 17, 73, 68, 65, 84, 120, 156, 99, 208, 136, 90, 128, 21, 49, 12, 45, 9, 0, 54, 108, 72, 129, 82, 130, 68, 149,
        0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130
    ])
}
