> تحديث 31 أكتوبر 2026: أُضيف بناء يدوي لنسخة المحاكي ومعاينة PNG وسجلات تحقق.
> ملف المحاكي لا يعمل على iPhone مباشرة، وIPA غير الموقّع يحتاج توقيعًا قبل التثبيت.
> شغّل Workflow من Actions بعد فحص الرصيد المضمّن وحد الإنفاق. لا يوجد تشغيل تلقائي عند كل رفع.

# رُسوخ Native iOS — SwiftUI + الذكاء الاصطناعي المحلي

**نسخة المصدر التجريبية: 31 أكتوبر 2026**. تطبيق iOS أصلي؛ لا يستخدم Expo Go ولا WebView. بُنيت نسختا المحاكي والجهاز على Xcode في GitHub Actions. ملف IPA غير موقّع؛ لم يُثبّت التطبيق ولم يُختبر على هاتف حقيقي.

## ما نُفّذ فعليًا

- تطبيق SwiftUI عربي بخمس شاشات: الرئيسية، الملاحظات، المراجعة، شبكة الأفكار، الذكاء المحلي.
- إنشاء/تحرير/بحث/حذف الملاحظات، والصور من كاميرا iPhone عبر UIKit وSwiftUI.
- ربط الملاحظات بـ `[[عنوان الملاحظة]]`، وشبكة قابلة للسحب والتكبير وفتح العقد.
- بطاقات سؤال/جواب يدوية أو استخراجها من الأسطر `س:`/`ج:` (غير توليدي).
- جدولة مراجعة متباعدة **مبسّطة وليست FSRS**، واختبارات اختيار من متعدد.
- حفظ بيانات محلي عبر JSON بنمط الكتابة الذرّية، وصور JPEG ضمن نفس البيانات؛ واستيراد/تصدير النسخ الاحتياطية مع التحقق منها؛ ودعم استيراد نسخ رُسوخ السابقة المنشأة بـ Expo.
- محرك نص توليدي محلي باستخدام **Apple Foundation Models**، بشرط توفر النموذج واللغة في الجهاز. لا يستخدم خادمًا أو مفتاح API.
- فحص نموذج Apple للغة العربية والإنجليزية؛ استخراج كلمات عربية محليًا باستخدام NaturalLanguage (ميزة **غير توليدية**).
- نقطة دمج مستقبلية لـ Core ML: `MLModelConfiguration.computeUnits = .all`، **لكن لا يوجد نموذج Core ML مخصص مرفق**.
- Workflow جاهز لتجميع ملف **unsigned IPA** على GitHub Actions باستخدام Xcode 27 وXcodeGen.

## الحقيقة المهمة عن العربية

بحسب صفحة Apple الرسمية التي كانت متاحة في 31 أكتوبر 2026، Apple Intelligence لا تسرد العربية بين اللغات المدعومة. لذا **لا يضمن هذا الإصدار توليد نص عربي باستخدام Foundation Models**. التطبيق يفحص `SystemLanguageModel.default.supportsLocale()` على الجهاز؛ لن يختلق دعمًا. إذا كانت العربية غير متاحة، يحتاج التشغيل التوليدي بالعربية دمج MLX Swift مع نموذج متعدد اللغات مثل Qwen مدعوم وملائم للجهاز، وهو **غير منفذ بعد**. توجد خارطة طريق في `docs/MLX_ARABIC_NEXT.md`.

## المتطلبات

- iPhone يعمل بـ iOS 26 أو أحدث، ويفضل جهاز يدعم Apple Intelligence ومُفعّلًا فيه. هذا ليس شرطًا للملاحظات والمراجعة، لكنه شرط لمحرك Apple المحلي.
- GitHub مجاني، لتشغيل Workflow على جهاز Mac سحابي.
- Windows (حتى لو ضعيف نسبيًا) لتثبيت IPA على الهاتف بواسطة Sideloadly، وكابل USB والتطبيقات المساعدة التي يطلبها.
- Apple Account مجاني للتوقيع الشخصي. لا تحتاج Apple Developer Program المدفوع للاختبارات الشخصية التي يسمح بها التوقيع المجاني. تنتهي صلاحية التطبيقات بعد 7 أيام وتحتاج إعادة توقيع.

## إعادة البناء وتنزيل النتائج من الآيفون

المصدر مفكوك بالفعل في المستودع الخاص، بما فيه `.github/workflows/ios-unsigned.yml`. لا تحتاج إنشاء Codespace أو رفع ZIP المصدر مجددًا.

1. افتح **Actions → iOS - SwiftUI build and simulator preview**.
2. تحقق من الرصيد المجاني وحد الإنفاق قبل كل تشغيل، ثم **Run workflow → main → Run workflow**. التشغيل يدوي فقط.
3. افتح التنفيذ المكتمل ثم **Artifacts**:
   - `RusukhNative-simulator`: ملف ZIP يحتوي تطبيق `.app` لمحاكي iOS على Mac.
   - `RusukhNative-unsigned-ipa`: ملف IPA مبني للجهاز لكنه غير موقّع ولا يُثبّت مباشرة.
   - `RusukhNative-build-evidence`: سجلات الاختبارات والبناء وبيئة Xcode ولقطة `simulator-home.png` وبصمات SHA-256.
4. يمكنك فتح لقطة PNG على iPhone لمعاينة الواجهة. هذه معاينة ثابتة لتشغيل حقيقي على محاكي سحابي، وليست تثبيتًا أو جلسة تفاعلية على هاتفك.

مدة الاحتفاظ بمرفقات Actions مضبوطة على **7 أيام**. توقيع التطبيق وتثبيته على iPhone مرحلة منفصلة لم تُنفّذ. لا تضع كلمة مرور Apple أو أي مفاتيح داخل المصدر أو المحادثة.

### معالجة أخطاء البناء

- ملف Workflow ظاهر لكن فشل: افتح **Actions → Test, build and launch SwiftUI → failed step** وانسخ **أول رسالة خطأ**، وليست آخر سطر فقط، ثم أصلح الملف وأعد التشغيل.
- إذا لم يظهر Workflow: تأكد أن `.github/workflows/ios-unsigned.yml` **موجود كملف منفصل بعد فك ZIP**، وليس ZIP فقط.
- إذا فشل بعد XcodeGen: راجع إصدار Xcode؛ يتطلب Framework `FoundationModels` المتوافق مع SDK iOS 26 أو أحدث.
- إذا تعذر تثبيت IPA: تحقق من iOS Developer Mode وكابل USB، وتسجيل الدخول في أداة التوقيع، والحد الأقصى للحساب المجاني (3 تطبيقات مثبتة)، ثم سجل خطأ التثبيت بالضبط.
- عند استيراد نسخة Expo القديمة لا تنحذف البيانات إلا بعد أن ينجح التحقق والحفظ؛ صدّر نسخة من التطبيق الحالي قبل الاستيراد.

## نتيجة البناء الفعلية — 31 أكتوبر 2026

[GitHub Actions: نجاح البناء رقم 2](https://github.com/scrv-1/rusukh-native-ios/actions/runs/41236553179)، المدة **3 دقائق و28 ثانية**، المصدر `d617221376c8ea05b5814d6593292288a01f8710`.

- نجحت اختبارات المنطق الأساسي؛ تضم المجموعة 22 اختبارًا.
- نجح XcodeGen وبناء SwiftUI للمحاكي وللجهاز على Mac سحابي باستخدام Xcode 27.1.
- ثُبّت التطبيق وشُغّل على **المحاكي السحابي**، وأُنشئت لقطة PNG ورُفعت المخرجات الثلاثة.
- أُصلح تعارض اسم حالة الملاحظة `body` مع `View.body`، وأُصلح التقاط الشاشة على محاكي متعدد الشاشات باستخدام `--display=1`.
- لم يُوقّع التطبيق لحساب Apple، ولم يُثبّت على iPhone فعلي، ولم يُختبر أداء الذكاء المحلي أو الكاميرا على جهاز حقيقي.
- يوجد تحذير غير مانع عن إصدارات Node التي تستخدمها Actions v4. لم يمنع نجاح البناء أو الرفع.
- [تفاصيل الأدلة والحدود](docs/VALIDATION.md).

## مصادر رسمية راجعناها 31 أكتوبر 2026

- [Apple Developer Free Personal Team and seven-day provisioning](https://developer.apple.com/help/account/basics/about-your-developer-account)
- [Apple Foundation Models — SystemLanguageModel](https://developer.apple.com/documentation/foundationmodels/systemlanguagemodel)
- [Apple Foundation Models — supported locales](https://developer.apple.com/documentation/foundationmodels/supporting-languages-and-locales-with-foundation-models)
- [Apple Intelligence supported devices and languages](https://support.apple.com/en-mide/121115)
- [Apple Core ML compute units](https://developer.apple.com/documentation/coreml/mlcomputeunits)
- [XcodeGen spec](https://github.com/yonaskolb/XcodeGen/blob/master/Docs/ProjectSpec.md)
- [GitHub standard runners (public repository usage)](https://docs.github.com/en/actions/how-tos/write-workflows/choose-where-workflows-run/choose-the-runner-for-a-job)
- [Sideloadly and Windows installation (third-party)](https://sideloadly.io/)

هذا تطبيق تجريبي مبني من الصفر بـSwiftUI مستفيدًا من فكرة رُسوخ السابقة؛ **لم يتم تعديل المستودع الأصلي تلقائيًا**.
