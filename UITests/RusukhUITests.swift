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
        XCTAssertEqual(edges.label, "علاقة واحدة")
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
        XCTAssertTrue(app.navigationBars["ملاحظة جديدة"].waitForExistence(timeout: 5))
        typeInto(app.textFields["note.title"], "تسجيل تجريبي", in: app)
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
    func testAudioStopsOnBackgroundAndCanRecordAgain() throws {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["-ui-testing", "-reset-test-data", "-AppleLanguages", "(ar)", "-AppleLocale", "ar_SA"]
        app.launch()
        XCTAssertTrue(app.buttons["ملاحظاتي"].waitForExistence(timeout: 10))
        app.buttons["ملاحظاتي"].tap()
        app.buttons["notes.add"].tap()
        reveal(app.buttons["voice.record"], in: app)
        app.buttons["voice.record"].tap()
        XCTAssertTrue(app.buttons["voice.stop"].waitForExistence(timeout: 10))
        // Long enough to distinguish background cancellation from natural end.
        Thread.sleep(forTimeInterval: 20)
        XCUIDevice.shared.press(.home)
        app.activate()
        XCTAssertTrue(app.buttons["تشغيل التسجيل"].waitForExistence(timeout: 10))
        XCTAssertFalse(app.buttons["voice.stop"].exists)
        XCTAssertFalse(app.staticTexts["voice.error"].exists)
        let playbackStarted = Date()
        app.buttons["تشغيل التسجيل"].tap()
        XCTAssertTrue(app.buttons["إيقاف التشغيل"].waitForExistence(timeout: 5))
        XCUIDevice.shared.press(.home)
        app.activate()
        XCTAssertTrue(app.buttons["تشغيل التسجيل"].waitForExistence(timeout: 10))
        XCTAssertLessThan(Date().timeIntervalSince(playbackStarted), 15,
                          "Background check must finish before the 20-second clip ends naturally")
        XCTAssertFalse(app.buttons["إيقاف التشغيل"].exists)
        // Closing an editor must release the singleton session for the next one.
        app.buttons["إلغاء"].tap()
        let discard = app.buttons["تجاهل التغييرات"]
        XCTAssertTrue(discard.waitForExistence(timeout: 5))
        discard.tap()
        XCTAssertTrue(app.buttons["notes.add"].waitForExistence(timeout: 5))
        app.buttons["notes.add"].tap()
        reveal(app.buttons["voice.record"], in: app)
        app.buttons["voice.record"].tap()
        XCTAssertTrue(app.buttons["voice.stop"].waitForExistence(timeout: 10))
        Thread.sleep(forTimeInterval: 2)
        app.buttons["voice.stop"].tap()
        XCTAssertTrue(app.buttons["تشغيل التسجيل"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.staticTexts["voice.error"].exists)
        capture("13-audio-background-and-reopen")
    }

    @MainActor
    func testSimulatorModelAvailabilityDoesNotStartUnsupportedGPU() throws {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["-ui-testing", "-reset-test-data", "-model-fixture", "-seed-model-fixture", "-model-fixture-base", "http://127.0.0.1:8765", "-AppleLanguages", "(ar)", "-AppleLocale", "ar_SA"]
        app.launch()
        XCTAssertTrue(app.buttons["ذكاء محلي"].waitForExistence(timeout: 10))
        app.buttons["ذكاء محلي"].tap()
        let section = app.buttons["arabic-model-section"]
        reveal(section, in: app)
        section.tap()
        let unavailable = app.staticTexts["arabic-model-simulator-unavailable"]
        XCTAssertTrue(unavailable.waitForExistence(timeout: 15), app.debugDescription)
        XCTAssertTrue(app.staticTexts["arabic-model-ready"].waitForExistence(timeout: 15))
        XCTAssertFalse(app.buttons["arabic-model-generate"].exists)
        capture("11-simulator-model-unavailable")
        XCUIDevice.shared.press(.home)
        app.activate()
        XCTAssertTrue(unavailable.waitForExistence(timeout: 10))
        app.buttons["ملاحظاتي"].tap()
        XCTAssertTrue(app.buttons["notes.add"].waitForExistence(timeout: 10))
        // MLX explicitly does not support Simulator GPU; never treat this as inference.
    }

    @MainActor
    func testZModelDownloadCancellationAndIntegrityThroughUI() throws {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["-ui-testing", "-model-fixture", "-seed-model-fixture", "-model-fixture-base", "http://127.0.0.1:8765", "-AppleLanguages", "(ar)", "-AppleLocale", "ar_SA"]
        app.launch()
        XCTAssertTrue(app.buttons["ذكاء محلي"].waitForExistence(timeout: 10))
        app.buttons["ذكاء محلي"].tap()
        let section = app.buttons["arabic-model-section"]
        reveal(section, in: app)
        section.tap()
        let remove = app.buttons["حذف أوزان النموذج"]
        XCTAssertTrue(remove.waitForExistence(timeout: 15))
        reveal(remove, in: app)
        remove.tap()
        app.buttons["حذف النموذج"].tap()
        let download = app.buttons["arabic-model-download"]
        XCTAssertTrue(download.waitForExistence(timeout: 15))
        reveal(download, in: app)
        download.tap()
        let cancel = app.buttons["arabic-model-cancel"]
        XCTAssertTrue(cancel.waitForExistence(timeout: 10))
        reveal(cancel, in: app)
        cancel.tap()
        let enabled = NSPredicate(format: "enabled == true")
        expectation(for: enabled, evaluatedWith: download)
        waitForExpectations(timeout: 20)
        XCTAssertTrue(app.staticTexts["arabic-model-status"].label.contains("أوقفت"))
        reveal(download, in: app)
        download.tap()
        // This exercises the app's URLSession path and SHA-256 checks, not CI provisioning.
        XCTAssertTrue(app.staticTexts["arabic-model-ready"].waitForExistence(timeout: 240), app.debugDescription)
        XCTAssertTrue(app.staticTexts["arabic-model-status"].label.contains("اكتمل التنزيل"))
        capture("12-native-model-download-verified")
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
        XCTAssertTrue(app.navigationBars["ملاحظة جديدة"].waitForExistence(timeout: 5))
        let field = app.textFields["note.title"]
        XCTAssertTrue(field.waitForExistence(timeout: 5))
        typeInto(field, title, in: app)
        typeInto(app.textViews["note.body"], body, in: app)
        app.buttons["note.save"].tap()
        XCTAssertTrue(app.buttons["notes.add"].waitForExistence(timeout: 5))
    }
    @MainActor private func typeInto(_ element: XCUIElement, _ text: String, in app: XCUIApplication) {
        XCTAssertTrue(element.waitForExistence(timeout: 5))
        // XCTest on this SDK does not expose hasKeyboardFocus to Swift; use KVC + keyboard.
        for _ in 0..<5 {
            if keyboardReady(element, in: app) { break }
            element.tap()
            _ = app.keyboards.firstMatch.waitForExistence(timeout: 1)
        }
        XCTAssertTrue(keyboardReady(element, in: app), "Expected keyboard focus before typing into \(element)")
        element.typeText(text)
    }
    @MainActor private func keyboardReady(_ element: XCUIElement, in app: XCUIApplication) -> Bool {
        if (element.value(forKey: "hasKeyboardFocus") as? Bool) == true { return true }
        return app.keyboards.firstMatch.exists
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
