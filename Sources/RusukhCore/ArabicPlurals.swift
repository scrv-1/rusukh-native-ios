import Foundation

/// Arabic CLDR plural categories. The strings match `App/Localizable.xcstrings`; the catalog test keeps them together.
public enum ArabicPlurals {
    public enum Category: String, Sendable {
        case zero, one, two, few, many, other
    }

    public static func category(_ count: Int) -> Category {
        let value = abs(count)
        if value == 0 { return .zero }
        if value == 1 { return .one }
        if value == 2 { return .two }
        let remainder = value % 100
        if (3...10).contains(remainder) { return .few }
        if (11...99).contains(remainder) { return .many }
        return .other
    }

    public static func edges(_ count: Int) -> String { phrase(count, forms: edgeForms) }
    public static func nodes(_ count: Int) -> String { phrase(count, forms: nodeForms) }
    public static func dueCards(_ count: Int) -> String { phrase(count, forms: dueForms) }
    public static func notes(_ count: Int) -> String { phrase(count, forms: noteForms) }
    public static func cards(_ count: Int) -> String { phrase(count, forms: cardForms) }

    private static let edgeForms: [Category: String] = [
        .zero: "لا علاقات", .one: "علاقة واحدة", .two: "علاقتان",
        .few: "%d علاقات", .many: "%d علاقة", .other: "%d علاقة"
    ]
    private static let nodeForms: [Category: String] = [
        .zero: "لا عقد", .one: "عقدة واحدة", .two: "عقدتان",
        .few: "%d عقد", .many: "%d عقدة", .other: "%d عقدة"
    ]
    private static let dueForms: [Category: String] = [
        .zero: "لا بطاقات مستحقة", .one: "بطاقة مستحقة واحدة", .two: "بطاقتان مستحقتان",
        .few: "%d بطاقات مستحقة", .many: "%d بطاقة مستحقة", .other: "%d بطاقة مستحقة"
    ]
    private static let noteForms: [Category: String] = [
        .zero: "لا ملاحظات", .one: "ملاحظة واحدة", .two: "ملاحظتان",
        .few: "%d ملاحظات", .many: "%d ملاحظة", .other: "%d ملاحظة"
    ]
    private static let cardForms: [Category: String] = [
        .zero: "لا بطاقات", .one: "بطاقة واحدة", .two: "بطاقتان",
        .few: "%d بطاقات", .many: "%d بطاقة", .other: "%d بطاقة"
    ]

    private static func phrase(_ count: Int, forms: [Category: String]) -> String {
        let template = forms[category(count)] ?? "%d"
        return template.replacingOccurrences(of: "%d", with: String(count))
    }
}
