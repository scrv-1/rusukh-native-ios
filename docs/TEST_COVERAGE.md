# ما اختُبر وما يحتاج جهازًا فعليًا

دليل التنفيذ التفصيلي والالتزامات والروابط في [التقرير](EXECUTION_2026-11-01.md). أسماء الاختبارات أدناه مأخوذة من المصادر؛ نجاحها الحالي مثبت في سجلات Run 15 على `4ad47e97401996ea451d527e675e7eff7046c722`. لا تُعد هذه القائمة ادعاء اختبار على هاتف المستخدم.

| المتطلب | الدليل الموجود | البيئة | الفجوة الباقية |
|---|---|---|---|
| حفظ الملاحظات وإعادة فتحها | `testAtomicSaveAndLoad` و`testArabicStudyJourneyAndPersistence` | XCTest Mac وXCUITest Simulator | قتل العملية أثناء الكتابة، امتلاء قرص الهاتف، ملفات أكبر واقعية |
| روابط وشبكة | wikilinks/aliases/self/ambiguous tests؛ رحلة UI تعرض العلاقات | Mac/Simulator | آلاف العقد ولمس/تكبير وVoiceOver على الهاتف |
| بحث عربي | تشكيل/تطويل ونص ألف ملاحظة؛ بحث فعلي في UI | Mac/Simulator | جودة لغوية أوسع، زمن Release على الهاتف |
| بطاقات واختبارات ومراجعة متباعدة | due/again/good/easy/ease/quiz tests؛ رحلة UI | Mac/Simulator | مناطق زمنية وتغير الساعة وتجربة استخدام طويلة؛ الخوارزمية مبسطة وليست FSRS |
| سلامة البيانات وترحيل Expo | roundtrip/atomic/corrupt/oversized/legacy/dangling-reference tests | XCTest Mac | منتقي Files وShare Sheet على الهاتف، توافق نسخ مستخدم فعلية دون تعريضها |
| صوت | 3 اختبارات تخزين؛ تسجيل 3 ثوانٍ وحفظ وإعادة فتح وتشغيل عبر UI | Mac/Simulator | ميكروفون فعلي، مقاطعات/سماعات/سماح ورفض الإذن، تحذير setActive الرئيسي |
| PDF | 4 اختبارات PDFKit على ملفات PDF حقيقية: نص، ملف تالف/مصوّر، حجم وصفحات | XCTest Mac | PDF عربي متنوع، منتقي النظام؛ OCR غير منفذ |
| كاميرا | دمج UIImagePickerController؛ UI يثبت رسالة عدم توفرها | بناء/Simulator | التقاط فعلي وجودة الصور ورفض/منح الإذن |
| العربية وRTL والوصول | رحلة واجهة عربية، معرفات وأسماء وصول للأزرار | Simulator | تدقيق بصري لجميع الصور الحالية، VoiceOver/Dynamic Type وتباين شامل |
| الخلفية والعودة | home/activate وإعادة launch في رحلة الدراسة وحالة النموذج | Simulator | تعليق/إنهاء فعلي أثناء تنزيل/استدلال وصوت على الهاتف |
| إشعارات | UserNotifications مدمج مع إذن اختياري | بناء | وصول التذكير فعليًا ورفض الإذن وتغير التوقيت |
| أوزان Qwen | 12 ملفًا مثبتًا بالحجم وSHA-256؛ Swift يقبل الصحيح ويرفض التالف والمبتور والمتجاوز | Mac، تنزيل URLSession داخل Simulator | تلف بالحجم نفسه بعد التحقق، انقطاع Wi-Fi منخفض السرعة على الهاتف |
| إلغاء وتنزيل النموذج | `testZModelDownloadCancellationAndIntegrityThroughUI` حذف/إلغاء/إعادة تنزيل حتى ready | Simulator | الإلغاء في كل طور، ولا يثبت الاختبار أن الإلغاء الأول حدث بعد تنزيل جزء كبير من الأوزان |
| استدلال عربي محلي | المحرك الحالي Swift Mac ولّد 8 حالات مع منع الشبكة في Run 15 | Mac Metal | MLX لا يدعم Simulator؛ تشغيل iOS دون شبكة لم يُثبت |
| Apple Foundation Models | مسار حقيقي وفحص availability/locale موجود | بناء | توليد ناجح بالعربية على جهاز/نظام مؤهل لم يُثبت |
| CPU/GPU/ANE والموارد | Mac Metal فعلي، قياسات XCTest وMLX منفصلة | Mac | ANE والبطارية والحرارة وRSS iPhone غير مقاسة |
| التوقيع والتثبيت | IPA غير موقع + تطبيق محاكي + مشروع xtool | Cloud Mac | توقيع Personal Team واقتران هاتف المستخدم غير منفذين |

اختبارات iOS UI الحالية الأربعة في `UITests/RusukhUITests.swift`:

- `testArabicStudyJourneyAndPersistence`
- `testSimulatorAudioAttachmentSurvivesRelaunch`
- `testSimulatorModelAvailabilityDoesNotStartUnsupportedGPU`
- `testZModelDownloadCancellationAndIntegrityThroughUI`

نجاح اختبار جاهزية النموذج في Simulator يعني الملفات والواجهة فقط. لا يجري استبدال المحرك بإجابة مبرمجة، ولا تُوصف صورة شاشة الذكاء بأنها دليل توليد. راجع [مراجعة الأداء](PERFORMANCE_REVIEW.md) و[خطوة التثبيت](INSTALL_ON_IPHONE.md).
