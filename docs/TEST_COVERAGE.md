# ما اختُبر وما يحتاج جهازًا فعليًا

دليل التنفيذ التفصيلي والالتزامات والروابط في [التقرير](EXECUTION_2026-11-01.md). أسماء الاختبارات أدناه مأخوذة من المصادر؛ نجاح المحرك والتطبيق والواجهة مثبت في Run 18 على `07784236eb9d13fc77092fc8713f4ca31727f666`؛ اختبار الضغط اللاحق شُغّل على Linux منفصلًا. لا تُعد هذه القائمة ادعاء اختبار على هاتف المستخدم.

| المتطلب | الدليل الموجود | البيئة | الفجوة الباقية |
|---|---|---|---|
| حفظ الملاحظات وإعادة فتحها | `testAtomicSaveAndLoad` و`testArabicStudyJourneyAndPersistence` | XCTest Mac وXCUITest Simulator | قتل العملية أثناء الكتابة، امتلاء قرص الهاتف، ملفات أكبر واقعية |
| روابط وشبكة | wikilinks/aliases/self؛ العنوان المكرر يربط كل المطابقات؛ رحلة UI تعرض العلاقات | Mac/Simulator | آلاف العقد ولمس/تكبير وVoiceOver على الهاتف |
| بحث عربي | تشكيل/تطويل ونص ألف ملاحظة؛ بحث فعلي في UI | Mac/Simulator | جودة لغوية أوسع، زمن Release على الهاتف |
| بطاقات واختبارات ومراجعة متباعدة | due/again/good/easy/ease/quiz tests؛ رحلة UI | Mac/Simulator | FSRS-6 للبطاقات الجديدة: مرجع 13 مراجعة ورفض الحالات الناقصة/متعارضة العدادات وتراجع الساعة. اختبار ضغط Linux مستقل: 1000 بطاقة و32000 مراجعة و32 دورة نسخ؛ لم يُرحّل جدول البطاقات القديمة |
| سلامة البيانات وترحيل Expo | roundtrip/atomic/corrupt/oversized/legacy/dangling-reference tests | XCTest Mac | منتقي Files وShare Sheet على الهاتف، توافق نسخ مستخدم فعلية دون تعريضها |
| صوت | 3 اختبارات تخزين و8 منسق و7 متحكم؛ UI لحفظ الصوت وإعادة فتحه وللخلفية أثناء التسجيل والتشغيل | Mac/Simulator | ميكروفون فعلي ومقاطعات/سماعات/إذن نظام على هاتف. Run 18: تحذير AVAudioSession الرئيسي صفر بعد الإصلاح؛ لا قياس hitch للهاتف |
| PDF | 4 اختبارات PDFKit على ملفات PDF حقيقية: نص، ملف تالف/مصوّر، حجم وصفحات | XCTest Mac | PDF عربي متنوع، منتقي النظام؛ OCR غير منفذ |
| كاميرا | دمج UIImagePickerController؛ UI يثبت رسالة عدم توفرها | بناء/Simulator | التقاط فعلي وجودة الصور ورفض/منح الإذن |
| العربية وRTL والوصول | رحلة واجهة عربية، معرفات وأسماء وصول للأزرار | Simulator | تدقيق بصري لجميع الصور الحالية، VoiceOver/Dynamic Type وتباين شامل |
| الخلفية والعودة | home/activate وإعادة launch في رحلة الدراسة وحالة النموذج | Simulator | تعليق/إنهاء فعلي أثناء تنزيل/استدلال وصوت على الهاتف |
| إشعارات | UserNotifications مدمج مع إذن اختياري | بناء | وصول التذكير فعليًا ورفض الإذن وتغير التوقيت |
| أوزان Qwen | 12 ملفًا مثبتًا بالحجم وSHA-256؛ Swift يقبل الصحيح ويرفض التالف والمبتور والمتجاوز | Mac، تنزيل URLSession داخل Simulator | تلف بالحجم نفسه بعد التحقق، انقطاع Wi-Fi منخفض السرعة على الهاتف |
| إلغاء وتنزيل النموذج | `testZModelDownloadCancellationAndIntegrityThroughUI` حذف/إلغاء/إعادة تنزيل حتى ready | Simulator | الإلغاء في كل طور، ولا يثبت الاختبار أن الإلغاء الأول حدث بعد تنزيل جزء كبير من الأوزان |
| استدلال عربي محلي | المحرك الحالي Swift Mac ولّد 8 حالات مع منع الشبكة في Run 18؛ إحدى إجابات التعريف غير دقيقة | Mac Metal | MLX لا يدعم Simulator؛ تشغيل iOS دون شبكة لم يُثبت |
| Apple Foundation Models | مسار حقيقي وفحص availability/locale موجود | بناء | توليد ناجح بالعربية على جهاز/نظام مؤهل لم يُثبت |
| CPU/GPU/ANE والموارد | Mac Metal فعلي، قياسات XCTest وMLX منفصلة | Mac | ANE والبطارية والحرارة وRSS iPhone غير مقاسة |
| التوقيع والتثبيت | IPA غير موقع + تطبيق محاكي + مشروع xtool | Cloud Mac | توقيع Personal Team واقتران هاتف المستخدم غير منفذين |

اختبارات iOS UI الحالية الخمسة في `UITests/RusukhUITests.swift`:

- `testArabicStudyJourneyAndPersistence`
- `testAudioStopsOnBackgroundAndCanRecordAgain`
- `testSimulatorAudioAttachmentSurvivesRelaunch`
- `testSimulatorModelAvailabilityDoesNotStartUnsupportedGPU`
- `testZModelDownloadCancellationAndIntegrityThroughUI`

نجاح اختبار جاهزية النموذج في Simulator يعني الملفات والواجهة فقط. لا يجري استبدال المحرك بإجابة مبرمجة، ولا تُوصف صورة شاشة الذكاء بأنها دليل توليد. راجع [مراجعة الأداء](PERFORMANCE_REVIEW.md) و[خطوة التثبيت](INSTALL_ON_IPHONE.md).

اختبارات RusukhAppTests في Run 18: أربع وحدات LibraryStore تحققت من حفظ/إعادة فتح FSRS، إبقاء البطاقات القديمة، عدم تغيير بايتات المخزن عند استيراد معطوب، وفشل كتابة فعلي دون نشر الملاحظة. سبع وحدات VoiceAttachment تحققت من رفض الإذن والإغلاق والخلفية أثناء التفعيل والتهيئة والنهاية قبل تسليم المشغّل للواجهة. مجموع hosted + UI = 16، صفر فشل وتخطٍ وتحذيرات runtime؛ لا يمثل هذا فحص VoiceOver أو جهاز المستخدم.
