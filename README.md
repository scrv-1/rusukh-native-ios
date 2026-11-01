# رُسوخ — تطبيق iOS أصلي

مشروع Swift وSwiftUI عربي، محفوظ في المستودع الخاص الموجود. آخر نسخة تطبيق مختبرة هي `0a37b6501bb5cb6c543a0d7cde2b79d7b114ddcc` في [Run 5](https://github.com/scrv-1/rusukh-native-ios/actions/runs/41253079839)، ودُمجت عبر [PR #2](https://github.com/scrv-1/rusukh-native-ios/pull/2). نجحت 37 وحدة اختبار ورحلتا واجهة، وبناء المحاكي وIPA غير موقع عبر Xcode وxtool. **لم يُثبت التطبيق على آيفون حقيقي؛ المهمة النهائية غير مكتملة.**

## الوظائف الحالية

- واجهة عربية واتجاه RTL، وملاحظات محلية مع بحث يتجاهل التشكيل والتطويل.
- روابط `[[عنوان الملاحظة]]` وشبكة تفاعلية، وبطاقات واختبارات ومراجعة متباعدة مبسطة وليست FSRS.
- حفظ JSON ذري محدود الحجم، واستيراد وتصدير النسخ الاحتياطية وترحيل نسخ Expo القديمة.
- كاميرا أصلية، ومرفق صوت AAC حتى 180 ثانية و2MB، واستيراد نص PDF حتى 20MB و100 صفحة. PDF المصور يحتاج OCR غير مضاف بعد.
- تذكير يومي محلي باختيار المستخدم وإذن النظام. لا تشغيل مستمر في الخلفية.
- استدعاء Apple Foundation Models عند توفر الجهاز والنموذج واللغة. فحص العربية يتم عبر supportsLocale؛ لا دعم عربي مزعوم. استخراج الكلمات بـNaturalLanguage غير توليدي.

## حدود التحقق

اختُبر تسجيل المحاكي وحفظه وإعادة تشغيله، واستخراج PDF الحقيقي، والبحث والربط والمراجعة والخلفية وإعادة فتح البيانات. لم تختبر كاميرا/ميكروفون هاتف حقيقي أو وصول الإشعارات أو VoiceOver كاملًا أو استهلاك بطارية وحرارة الهاتف.

تجارب Qwen المحلية في Actions تشغّل Python MLX على Mac Metal GPU مع منع الشبكة أثناء الاستدلال. **هذه ليست دمج MLX Swift داخل التطبيق**؛ نجاح تنفيذها لا يعني صحة الإجابات. توجد الأخطاء والمقاييس والبصمات في [تقرير التنفيذ](docs/EXECUTION_2026-11-01.md). لا نموذج Core ML مخصص مرفق ولا API سحابي مستخدم.

## البناء والمخرجات

لا تنشئ مستودعًا جديدًا ولا تحول المشروع إلى Expo. استخدم هذا المستودع والفروع الموجودة:

1. راجع رصيد Actions وحد الإنفاق؛ لا تفعّل إنفاقًا إضافيًا. البناء يدوي فقط.
2. افتح Actions → **iOS - SwiftUI build and simulator preview** → Run workflow، واختر الفرع المراد التحقق منه. اترك خيار تقييم النموذج معطّلًا لبناء iOS.
3. تحت Run الناتج نزّل Artifacts بحسابك المخوّل للمستودع الخاص. الأدلة تضم السجلات والصور وxcresult وبصمات SHA-256. مدة الاحتفاظ 7 أيام.

مخرجات [Run 5](https://github.com/scrv-1/rusukh-native-ios/actions/runs/41253079839):

- [مشروع xtool](https://github.com/scrv-1/rusukh-native-ios/actions/runs/41253079839/artifacts/13061982316)
- [IPA Xcode غير موقع](https://github.com/scrv-1/rusukh-native-ios/actions/runs/41253079839/artifacts/13061817670)
- [IPA xtool غير موقع](https://github.com/scrv-1/rusukh-native-ios/actions/runs/41253079839/artifacts/13061937424)
- [تطبيق المحاكي](https://github.com/scrv-1/rusukh-native-ios/actions/runs/41253079839/artifacts/13062062102)
- [الأدلة والصور](https://github.com/scrv-1/rusukh-native-ios/actions/runs/41253079839/artifacts/13061742883)

على Mac مزود بـXcode المناسب: `swift test`، ثم `xcodegen generate --spec project.yml`، ثم افتح RusukhNative.xcodeproj. [مسار xtool](docs/XTOOL.md) يستخدم نفس المصادر. لا ترفع كلمات مرور أو مفاتيح توقيع إلى المستودع.

## التثبيت الشخصي المجاني

IPA غير الموقع يحتاج توقيعًا شخصيًا قبل التثبيت، وملف المحاكي لا يعمل على iPhone. Personal Team المجاني أو أدوات التثبيت الشخصية الموثقة تحتاج اتصالًا واقترانًا أوليًا بكمبيوتر موثوق. CI الحالي بلا اتصال بهاتف المستخدم؛ لا يوجد مسار مثبت من الآيفون وحده هنا. اشتراك ChatGPT لا يوفر عضوية Apple Developer أو شهادة توقيع.

راجع [Apple Personal Team](https://developer.apple.com/help/account/basics/about-your-developer-account) و[SideStore](https://docs.sidestore.io/docs/installation/install) و[Sideloadly](https://sideloadly.io/). يدخل المستخدم بيانات Apple داخل الواجهة الآمنة للأداة فقط. التوقيع المجاني محدود عادة بسبعة أيام، وتُحفظ نسخة احتياطية قبل إعادة التثبيت.
