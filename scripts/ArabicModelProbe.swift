import Foundation
import Darwin
import Metal
import MLX

@main
struct ArabicModelProbe {
    struct Input: Decodable { let cases: [Case] }
    struct Case: Decodable { let name: String; let prompt: String }
    struct Output: Encodable {
        let name: String
        let result: ArabicModelRuntime.Result
        let macMLXPeakBytes: Int
        let macMLXActiveBytes: Int
    }

    static func main() async throws {
        guard CommandLine.arguments.count == 3 else { fatalError("Expected model directory and test cases JSON") }
        try proveNetworkDenied()
        print("METAL_DEVICE \(MTLCreateSystemDefaultDevice()?.name ?? "unavailable")")
        let directory = URL(fileURLWithPath: CommandLine.arguments[1])
        let data = try Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[2]))
        let cases = try JSONDecoder().decode(Input.self, from: data).cases
        let runtime = ArabicModelRuntime()
        // Regression: cleaning an unused runtime must not initialize MLX.
        await runtime.unload()
        for item in cases {
            let result = try await runtime.generate(directory: directory, prompt: item.prompt)
            let encoded = try JSONEncoder().encode(Output(name: item.name, result: result, macMLXPeakBytes: MLX.Memory.peakMemory, macMLXActiveBytes: MLX.Memory.activeMemory))
            print(String(decoding: encoded, as: UTF8.self))
        }
        await runtime.unload()
        print("MAC_MLX_MEMORY_AFTER_UNLOAD active=\(MLX.Memory.activeMemory) cache=\(MLX.Memory.cacheMemory); peaks above are cumulative Mac pool bytes, not iPhone RSS")
    }

    static func proveNetworkDenied() throws {
        let fd = socket(AF_INET, SOCK_STREAM, 0)
        if fd < 0 {
            guard errno == EPERM || errno == EACCES else { throw POSIXError(.EIO) }
        } else {
            defer { close(fd) }
            var address = sockaddr_in()
            address.sin_len = UInt8(MemoryLayout<sockaddr_in>.size)
            address.sin_family = sa_family_t(AF_INET)
            address.sin_port = UInt16(9).bigEndian
            address.sin_addr = in_addr(s_addr: inet_addr("127.0.0.1"))
            let result = withUnsafePointer(to: &address) {
                $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                    connect(fd, $0, socklen_t(MemoryLayout<sockaddr_in>.size))
                }
            }
            guard result == -1, errno == EPERM || errno == EACCES else { throw POSIXError(.EIO) }
        }
        print("NETWORK_DENIAL_CONFIRMED Swift process received EPERM/EACCES")
    }
}
