import XCTest
@testable import RusukhNative

@MainActor
final class AppleModelControllerTests: XCTestCase {
    func testEntireAcceptedReferenceReachesGeneratorIncludingFinalFact() async throws {
        var received = ""
        let model = AppleModelController { request, _ in received = request; return "جواب" }
        let gate = LocalInferenceGate()
        let question = String(repeating: "س", count: 1_500)
        let note = String(repeating: "ع", count: 1_994) + " باريس"
        let task = try XCTUnwrap(model.generate(prompt: question, context: note, locale: Locale(identifier: "ar-SA"), gate: gate))
        await task.value
        XCTAssertEqual(received, try LocalModelRequest.make(prompt: question, context: note))
        XCTAssertTrue(received.hasSuffix(" باريس"))
        XCTAssertGreaterThan(received.count, 3_000)
        XCTAssertEqual(model.answer, "جواب")
        XCTAssertFalse(model.busy)
        XCTAssertFalse(gate.busy)
    }

    func testOversizedReferenceNeverAcquiresGateOrCallsGenerator() {
        var calls = 0
        let model = AppleModelController { _, _ in calls += 1; return "غير متوقع" }
        let gate = LocalInferenceGate()
        XCTAssertNil(model.generate(prompt: "السؤال", context: String(repeating: "ع", count: 2_001), locale: .current, gate: gate))
        XCTAssertEqual(calls, 0)
        XCTAssertFalse(gate.busy)
        XCTAssertFalse(model.busy)
        XCTAssertNotNil(model.error)
    }

    func testCancelDiscardsLateSuccessAndHoldsGateUntilGeneratorFinishes() async throws {
        let entered = expectation(description: "Generator entered")
        var completion: CheckedContinuation<String, Never>?
        let model = AppleModelController { _, _ in
            await withCheckedContinuation { continuation in
                completion = continuation
                entered.fulfill()
            }
        }
        let gate = LocalInferenceGate()
        let task = try XCTUnwrap(model.generate(prompt: "السؤال", context: nil, locale: .current, gate: gate))
        await fulfillment(of: [entered], timeout: 3)
        model.stop()
        XCTAssertTrue(gate.busy, "Cancellation must not allow parallel engines before the previous call exits")
        XCTAssertTrue(model.busy)
        XCTAssertNil(model.generate(prompt: "سؤال ثان", context: nil, locale: .current, gate: gate))
        try XCTUnwrap(completion).resume(returning: "نتيجة متأخرة يجب ألا تظهر")
        await task.value
        XCTAssertTrue(model.answer.isEmpty)
        XCTAssertFalse(model.busy)
        XCTAssertFalse(gate.busy)
        XCTAssertNotNil(model.error)
    }

    func testCancelBeforeTaskStartsDoesNotInvokeGenerator() async throws {
        var calls = 0
        let model = AppleModelController { _, _ in calls += 1; return "غير متوقع" }
        let gate = LocalInferenceGate()
        let task = try XCTUnwrap(model.generate(prompt: "السؤال", context: nil, locale: .current, gate: gate))
        model.stop()
        await task.value
        XCTAssertEqual(calls, 0)
        XCTAssertTrue(model.answer.isEmpty)
        XCTAssertFalse(gate.busy)
    }

    func testFailureReleasesGateAndAllowsRetry() async throws {
        var calls = 0
        let model = AppleModelController { _, _ in
            calls += 1
            if calls == 1 { throw CocoaError(.fileReadUnknown) }
            return "نجحت المحاولة الثانية"
        }
        let gate = LocalInferenceGate()
        let first = try XCTUnwrap(model.generate(prompt: "السؤال", context: nil, locale: .current, gate: gate))
        await first.value
        XCTAssertNotNil(model.error)
        XCTAssertFalse(gate.busy)
        let second = try XCTUnwrap(model.generate(prompt: "السؤال", context: nil, locale: .current, gate: gate))
        await second.value
        XCTAssertEqual(calls, 2)
        XCTAssertEqual(model.answer, "نجحت المحاولة الثانية")
        XCTAssertNil(model.error)
        XCTAssertFalse(gate.busy)
    }
}
