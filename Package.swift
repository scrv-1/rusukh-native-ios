// swift-tools-version: 6.2
import PackageDescription
import Foundation

// The same app sources are shared by XcodeGen and xtool.
// Default mode remains the portable core library and its tests.
let isApp = ProcessInfo.processInfo.environment["RUSUKH_XTOOL"] == "1"
let package = isApp ? Package(
    name: "RusukhNative",
    platforms: [.iOS(.v26)],
    products: [.library(name: "RusukhNative", targets: ["RusukhNative"])],
    targets: [.target(name: "RusukhNative", path: ".",
        exclude: ["App/Assets.xcassets", "App/Info.plist", "App/PrivacyInfo.xcprivacy", "Tests", "AppTests", "UITests", "docs", "scripts", "project.yml", "xtool.yml", "README.md", "Info-xtool.plist"],
        sources: ["App", "Sources/RusukhCore"],
        swiftSettings: [.swiftLanguageMode(.v5)])]
) : Package(
    name: "RusukhCore",
    platforms: [.iOS(.v26)],
    products: [.library(name: "RusukhCore", targets: ["RusukhCore"])],
    targets: [
        .target(name: "RusukhCore", path: "Sources/RusukhCore"),
        .testTarget(name: "RusukhCoreTests", dependencies: ["RusukhCore"], path: "Tests")
    ]
)
