import Testing
@testable import RusukhCore

struct MCPToolsTests {
    @Test func statusAndCreateNote() {
        var tools = RusukhMCPTools(snapshot: .empty)
        let status = tools.getAppStatus()
        #expect(status["notes"] as? Int == 0)
        #expect(status["independent"] as? Bool == true)

        let created = tools.createNote(title: "اختبار MCP", body: "هذه ملاحظة تجريبية")
        #expect(created != nil)
        #expect(tools.snapshot.notes.count == 1)

        let listed = tools.listNotes()
        #expect(listed.count == 1)
        #expect(listed[0]["title"] as? String == "اختبار MCP")
    }

    @Test func searchAndGet() {
        var tools = RusukhMCPTools(snapshot: .empty)
        _ = tools.createNote(title: "التعلم النشط", body: "فكرة مهمة عن المراجعة")
        _ = tools.createNote(title: "ملاحظة أخرى", body: "محتوى عادي")

        let results = tools.searchNotes(query: "تعلم")
        #expect(results.count == 1)

        if let id = results[0]["id"] as? String {
            let full = tools.getNote(id: id)
            #expect(full?["title"] as? String == "التعلم النشط")
        }
    }
}
