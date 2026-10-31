import XCTest

final class RusukhUITests: XCTestCase {
    @MainActor
    func testArabicStudyJourneyAndPersistence() throws {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["-ui-testing", "-reset-test-data", "-AppleLanguages", "(ar)", "-AppleLocale", "ar_SA"]
        app.launch()
        XCTAssertTrue(app.buttons["ملاحظاتي"].waitForExistence(timeout: 10))
        capture("01-home")
        app.buttons["ملاحظاتي"].tap()
        addNote(app, title: "رُسُوخ", body: "[[التعلم]]\nس: ما الرسوخ؟\nج: ثبات المعرفة")
        addNote(app, title: "التعلم", body: "س: ما الاسترجاع؟\nج: تذكر المعلومة")
        capture("02-notes")
        let search = app.searchFields.firstMatch
        search.tap()
        search.typeText("رسوخ")
        XCTAssertTrue(app.staticTexts["رُسُوخ"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.staticTexts["التعلم"].exists)
        capture("03-arabic-search")
        app.terminate()
        app.launchArguments.removeAll { $0 == "-reset-test-data" }
        app.launch()
        app.buttons["ملاحظاتي"].tap()
        XCTAssertTrue(app.staticTexts["رُسُوخ"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["التعلم"].exists)
        XCUIDevice.shared.press(.home)
        app.activate()
        XCTAssertTrue(app.staticTexts["رُسُوخ"].waitForExistence(timeout: 5))
        app.buttons["الشبكة"].tap()
        let edges = app.staticTexts["graph.edge-count"]
        XCTAssertTrue(edges.waitForExistence(timeout: 5))
        XCTAssertEqual(digits(edges.label), "1 علاقة")
        capture("04-graph")
        app.buttons["المراجعة"].tap()
        XCTAssertTrue(app.staticTexts["ما الرسوخ؟"].exists)
        app.buttons["إظهار الإجابة"].tap()
        capture("05-review")
        app.buttons["جيد"].tap()
        XCTAssertTrue(app.staticTexts["ما الاسترجاع؟"].waitForExistence(timeout: 5))
        app.terminate()
        app.launch()
        app.buttons["المراجعة"].tap()
        XCTAssertTrue(app.staticTexts["ما الاسترجاع؟"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.staticTexts["ما الرسوخ؟"].exists)
        app.buttons["اختبار اختيار من متعدد"].tap()
        XCTAssertTrue(app.navigationBars["اختبار سريع"].waitForExistence(timeout: 5))
        capture("06-quiz")
        app.buttons["ثبات المعرفة"].tap()
        app.buttons["التالي"].tap()
        app.buttons["تذكر المعلومة"].tap()
        app.buttons["التالي"].tap()
        let score = app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", "النتيجة:")).firstMatch
        XCTAssertTrue(score.waitForExistence(timeout: 5))
        XCTAssertEqual(digits(score.label), "النتيجة: 2 / 2")
        app.navigationBars.buttons["إغلاق"].tap()
        app.buttons["ذكاء محلي"].tap()
        capture("07-local-ai-availability")
        // A screenshot of this screen does not verify model inference.
        app.buttons["ملاحظاتي"].tap()
        app.staticTexts["رُسُوخ"].tap()
        let editor = app.textViews["note.body"]
        XCTAssertTrue(editor.waitForExistence(timeout: 5))
        XCTAssertTrue((editor.value as? String ?? "").contains("[[التعلم]]"))
        app.swipeUp()
        app.buttons["التقاط صورة"].tap()
        XCTAssertTrue(app.alerts["الكاميرا غير متاحة"].waitForExistence(timeout: 5))
        capture("08-simulator-camera-unavailable")
    }
    @MainActor private func addNote(_ app: XCUIApplication, title: String, body: String) {
        app.buttons["notes.add"].tap()
        let field = app.textFields["note.title"]
        XCTAssertTrue(field.waitForExistence(timeout: 5))
        field.tap(); field.typeText(title)
        let editor = app.textViews["note.body"]
        editor.tap(); editor.typeText(body)
        app.buttons["note.save"].tap()
        XCTAssertTrue(app.buttons["notes.add"].waitForExistence(timeout: 5))
    }
    @MainActor private func capture(_ name: String) {
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
    private func digits(_ text: String) -> String {
        String(text.map { char in char.wholeNumberValue.map { Character(String($0)) } ?? char })
    }
}
