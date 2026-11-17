# رُسوخ (Rusukh)

تطبيق iOS أصلي بـSwift وSwiftUI للتعلّم بالعربية: ملاحظات محلية، روابط بين الأفكار، وبطاقات مراجعة متباعدة بخوارزمية FSRS-6، دون خادم أو حساب.

> **الحالة:** مشروع تجريبي يصونه شخص واحد ([@scrv-1](https://github.com/scrv-1)). لم يُثبت تشغيله على آيفون حقيقي بعد؛ كل الاختبارات الحالية على Mac وiOS Simulator في GitHub Actions. لا يوجد إصدار على App Store.
>
> **الترخيص:** لا يوجد ملف `LICENSE` بعد، لذلك لا يمنح المستودع حاليًا أي ترخيص استخدام أو تعديل. اختيار الترخيص قرار المالك ([التفاصيل](CONTRIBUTING.md#الترخيص)).

[English summary below](#english).

## ماذا يفعل

| الوظيفة | الحالة | المصدر |
|---|---|---|
| ملاحظات عربية RTL مع بحث يتجاهل التشكيل والتطويل | يعمل في المحاكي | `Sources/RusukhCore/StudyEngine.swift` |
| روابط `[[عنوان الملاحظة]]` وشبكة أفكار تفاعلية | يعمل في المحاكي | `StudyEngine.graphEdges`، `App/GraphView.swift` |
| بطاقات من أسطر `س:` و`ج:` أو يدويًا، ومراجعة FSRS-6 | البطاقات الجديدة فقط؛ القديمة تبقى على المجدول السابق | `Sources/RusukhCore/ReviewScheduler.swift` |
| اختبار اختيار من متعدد من البطاقات | يعمل في المحاكي | `StudyEngine.quiz` |
| حفظ JSON ذري محلي، تصدير واستيراد، وترحيل نسخ Expo القديمة | مختبر بوحدات XCTest | `StudyRepository.swift`، `LegacyExpoMigration.swift` |
| صورة من الكاميرا، تسجيل صوتي حتى 180 ثانية، استخراج نص PDF | الكاميرا والميكروفون لم يُختبرا على هاتف | `App/NotesView.swift`، `App/VoiceAttachment.swift`، `PDFTextImport.swift` |
| تذكير مراجعة يومي محلي | الإشعار الفعلي لم يُختبر على هاتف | `App/ReviewReminderView.swift` |
| ذكاء محلي اختياري: Apple Foundation Models، وQwen3-4B عبر MLX | الاستدلال مثبت على Mac فقط؛ MLX لا يعمل في المحاكي | `App/ArabicModel*.swift`، [docs/MLX_ARABIC_NEXT.md](docs/MLX_ARABIC_NEXT.md) |

ما **لا** يفعله: لا مزامنة سحابية، لا حسابات، لا تحليلات أو تتبّع (`App/PrivacyInfo.xcprivacy`)، ولا OCR للصفحات المصوّرة.

## البناء والاختبار

المتطلبات: Mac مع Xcode يدعم iOS 26 SDK، و[XcodeGen](https://github.com/yonaskolb/XcodeGen).

```bash
swift test                          # اختبارات المنطق الأساسي (RusukhCore)
xcodegen generate --spec project.yml
open RusukhNative.xcodeproj         # المخطط RusukhNative: التطبيق واختبارات التطبيق والواجهة
```

اختبارات `RusukhCore` تعمل أيضًا على Linux: على Swift 6.4.2 نجح 53 اختبارًا من أصل 58، والخمسة الباقية (4 لـPDFKit و1 خاص بـmacOS) لا تُبنى خارج أنظمة Apple. بدون Mac يمكنك بناء كل شيء عبر GitHub Actions: workflow **iOS - SwiftUI build and simulator preview** يشغّل الاختبارات ويبني تطبيق المحاكي وIPA غير موقّع ويحفظ الأدلة كـArtifacts لمدة 7 أيام.

## التثبيت على آيفون بحساب Apple مجاني

الـIPA غير موقّع ويحتاج توقيعًا شخصيًا عبر SideStore أو iloader، وصلاحيته 7 أيام ثم يُجدَّد. اسم الحزمة `CFBundleDisplayName` نصّه ASCII `Rusukh` لأن SideStore يرفض الاسم العربي عند إنشاء App ID، والاسم العربي «رُسوخ» يظهر على الشاشة الرئيسية عبر `App/ar.lproj/InfoPlist.strings`. الخطوات والمقارنة في [docs/INSTALL_ON_IPHONE.md](docs/INSTALL_ON_IPHONE.md).

## الوثائق

- [ARCHITECTURE.md](ARCHITECTURE.md): الوحدات وتدفق البيانات والقرارات.
- [CONTRIBUTING.md](CONTRIBUTING.md): كيف تساهم وتختبر.
- [SECURITY.md](SECURITY.md): الإبلاغ عن الثغرات ونموذج البيانات.
- [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md): تراخيص المكتبات المستخدمة.
- [docs/TEST_COVERAGE.md](docs/TEST_COVERAGE.md): ما اختُبر وأين، وما ينقصه جهاز حقيقي.
- [docs/FSRS_INTEGRATION.md](docs/FSRS_INTEGRATION.md) و[docs/OPEN_SOURCE_MAP.md](docs/OPEN_SOURCE_MAP.md).
- سجلات التنفيذ التاريخية في `docs/` (مثل `EXECUTION_2026-11-01.md`) توثّق لحظتها، وأرقامها ليست بالضرورة الحالية.

---

## English

**Rusukh** is a native SwiftUI iOS app for studying in Arabic: local notes with `[[wiki links]]` and a graph view, flashcards scheduled with [FSRS-6](https://github.com/open-spaced-repetition/swift-fsrs), JSON backup/restore, camera/voice/PDF attachments, and optional on-device AI (Apple Foundation Models, Qwen3-4B via MLX). No server, no account, no analytics.

Status: early, single-maintainer project. Tested only on macOS and iOS Simulator in CI; not yet verified on a physical iPhone. **No license has been chosen yet**, so no reuse rights are granted at the moment.

Build: `swift test` for the core library (53 of 58 tests also run on Linux with Swift 6.4.2; the other 5 need PDFKit or macOS and are compiled out), then `xcodegen generate --spec project.yml` and open `RusukhNative.xcodeproj` (iOS 26 SDK). See [CONTRIBUTING.md](CONTRIBUTING.md) and [ARCHITECTURE.md](ARCHITECTURE.md).
