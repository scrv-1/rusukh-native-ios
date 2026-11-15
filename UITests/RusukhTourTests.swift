import XCTest

final class RusukhTourTests: XCTestCase {
    @MainActor
    func testUsageTour() throws {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["-ui-tour", "-ui-testing", "-reset-test-data", "-AppleLanguages", "(ar)", "-AppleLocale", "ar_SA"]
        app.launch()
        XCTAssertTrue(app.buttons["ملاحظاتي"].waitForExistence(timeout: 10))
        capture("tour-01-home")
        let gear = app.buttons["الإعدادات"]
        XCTAssertTrue(gear.waitForExistence(timeout: 5))
        XCTAssertLessThan(gear.frame.midX, app.windows.firstMatch.frame.midX, "RTL puts the settings control on the leading side")
        capture("tour-02-rtl")

        app.buttons["ملاحظاتي"].tap()
        addStudyNote(app)
        capture("tour-06-note-saved")
        search(app, "صلاه")
        XCTAssertTrue(app.staticTexts["إبراهيم"].waitForExistence(timeout: 5))
        capture("tour-07-search-taa-marbuta")
        clearSearch(app)
        search(app, "ابراهيم")
        XCTAssertTrue(app.staticTexts["إبراهيم"].waitForExistence(timeout: 5))
        capture("tour-08-search-hamza")
        clearSearch(app)

        dismissSearch(app)
        app.staticTexts["إبراهيم"].tap()
        let editor = app.textViews["note.body"]
        XCTAssertTrue(editor.waitForExistence(timeout: 5))
        editor.tap()
        editor.typeText("\nس: سؤال معدّل؟\nج: إجابة معدّلة")
        app.buttons["note.save"].tap()
        // Search UI hides the notes toolbar; dismiss it before asserting the add control.
        dismissSearch(app)
        XCTAssertTrue(app.buttons["notes.add"].waitForExistence(timeout: 8))
        capture("tour-09-note-edited")

        app.buttons["المراجعة"].tap()
        let ratings = [("مجدّدًا", "again"), ("صعب", "hard"), ("جيد", "good"), ("سهل", "easy")]
        for (offset, rating) in ratings.enumerated() {
            XCTAssertTrue(app.buttons["إظهار الإجابة"].waitForExistence(timeout: 5), "Missing card before \(rating.1)")
            app.buttons["إظهار الإجابة"].tap()
            capture("tour-\(String(format: "%02d", offset + 10))-review-\(rating.1)")
            app.buttons[rating.0].tap()
        }
        XCTAssertTrue(app.staticTexts["سؤال معدّل؟"].waitForExistence(timeout: 5))
        app.buttons["إظهار الإجابة"].tap()
        XCTAssertTrue(app.staticTexts["إجابة معدّلة"].waitForExistence(timeout: 5))
        capture("tour-14-edited-card")

        let quiz = app.buttons["اختبار اختيار من متعدد"]
        reveal(quiz, in: app)
        quiz.tap()
        XCTAssertTrue(app.navigationBars["اختبار سريع"].waitForExistence(timeout: 5))
        capture("tour-15-quiz")
        let choice = ["ثبات المعرفة", "تذكر المعلومة", "إجابة سهلة", "إجابة صعبة", "إجابة معدّلة"]
            .map { app.buttons[$0] }
            .first { $0.exists }
        XCTAssertNotNil(choice)
        choice?.tap()
        if app.buttons["التالي"].waitForExistence(timeout: 3) { app.buttons["التالي"].tap() }
        capture("tour-16-quiz-answer")
        app.buttons["إغلاق"].tap()

        app.buttons["ملاحظاتي"].tap()
        app.buttons["notes.add"].tap()
        let secondTitle = app.textFields["note.title"]
        XCTAssertTrue(secondTitle.waitForExistence(timeout: 5))
        secondTitle.tap()
        secondTitle.typeText("مراجعة")
        app.textViews["note.body"].tap()
        app.textViews["note.body"].typeText("س: ما الثاني؟\nج: ثاني")
        app.buttons["note.save"].tap()
        XCTAssertTrue(app.buttons["notes.add"].waitForExistence(timeout: 5))

        app.buttons["ملاحظاتي"].tap()
        let row = app.staticTexts["إبراهيم"]
        XCTAssertTrue(row.waitForExistence(timeout: 5))
        row.swipeRight()
        if !app.buttons["حذف"].waitForExistence(timeout: 2) { row.swipeLeft() }
        XCTAssertTrue(app.buttons["حذف"].waitForExistence(timeout: 5))
        capture("tour-17-delete-swipe")
        app.buttons["حذف"].tap()
        let confirmDelete = app.buttons["حذف الملاحظة"]
        XCTAssertTrue(confirmDelete.waitForExistence(timeout: 5))
        capture("tour-18-delete-confirm")
        confirmDelete.tap()
        XCTAssertFalse(app.staticTexts["إبراهيم"].waitForExistence(timeout: 2))
        capture("tour-19-deleted")

        app.buttons["الرئيسية"].tap()
        gear.tap()
        let prepare = app.buttons["backup.prepare"]
        XCTAssertTrue(prepare.waitForExistence(timeout: 5))
        reveal(prepare, in: app)
        prepare.tap()
        let share = app.buttons["حفظ النسخة في الملفات"]
        XCTAssertTrue(share.waitForExistence(timeout: 5))
        capture("tour-20-export")
        let reimport = app.buttons["tour.import-prepared"]
        reveal(reimport, in: app)
        reimport.tap()
        dismissAlert(app)
        let replace = app.buttons["استبدال البيانات"]
        XCTAssertTrue(replace.waitForExistence(timeout: 5))
        capture("tour-21-import-confirm")
        replace.tap()
        dismissAlert(app)
        app.buttons["إغلاق"].tap()
        app.buttons["ملاحظاتي"].tap()
        XCTAssertTrue(app.staticTexts["مراجعة"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.staticTexts["إبراهيم"].exists)
        capture("tour-22-imported")

        app.buttons["الرئيسية"].tap()
        gear.tap()
        let corrupt = app.buttons["tour.corrupt"]
        XCTAssertTrue(corrupt.waitForExistence(timeout: 5))
        reveal(corrupt, in: app)
        corrupt.tap()
        let recovered = app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "استُعيدت")).firstMatch
        XCTAssertTrue(recovered.waitForExistence(timeout: 5), app.debugDescription)
        capture("tour-23-recovered")
        dismissAlert(app)
        app.buttons["إغلاق"].tap()
        XCTAssertTrue(app.staticTexts["مراجعة"].waitForExistence(timeout: 5))

        XCUIDevice.shared.appearance = .dark
        capture("tour-24-dark-mode")
        XCUIDevice.shared.orientation = .landscapeLeft
        capture("tour-25-rotation")
        XCUIDevice.shared.orientation = .portrait
        XCUIDevice.shared.appearance = .light

        app.terminate()
        app.launchArguments = ["-ui-tour", "-ui-testing", "-AppleLanguages", "(ar)", "-AppleLocale", "ar_SA",
                               "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"]
        app.launch()
        XCTAssertTrue(app.buttons["ملاحظاتي"].waitForExistence(timeout: 10))
        capture("tour-26-dynamic-type")

        app.buttons["ذكاء محلي"].tap()
        let section = app.buttons["arabic-model-section"]
        XCTAssertTrue(section.waitForExistence(timeout: 5))
        reveal(section, in: app)
        section.tap()
        XCTAssertTrue(app.staticTexts["arabic-model-simulator-unavailable"].waitForExistence(timeout: 10))
        capture("tour-27-local-model")
    }

    @MainActor
    private func addStudyNote(_ app: XCUIApplication) {
        app.buttons["notes.add"].tap()
        let title = app.textFields["note.title"]
        XCTAssertTrue(title.waitForExistence(timeout: 5))
        title.tap()
        title.typeText("إبراهيم")
        let editor = app.textViews["note.body"]
        editor.tap()
        editor.typeText("صلاة\nس: ما الرسوخ؟\nج: ثبات المعرفة\nس: ما الاسترجاع؟\nج: تذكر المعلومة\nس: ما السهل؟\nج: إجابة سهلة\nس: ما الصعب؟\nج: إجابة صعبة")
        capture("tour-03-editor")
        reveal(app.buttons["voice.record"], in: app)
        app.buttons["voice.record"].tap()
        XCTAssertTrue(app.buttons["voice.stop"].waitForExistence(timeout: 10))
        Thread.sleep(forTimeInterval: 2)
        app.buttons["voice.stop"].tap()
        XCTAssertTrue(app.buttons["تشغيل التسجيل"].waitForExistence(timeout: 5))
        capture("tour-04-audio")
        reveal(app.buttons["tour.attach-image"], in: app)
        app.buttons["tour.attach-image"].tap()
        XCTAssertTrue(app.buttons["إزالة الصورة"].waitForExistence(timeout: 5))
        capture("tour-05-image")
        app.buttons["note.save"].tap()
        XCTAssertTrue(app.buttons["notes.add"].waitForExistence(timeout: 5))
    }

    @MainActor
    private func search(_ app: XCUIApplication, _ query: String) {
        let search = app.searchFields.firstMatch
        XCTAssertTrue(search.waitForExistence(timeout: 5))
        search.tap()
        search.typeText(query)
    }

    @MainActor
    private func clearSearch(_ app: XCUIApplication) {
        let search = app.searchFields.firstMatch
        search.tap()
        let current = (search.value as? String) ?? ""
        if !current.isEmpty {
            search.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: current.count + 2))
        }
        dismissSearch(app)
    }

    @MainActor
    private func dismissSearch(_ app: XCUIApplication) {
        let close = app.navigationBars.buttons["إغلاق"]
        if close.waitForExistence(timeout: 2), close.isHittable {
            close.tap()
        }
    }

    @MainActor
    private func dismissAlert(_ app: XCUIApplication) {
        let ok = app.buttons["حسنًا"]
        if ok.waitForExistence(timeout: 3) { ok.tap() }
    }

    @MainActor
    private func reveal(_ element: XCUIElement, in app: XCUIApplication) {
        for _ in 0..<5 {
            if element.isHittable { return }
            app.swipeUp()
        }
    }

    @MainActor
    private func capture(_ name: String) {
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
