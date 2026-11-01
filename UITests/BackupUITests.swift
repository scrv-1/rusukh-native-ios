import XCTest

/// This test must traverse the system file picker. The launch fixture supplies
/// a JSON document only; it never imports data or dismisses UI on the test's behalf.
final class BackupUITests: XCTestCase {
    @MainActor
    func testSystemFilePickerCancelReplaceAndRestoreAfterRelaunch() throws {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["-ui-testing", "-reset-test-data", "-backup-fixture",
                               "-AppleLanguages", "(ar)", "-AppleLocale", "ar_SA"]
        app.launch()
        try require(app.buttons["ملاحظاتي"], in: app)
        app.buttons["ملاحظاتي"].tap()
        app.buttons["notes.add"].tap()
        try require(app.textFields["note.title"], in: app)
        app.textFields["note.title"].tap()
        app.textFields["note.title"].typeText("الملاحظة الأصلية قبل الاستيراد")
        app.textViews["note.body"].tap()
        app.textViews["note.body"].typeText("يجب أن تبقى عند الإلغاء وأن تعود من نقطة الرجوع.")
        app.buttons["note.save"].tap()
        try require(app.buttons["notes.add"], in: app)

        try openSettings(app)
        try chooseBackupThroughSystemPicker(app)
        try expect(digits(app.staticTexts["backup.current.counts"].label) == "الملاحظات: 1 · البطاقات: 0 · المراجعات: 0",
                   "Preview must show the original note", in: app)
        try expect(digits(app.staticTexts["backup.incoming.counts"].label) == "الملاحظات: 2 · البطاقات: 1 · المراجعات: 0",
                   "Preview must show the document's actual contents", in: app)
        capture("backup-01-system-file-preview")
        app.buttons["backup.cancel"].tap()
        try reveal(app.staticTexts["backup.recovery.count"], in: app)
        try expect(digits(app.staticTexts["backup.recovery.count"].label).hasPrefix("0 من"),
                   "Cancelling must not create a recovery point", in: app)
        try closeSettingsAndCheckNotes(app, originalPresent: true, importedPresent: false)

        try openSettings(app)
        try chooseBackupThroughSystemPicker(app)
        try reveal(app.buttons["backup.mode.replace"], in: app)
        app.buttons["backup.mode.replace"].tap()
        try reveal(app.buttons["backup.apply"], in: app)
        app.buttons["backup.apply"].tap()
        try require(app.buttons["backup.confirm-replace"], in: app)
        capture("backup-02-replacement-confirmation")
        app.buttons["backup.confirm-replace"].tap()
        try require(app.staticTexts["backup.status"], in: app)
        try expect(app.staticTexts["backup.status"].label.contains("اكتمل الاستيراد"),
                   "Replacement must complete before proceeding", in: app)
        try closeSettingsAndCheckNotes(app, originalPresent: false, importedPresent: true)
        capture("backup-03-replaced-notes")

        app.terminate()
        app.launchArguments.removeAll { $0 == "-reset-test-data" || $0 == "-backup-fixture" }
        app.launch()
        try require(app.buttons["ملاحظاتي"], in: app)
        app.buttons["ملاحظاتي"].tap()
        try checkNotes(app, originalPresent: false, importedPresent: true)
        try openSettings(app)
        try reveal(app.staticTexts["backup.recovery.count"], in: app)
        try expect(digits(app.staticTexts["backup.recovery.count"].label).hasPrefix("1 من"),
                   "Replacement must preserve one recovery point across relaunch", in: app)
        let restore = app.buttons.matching(NSPredicate(
            format: "identifier BEGINSWITH %@ AND identifier ENDSWITH %@", "backup.recovery.", ".restore")).firstMatch
        try reveal(restore, in: app)
        restore.tap()
        try require(app.staticTexts["backup.preview"], in: app)
        try expect(digits(app.staticTexts["backup.incoming.counts"].label) == "الملاحظات: 1 · البطاقات: 0 · المراجعات: 0",
                   "Recovery preview must contain the original note", in: app)
        capture("backup-04-recovery-preview")
        try reveal(app.buttons["backup.apply"], in: app)
        app.buttons["backup.apply"].tap()
        try require(app.buttons["backup.confirm-replace"], in: app)
        app.buttons["backup.confirm-replace"].tap()
        try require(app.staticTexts["backup.status"], in: app)
        try expect(app.staticTexts["backup.status"].label.contains("استُعيدت النسخة"),
                   "Recovery must finish before checking persisted data", in: app)
        try closeSettingsAndCheckNotes(app, originalPresent: true, importedPresent: false)
        app.terminate()
        app.launch()
        try require(app.buttons["ملاحظاتي"], in: app)
        app.buttons["ملاحظاتي"].tap()
        try checkNotes(app, originalPresent: true, importedPresent: false)
        capture("backup-05-restored-after-relaunch")
    }

    @MainActor private func openSettings(_ app: XCUIApplication) throws {
        app.buttons["الرئيسية"].tap()
        try require(app.buttons["الإعدادات"], in: app)
        app.buttons["الإعدادات"].tap()
        try reveal(app.buttons["backup.import"], in: app)
    }

    @MainActor private func chooseBackupThroughSystemPicker(_ app: XCUIApplication) throws {
        app.buttons["backup.import"].tap()
        // The picker can reopen its last folder. Labels belong to Apple's UI,
        // so support both the simulator's English locale and the app's Arabic.
        let file = ["RusukhBackupUITest.json", "RusukhBackupUITest"]
        if !tapPickerItem(file, prefix: true, in: app, timeout: 2, screenshotName: "backup-system-file-picker") {
            _ = tapPickerItem(["Browse", "تصفح", "استعراض"], in: app, timeout: 3)
            let local = ["On My iPhone", "على الـ iPhone", "على الـiPhone", "على جهاز iPhone", "على iPhone"]
            if !tapPickerItem(local, in: app, timeout: 4) {
                _ = tapPickerItem(["Browse", "تصفح", "استعراض", "Locations", "المواقع"], in: app, timeout: 2)
                guard tapPickerItem(local, in: app, timeout: 5) else {
                    try fail("System file picker did not expose On My iPhone", in: app)
                }
            }
            guard tapPickerItem(["رُسوخ", "رسوخ", "RusukhNative"], in: app, timeout: 10) else {
                try fail("Debug Documents folder was not visible in the system picker", in: app)
            }
            guard tapPickerItem(file, prefix: true, in: app, timeout: 10, screenshotName: "backup-system-file-picker") else {
                try fail("Synthetic JSON fixture was not visible in the system picker", in: app)
            }
        }
        if !app.staticTexts["backup.preview"].waitForExistence(timeout: 2) {
            _ = tapPickerItem(["Open", "فتح"], in: app, timeout: 2)
        }
        try require(app.staticTexts["backup.preview"], in: app, timeout: 15)
        try expect(app.staticTexts["backup.preview"].label == "RusukhBackupUITest.json",
                   "The preview must come from the chosen JSON file", in: app)
    }

    @MainActor private func tapPickerItem(_ labels: [String], prefix: Bool = false,
                                          in app: XCUIApplication, timeout: TimeInterval,
                                          screenshotName: String? = nil) -> Bool {
        let deadline = Date().addingTimeInterval(timeout)
        repeat {
            for label in labels {
                let predicate = NSPredicate(format: prefix ? "label BEGINSWITH %@" : "label == %@", label)
                for query in [app.cells, app.buttons, app.staticTexts] {
                    let item = query.matching(predicate).firstMatch
                    if item.waitForExistence(timeout: 0.15), item.isHittable {
                        if let screenshotName { capture(screenshotName) }
                        item.tap()
                        return true
                    }
                }
            }
        } while Date() < deadline
        return false
    }

    @MainActor private func closeSettingsAndCheckNotes(_ app: XCUIApplication,
                                                      originalPresent: Bool, importedPresent: Bool) throws {
        try require(app.navigationBars.buttons["إغلاق"], in: app)
        app.navigationBars.buttons["إغلاق"].tap()
        app.buttons["ملاحظاتي"].tap()
        try checkNotes(app, originalPresent: originalPresent, importedPresent: importedPresent)
    }

    @MainActor private func checkNotes(_ app: XCUIApplication,
                                       originalPresent: Bool, importedPresent: Bool) throws {
        try require(app.buttons["notes.add"], in: app)
        let original = app.staticTexts["الملاحظة الأصلية قبل الاستيراد"]
        let imported = app.staticTexts["نسخة الاختبار المستوردة"]
        if originalPresent { try require(original, in: app) }
        if importedPresent { try require(imported, in: app) }
        try expect(original.exists == originalPresent && imported.exists == importedPresent,
                   "Notes do not match the approved import or recovery", in: app)
    }

    @MainActor private func reveal(_ element: XCUIElement, in app: XCUIApplication) throws {
        for _ in 0..<6 {
            if element.exists, element.isHittable { return }
            app.swipeUp()
        }
        try expect(element.exists && element.isHittable, "Expected backup control is not reachable", in: app)
    }

    @MainActor private func require(_ element: XCUIElement, in app: XCUIApplication,
                                    timeout: TimeInterval = 10) throws {
        try expect(element.waitForExistence(timeout: timeout), "Expected UI element is missing: \(element)", in: app)
    }

    @MainActor private func expect(_ condition: Bool, _ message: String, in app: XCUIApplication) throws {
        if !condition { try fail(message, in: app) }
    }

    private enum JourneyFailure: Error { case missingUI }

    @MainActor private func fail(_ message: String, in app: XCUIApplication) throws -> Never {
        capture("backup-failure")
        let hierarchy = XCTAttachment(string: app.debugDescription)
        hierarchy.name = "backup-failure-accessibility-tree"
        hierarchy.lifetime = .keepAlways
        add(hierarchy)
        XCTFail(message)
        throw JourneyFailure.missingUI
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
