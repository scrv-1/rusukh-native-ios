import XCTest
@testable import RusukhCore

final class LocalModelBudgetTests: XCTestCase {
    private let peak = UInt64(LocalModelBudget.recordedMacPeakBytes)
    private let eightGB: UInt64 = 8_000_000_000

    func testSimulatorNeverLoadsEvenWithHeadroom() {
        XCTAssertFalse(LocalModelBudget.mlxLoadAllowed(availableBytes: peak + 1, physicalBytes: eightGB, isSimulator: true))
    }

    func testPhysicalMemoryBelowEightGigabytesIsRejected() {
        XCTAssertFalse(LocalModelBudget.mlxLoadAllowed(availableBytes: peak + 1, physicalBytes: eightGB - 1, isSimulator: false))
    }

    func testAvailableMemoryAtOrBelowMacPeakIsRejected() {
        XCTAssertFalse(LocalModelBudget.mlxLoadAllowed(availableBytes: peak, physicalBytes: eightGB, isSimulator: false))
        XCTAssertFalse(LocalModelBudget.mlxLoadAllowed(availableBytes: 0, physicalBytes: eightGB, isSimulator: false))
    }

    func testHeadroomAboveMacPeakOnDeviceIsAllowed() {
        XCTAssertTrue(LocalModelBudget.mlxLoadAllowed(availableBytes: peak + 1, physicalBytes: eightGB, isSimulator: false))
    }
}
