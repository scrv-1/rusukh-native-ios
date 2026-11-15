import Foundation
import XCTest
@testable import RusukhCore

final class StringCatalogTests: XCTestCase {
    func testCatalogPluralStringsMatchTheFormatter() throws {
        let catalogURL = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("App/Localizable.xcstrings")
        let data = try Data(contentsOf: catalogURL)
        let root = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        let strings = try XCTUnwrap(root?["strings"] as? [String: Any])
        try expect(strings, key: "graph.edges", samples: [
            0: ArabicPlurals.edges(0), 1: ArabicPlurals.edges(1), 2: ArabicPlurals.edges(2),
            3: ArabicPlurals.edges(3), 11: ArabicPlurals.edges(11), 100: ArabicPlurals.edges(100)
        ])
        try expect(strings, key: "graph.nodes", samples: [
            0: ArabicPlurals.nodes(0), 1: ArabicPlurals.nodes(1), 2: ArabicPlurals.nodes(2),
            5: ArabicPlurals.nodes(5), 21: ArabicPlurals.nodes(21)
        ])
        try expect(strings, key: "notes.count", samples: [
            0: ArabicPlurals.notes(0), 1: ArabicPlurals.notes(1), 2: ArabicPlurals.notes(2),
            4: ArabicPlurals.notes(4), 15: ArabicPlurals.notes(15)
        ])
        try expect(strings, key: "cards.count", samples: [
            0: ArabicPlurals.cards(0), 1: ArabicPlurals.cards(1), 2: ArabicPlurals.cards(2),
            6: ArabicPlurals.cards(6), 100: ArabicPlurals.cards(100)
        ])
        try expect(strings, key: "review.due", samples: [
            0: ArabicPlurals.dueCards(0), 1: ArabicPlurals.dueCards(1), 2: ArabicPlurals.dueCards(2),
            4: ArabicPlurals.dueCards(4), 15: ArabicPlurals.dueCards(15)
        ])
    }

    private func expect(_ strings: [String: Any], key: String, samples: [Int: String]) throws {
        let entry = try XCTUnwrap(strings[key] as? [String: Any])
        let localizations = try XCTUnwrap(entry["localizations"] as? [String: Any])
        let arabic = try XCTUnwrap(localizations["ar"] as? [String: Any])
        let variations = try XCTUnwrap(arabic["variations"] as? [String: Any])
        let plural = try XCTUnwrap(variations["plural"] as? [String: Any])
        for (count, expected) in samples {
            let category = ArabicPlurals.category(count).rawValue
            let variant = try XCTUnwrap(plural[category] as? [String: Any])
            let unit = try XCTUnwrap(variant["stringUnit"] as? [String: Any])
            let template = try XCTUnwrap(unit["value"] as? String)
            XCTAssertEqual(template.replacingOccurrences(of: "%lld", with: String(count)), expected, "\(key) \(count)")
        }
    }
}
