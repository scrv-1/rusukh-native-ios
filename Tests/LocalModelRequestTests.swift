import XCTest
@testable import RusukhCore

final class LocalModelRequestTests: XCTestCase {
    func testFullReferenceAtBoundaryIsPreserved() throws {
        let note = String(repeating: "ع", count: 1_994) + " باريس"
        XCTAssertEqual(note.count, 2_000)
        XCTAssertTrue(try LocalModelRequest.make(prompt: "ما العاصمة؟", context: note).hasSuffix(note))
    }
    func testFactBeyondLimitRejectsReferenceInsteadOfDroppingFact() {
        let note = String(repeating: "ع", count: 2_000) + " العاصمة باريس"
        XCTAssertThrowsError(try LocalModelRequest.make(prompt: "ما العاصمة؟", context: note)) { error in
            guard case LocalModelRequest.Failure.contextTooLong = error else { return XCTFail("Wrong rejection: \(error)") }
        }
    }
    func testInvalidPromptsAreRejectedBeforeLoadingModel() {
        XCTAssertThrowsError(try LocalModelRequest.make(prompt: " \n ", context: nil))
        XCTAssertThrowsError(try LocalModelRequest.make(prompt: String(repeating: "س", count: 1_501), context: nil))
    }
}
