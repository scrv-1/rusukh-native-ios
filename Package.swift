// swift-tools-version: 6.2
import PackageDescription
import Foundation

// The same app sources are shared by XcodeGen and xtool.
// Default mode remains the portable core library and its tests.
let isApp = ProcessInfo.processInfo.environment["RUSUKH_XTOOL"] == "1"
let fsrsDependency: Package.Dependency = .package(url: "https://github.com/open-spaced-repetition/swift-fsrs.git", revision: "4fbaf20184d62f82a9f44f343337c61a2c5483e9")
let package = isApp ? Package(
    name: "RusukhNative",
    platforms: [.iOS(.v26)],
    products: [.library(name: "RusukhNative", targets: ["RusukhNative"])],
    dependencies: [fsrsDependency],
    targets: [.target(name: "RusukhNative", dependencies: [.product(name: "FSRS", package: "swift-fsrs")], path: ".",
        exclude: ["App/Assets.xcassets", "App/PrivacyInfo.xcprivacy", "App/RusukhFree.entitlements", "App/Localizable.xcstrings", "signing", "Tests", "AppTests", "UITests", "docs", "scripts", "project.yml", "ai-probe.yml", "xtool.yml", "README.md", "Info-xtool.plist"],
        // Let SwiftPM classify valid source files; listing App as explicit
        // sources also classifies its license as a source and duplicates its rule.
        resources: [.copy("App/Resources/FSRS-LICENSE.txt")],
        swiftSettings: [.swiftLanguageMode(.v5)])]
) : Package(
    name: "RusukhCore",
    platforms: [.iOS(.v26)],
    products: [.library(name: "RusukhCore", targets: ["RusukhCore"])],
    dependencies: [fsrsDependency],
    targets: [
        .target(name: "RusukhCore", dependencies: [.product(name: "FSRS", package: "swift-fsrs")], path: "Sources/RusukhCore"),
        .testTarget(name: "RusukhCoreTests", dependencies: ["RusukhCore"], path: "Tests")
    ]
)
