// swift-tools-version: 6.2
import PackageDescription

let package = Package(
    name: "RusukhCore",
    platforms: [.iOS(.v26)],
    products: [.library(name: "RusukhCore", targets: ["RusukhCore"])],
    targets: [
        .target(name: "RusukhCore", path: "Sources/RusukhCore"),
        .testTarget(name: "RusukhCoreTests", dependencies: ["RusukhCore"], path: "Tests")
    ]
)
