import XCTest
import UIKit

final class RusukhTourTests: XCTestCase {
    @MainActor
    func testUsageTour() throws {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["-ui-tour", "-ui-testing", "-reset-test-data", "-AppleLanguages", "(ar)", "-AppleLocale", "ar_SA"]
        launchReady(app)
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
        let editor = noteBodyField(in: app)
        XCTAssertTrue(editor.waitForExistence(timeout: 5))
        // Replace with the full body so the fifth Q/A is definitely imported (append can
        // wipe a selected TextField and syncedCards would only rewrite leftover cards).
        replaceText(
            editor,
            "صلاة\nس: ما الرسوخ؟\nج: ثبات المعرفة\nس: ما الاسترجاع؟\nج: تذكر المعلومة\nس: ما السهل؟\nج: إجابة سهلة\nس: ما الصعب؟\nج: إجابة صعبة\nس: سؤال معدّل؟\nج: إجابة معدّلة",
            in: app
        )
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
        XCTAssertTrue(app.navigationBars["ملاحظة جديدة"].waitForExistence(timeout: 5))
        let secondTitle = app.textFields["note.title"]
        typeInto(secondTitle, "مراجعة", in: app)
        typeInto(noteBodyField(in: app), "س: ما الثاني؟\nج: ثاني", in: app)
        app.buttons["note.save"].tap()
        XCTAssertTrue(app.buttons["notes.add"].waitForExistence(timeout: 5))

        app.buttons["ملاحظاتي"].tap()
        let row = app.staticTexts["إبراهيم"]
        XCTAssertTrue(row.waitForExistence(timeout: 5))
        // Prefer the list cell swipe target; StaticText-only swipes often miss swipeActions.
        let cell = app.cells.containing(.staticText, identifier: "إبراهيم").element
        let swipeTarget = cell.exists ? cell : row
        for direction in [0, 1, 0] {
            if app.buttons["حذف"].exists { break }
            if direction == 0 { swipeTarget.swipeLeft() } else { swipeTarget.swipeRight() }
            if app.buttons["حذف"].waitForExistence(timeout: 2) { break }
        }
        let deleteAction = app.buttons["حذف"].firstMatch
        XCTAssertTrue(deleteAction.waitForExistence(timeout: 5), app.debugDescription)
        capture("tour-17-delete-swipe")
        deleteAction.tap()
        // confirmationDialog exposes nested duplicate buttons; target the identifier once.
        let confirmDelete = app.buttons["note.confirm-delete"].firstMatch
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
        launchReady(app)
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
        XCTAssertTrue(app.navigationBars["ملاحظة جديدة"].waitForExistence(timeout: 5))
        let title = app.textFields["note.title"]
        XCTAssertTrue(title.waitForExistence(timeout: 5))
        typeInto(title, "إبراهيم", in: app)
        typeInto(noteBodyField(in: app), "صلاة\nس: ما الرسوخ؟\nج: ثبات المعرفة\nس: ما الاسترجاع؟\nج: تذكر المعلومة\nس: ما السهل؟\nج: إجابة سهلة\nس: ما الصعب؟\nج: إجابة صعبة", in: app)
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
    private func typeInto(_ element: XCUIElement, _ text: String, in app: XCUIApplication) {
        focus(element)
        element.typeText(text)
    }

    @MainActor
    private func replaceText(_ element: XCUIElement, _ text: String, in app: XCUIApplication) {
        focus(element)
        let current = (element.value as? String) ?? ""
        let placeholder = (element.placeholderValue as? String) ?? ""
        let content = current == placeholder ? "" : current
        if !content.isEmpty {
            element.coordinate(withNormalizedOffset: CGVector(dx: 0.95, dy: 0.95)).tap()
            element.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: content.count + 8))
        }
        // Paste is faster and more reliable for multi-line Arabic bodies than typeText.
        UIPasteboard.general.string = text
        element.press(forDuration: 1.0)
        let paste = app.menuItems.matching(
            NSPredicate(format: "label CONTAINS[c] %@ OR label CONTAINS %@", "Paste", "لصق")
        ).firstMatch
        if paste.waitForExistence(timeout: 2) {
            paste.tap()
        } else {
            element.typeText(text)
        }
    }

    @MainActor
    private func launchReady(_ app: XCUIApplication) {
        // CI simulators occasionally time out on the first Xcode-mediated launch.
        let previous = continueAfterFailure
        continueAfterFailure = true
        defer { continueAfterFailure = previous }
        for attempt in 1...3 {
            app.terminate()
            app.launch()
            if app.buttons["ملاحظاتي"].waitForExistence(timeout: 25) { return }
            RunLoop.current.run(until: Date().addingTimeInterval(2))
            if attempt == 3 {
                continueAfterFailure = false
                XCTFail("App failed to launch after \(attempt) attempts")
            }
        }
    }

    @MainActor
    private func focus(_ element: XCUIElement) {
        XCTAssertTrue(element.waitForExistence(timeout: 5))
        for _ in 0..<8 {
            if elementIsFocused(element) { return }
            element.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.2)).tap()
            RunLoop.current.run(until: Date().addingTimeInterval(0.3))
        }
        XCTAssertTrue(elementIsFocused(element), "Expected keyboard focus on \(element)")
    }

    @MainActor
    private func elementIsFocused(_ element: XCUIElement) -> Bool {
        (element.value(forKey: "hasKeyboardFocus") as? Bool) == true
    }

    @MainActor
    private func noteBodyField(in app: XCUIApplication) -> XCUIElement {
        // Vertical TextField may surface as TextField or TextView depending on iOS.
        app.descendants(matching: .any)["note.body"]
    }

    @MainActor
    private func search(_ app: XCUIApplication, _ query: String) {
        let search = app.searchFields.firstMatch
        XCTAssertTrue(search.waitForExistence(timeout: 5))
        typeInto(search, query, in: app)
    }

    @MainActor
    private func clearSearch(_ app: XCUIApplication) {
        let search = app.searchFields.firstMatch
        XCTAssertTrue(search.waitForExistence(timeout: 5))
        if !elementIsFocused(search) { search.tap() }
        let current = (search.value as? String) ?? ""
        if !current.isEmpty {
            if elementIsFocused(search) {
                search.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: current.count + 2))
            } else {
                typeInto(search, "", in: app)
                search.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: current.count + 2))
            }
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
