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
        reveal(app.buttons["التقاط صورة"], in: app)
        app.buttons["التقاط صورة"].tap()
        XCTAssertTrue(app.alerts["الكاميرا غير متاحة"].waitForExistence(timeout: 5))
        capture("08-simulator-camera-unavailable")
    }
    @MainActor
    func testSimulatorAudioAttachmentSurvivesRelaunch() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-ui-testing", "-reset-test-data", "-AppleLanguages", "(ar)", "-AppleLocale", "ar_SA"]
        app.launch()
        XCTAssertTrue(app.buttons["ملاحظاتي"].waitForExistence(timeout: 10))
        app.buttons["ملاحظاتي"].tap()
        app.buttons["notes.add"].tap()
        let title = app.textFields["note.title"]
        XCTAssertTrue(title.waitForExistence(timeout: 5))
        title.tap(); title.typeText("تسجيل تجريبي")
        reveal(app.buttons["voice.record"], in: app)
        app.buttons["voice.record"].tap()
        XCTAssertTrue(app.buttons["voice.stop"].waitForExistence(timeout: 10))
        // This records the simulator's audio input, not a real iPhone microphone.
        Thread.sleep(forTimeInterval: 3)
        app.buttons["voice.stop"].tap()
        XCTAssertTrue(app.buttons["تشغيل التسجيل"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.staticTexts["voice.error"].exists)
        capture("09-simulator-audio-recorded")
        app.buttons["note.save"].tap()
        XCTAssertTrue(app.buttons["notes.add"].waitForExistence(timeout: 5))
        app.terminate()
        app.launchArguments.removeAll { $0 == "-reset-test-data" }
        app.launch()
        app.buttons["ملاحظاتي"].tap()
        app.staticTexts["تسجيل تجريبي"].tap()
        reveal(app.buttons["تشغيل التسجيل"], in: app)
        app.buttons["تشغيل التسجيل"].tap()
        XCTAssertTrue(app.buttons["إيقاف التشغيل"].waitForExistence(timeout: 2))
        XCTAssertFalse(app.staticTexts["voice.error"].exists)
        capture("10-simulator-audio-reopened")
    }
    @MainActor
    func testProvisionedArabicModelGeneratesInSimulator() throws {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["-ui-testing", "-reset-test-data", "-AppleLanguages", "(ar)", "-AppleLocale", "ar_SA"]
        app.launch()
        XCTAssertTrue(app.buttons["ذكاء محلي"].waitForExistence(timeout: 10))
        app.buttons["ذكاء محلي"].tap()
        let input = app.textFields["ai.prompt"].exists ? app.textFields["ai.prompt"] : app.textViews["ai.prompt"]
        XCTAssertTrue(input.waitForExistence(timeout: 10))
        input.tap()
        input.typeText("الملاحظة: عاصمة فرنسا باريس. ما عاصمة فرنسا؟ أجب وفق الملاحظة بكلمة واحدة.")
        let section = app.buttons["arabic-model-section"]
        reveal(section, in: app)
        section.tap()
        let generate = app.buttons["arabic-model-generate"]
        XCTAssertTrue(generate.waitForExistence(timeout: 15), "CI must provision verified model weights before this test")
        reveal(generate, in: app)
        generate.tap()
        let answer = app.staticTexts["arabic-model-answer"]
        XCTAssertTrue(answer.waitForExistence(timeout: 90))
        XCTAssertTrue(answer.label.contains("باريس"))
        capture("11-native-arabic-model-generated")
        XCUIDevice.shared.press(.home)
        app.activate()
        XCTAssertTrue(answer.waitForExistence(timeout: 10))
        // The Mac probe proves process network denial; this test proves iOS runtime execution.
    }

    @MainActor private func reveal(_ element: XCUIElement, in app: XCUIApplication) {
        for _ in 0..<4 {
            if element.isHittable { return }
            app.swipeUp()
        }
        XCTAssertTrue(element.isHittable)
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
