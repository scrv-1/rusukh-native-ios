# رُسوخ مع xtool

مسار إضافي لنفس ملفات SwiftUI وRusukhCore. يظل مشروع XcodeGen واختبار `swift test` كما هو. هذا ليس مشروع Expo ولا WebView. اعتماديات MLX التجريبية مثبتة في XcodeGen فقط؛ بناء xtool الحالي يحافظ على وظائف الدراسة والوسائط ومحرك Apple، ويعرض رسالة واضحة بعدم توفر محرك Qwen في هذه النسخة. لتنفيذ Qwen استخدم IPA الناتج من Xcode.

```bash
bash scripts/build-xtool.sh
```

أو `RUSUKH_XTOOL=1 xtool dev build --configuration release --ipa`.
المخرج `xtool/RusukhNative.ipa` غير موقّع. لا يسجل السكربت الدخول ولا يثبّت التطبيق على هاتف. المتغير يختار منتج التطبيق بدل مكتبة الاختبارات المحمولة؛ لا توجد نسخة ثانية من شيفرة التطبيق.

المتطلبات حسب وثائق xtool 1.24.0: على Mac يلزم Xcode وiOS SDK؛ على Linux يلزم Swift 6.4 وSDK مستخرج من Xcode 27.1.xip الذي ينزّل من Apple بعد تسجيل الدخول وقبول الترخيص. SDK وأدوات Apple ليست ضمن حزمة المصدر.

اختُبر تشغيل AppImage الرسمي 1.24.0 داخل Work بعد فكّه بسبب عدم وجود FUSE. بصمته SHA-256 طابقت إصدار GitHub: `dbfd9d7216f077c84c171b688c4173c37c23ca76bf7fd185d1a9ae8a53dab59f`. لم يتوفر Darwin SDK أو USB للجهاز في Work. طبع Swift 6.2.1 الرسمي الموقّع إصداره، لكن محاولة اختبارات Linux تعطلت بإشارة 4؛ ليست نتيجة ناجحة. هذه الأدوات المحلية لم تبقَ بعد استئناف الجلسة، لذلك لا تعتمد عليها الحزمة.

يثبت Workflow بناء xtool على Mac باستخدام ملف إصدار وبصمة ثابتين. راجع نتيجة التشغيل المرتبطة بالتزام المصدر، فوجود إعداد البناء ليس دليل نجاح.

التثبيت مرحلة أخرى: يحتاج اتصالًا موثوقًا بالجهاز وتوقيعًا صالحًا. يوفر xtool مسار Apple Account مجانيًا يعتمد على واجهات Apple الخاصة وفق توثيقه؛ ليس أداة Apple الرسمية. لا تضع كلمة مرور أو رمز تحقق أو ملف pairing في المستودع أو المحادثة. Work لا يملك اتصال USB بآيفون المستخدم.

[xtool](https://github.com/xtool-org/xtool) · [متطلبات Linux](https://github.com/xtool-org/xtool/blob/main/Documentation/xtool.docc/Installation-Linux.md) · [متطلبات macOS](https://github.com/xtool-org/xtool/blob/main/Documentation/xtool.docc/Installation-macOS.md)
