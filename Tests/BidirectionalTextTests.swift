import XCTest
@testable import RusukhCore

final class BidirectionalTextTests: XCTestCase {
    func testNumbersAreLeftToRightIsolated() {
        let fraction = BidirectionalText.fraction(done: 2, total: 2)
        XCTAssertTrue(fraction.hasPrefix("\u{2066}"))
        XCTAssertTrue(fraction.hasSuffix("\u{2069}"))
        XCTAssertEqual(BidirectionalText.strippingIsolates(fraction), "2 / 2")
        XCTAssertEqual(BidirectionalText.strippingIsolates("النتيجة: \(fraction)"), "النتيجة: 2 / 2")
        XCTAssertEqual(BidirectionalText.strippingIsolates("\(BidirectionalText.count(1)) علاقة"), "1 علاقة")
    }

    func testEasternDigitsSurviveStripping() {
        let eastern = BidirectionalText.isolatedLTR("٢")
        XCTAssertEqual(BidirectionalText.strippingIsolates(eastern), "٢")
    }
}
