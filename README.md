> تحديث 31 أكتوبر 2026: أُضيف بناء يدوي لنسخة المحاكي ومعاينة PNG وسجلات تحقق.
> ملف المحاكي لا يعمل على iPhone مباشرة، وIPA غير الموقّع يحتاج توقيعًا قبل التثبيت.
> شغّل Workflow من Actions بعد فحص الرصيد المضمّن وحد الإنفاق. لا يوجد تشغيل تلقائي عند كل رفع.

# رُسوخ Native iOS — SwiftUI + الذكاء الاصطناعي المحلي

**نسخة المصدر التجريبية: 31 أكتوبر 2026**. تطبيق iOS أصلي؛ لا يستخدم Expo Go ولا WebView. ليس ملف IPA جاهزًا للتثبيت، ولم يُبنَ على Xcode أو يُختبر على هاتف حقيقي حتى الآن.

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

## خطوات البناء من الآيفون ثم التثبيت من Windows

> لا ترفع ملف ZIP إلى Expo؛ هذا ليس مشروع Expo. **ولا يكفي رفع ZIP إلى GitHub وتركه هناك دون فكّه**.

1. أنشئ مستودعًا جديدًا على https://github.com/new باسم `rusukh-native-ios` (اختر **Private** لحفظ الكود، أو Public لتشغيل GitHub Actions القياسية مجانًا دون احتساب دقائق الاستخدام وفق سياسة GitHub الحالية)، واضغط إنشاء README.
2. حمّل ملف ZIP المرفق إلى iPhone Files، ثم اذهب لمستودعك: **Add file → Upload files** وارفع ملف الـZIP والتزم بالتغييرات (**Commit changes**).
3. في GitHub اضغط **Code → Codespaces → Create codespace** وافتح Terminal. الصق الأمر التالي، واضبط اسم ZIP إذا غيّرته:

   ```bash
   unzip -oq RusukhNative-free-ios-2026-10-31.zip && rm RusukhNative-free-ios-2026-10-31.zip && git add -A && git commit -m "Add Rusukh native iOS app" && git push
   ```

4. افتح **Actions** في المستودع، ثم **iOS - SwiftUI unsigned IPA** واضغط **Run workflow**. بعد النجاح افتح نتيجة التنفيذ ثم **Artifacts → RusukhNative-unsigned-ipa**. فك ZIP الناتج لتجد `RusukhNative-unsigned.ipa`.
5. من Windows: نزّل https://sideloadly.io/ من الموقع الرسمي، وصِل آيفونك عبر USB وافتح Sideloadly، واسحب ملف IPA، وسجّل حساب Apple **داخل الأداة على جهازك فقط**، ثم اختر Install.
6. إذا طلب iOS: افتح **الإعدادات → الخصوصية والأمان → وضع المطور**، ثم اذهب إلى **عام → VPN وإدارة الجهاز** للوثوق بملف التطوير إن ظهر. قد تتغير عبارات القوائم بحسب إصدار iOS.
7. افتح تطبيق **رُسوخ** من الشاشة الرئيسية: هذا تطبيق أصلي يعمل بمعالج الجهاز. جرب الكاميرا والملاحظات ثم من تبويب الذكاء المحلي راقب توفر النموذج واللغة.

عندما ينتهي توقيع Apple المجاني بعد **7 أيام**، أعد التوقيع بنفس حساب Apple ونفس Bundle ID، واحتفظ بنسخة احتياطية قبل أي إعادة تثبيت. Sideloadly يدعم التجديد التلقائي عندما يكون Windows متاحًا مع إعدادات الاتصال المناسبة، لكنه ليس مضمونًا 24/7.

### معالجة أخطاء البناء

- ملف Workflow ظاهر لكن فشل: افتح **Actions → build-ipa → failed step** وانسخ **أول رسالة خطأ**، وليست آخر سطر فقط، ثم أصلح الملف وأعد التشغيل.
- إذا لم يظهر Workflow: تأكد أن `.github/workflows/ios-unsigned.yml` **موجود كملف منفصل بعد فك ZIP**، وليس ZIP فقط.
- إذا فشل بعد XcodeGen: راجع إصدار Xcode؛ يتطلب Framework `FoundationModels` المتوافق مع SDK iOS 26 أو أحدث.
- إذا تعذر تثبيت IPA: تحقق من iOS Developer Mode وكابل USB، وتسجيل الدخول في أداة التوقيع، والحد الأقصى للحساب المجاني (3 تطبيقات مثبتة)، ثم سجل خطأ التثبيت بالضبط.
- عند استيراد نسخة Expo القديمة لا تنحذف البيانات إلا بعد أن ينجح التحقق والحفظ؛ صدّر نسخة من التطبيق الحالي قبل الاستيراد.

## الاختبارات المنفذة في البيئة الحالية

- `swift test`: **22 اختبارًا ناجحًا** للمنطق الأساسي وقاعدة الحفظ والترحيل من Expo.
- `swiftc -frontend -parse App/*.swift`: فحص صياغة ملفات SwiftUI فقط.
- **لم تُنفّذ**: ترجمة Xcode كاملة، GitHub Actions في حساب المستخدم، تجربة IPA موقّع، قياس Neural Engine/GPU أو التشغيل على iPhone. لا تدعِ نجاحها قبل إثباته.

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

## مشروع xtool

أُضيف مسار بناء لنفس التطبيق: `bash scripts/build-xtool.sh`.
راجع [التوثيق والحدود](docs/XTOOL.md). مخرج xtool غير موقّع؛ لا يعني نجاح البناء تثبيت التطبيق على iPhone.
