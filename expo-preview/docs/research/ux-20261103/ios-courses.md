# ملحق دورة Swift وXcode الظاهرة في الصورة

قرأت فهرس الدورة ووصف 5 دروس من الناشر ونصوص 3 جلسات Apple. لم أشاهد أو أنسخ الدورة ولم أستخرج نصوص دروس YouTube. القرارات تطبيقات هندسية مقترحة وليست اقتباسات أو ادعاء تنفيذ.

الملاحظات الأولى رُصدت في أساس 0.4.2. قد يتغير الكود بالتوازي أثناء التنفيذ؛ الجدول ليس تقرير اعتماد للإصدار الجديد. على مسؤول الإصدار تحديث حالة القرارات بعد دمج التغييرات واختبارها.

فُحصت ستة ملفات Swift جُلبت من رأس المستودع 93f5adb1c2ee43195e0ceda35d39a9992c11e320: RusukhNativeApp وHomeView وNotesView وLocalAIView وArabicModelView وBackupSettingsView. هذه مراجعة مصدر فقط؛ لم تُشغّل اختبارات Swift أو بناء Mac أو استدلال آيفون في هذا الملحق.

- القائمة المطابقة: https://www.youtube.com/playlist?list=PLQaOY10EEc8bNbEBMyiJU1I-GIgs1LQfj
- الفهرس يعرض 100 درس؛ بعض الدروس تستخدم UIKit وStoryboard وXcode 12–13. نأخذ المبادئ ونراجع API الحالية، ونحافظ على مشروع SwiftUI الموجود.
- لم أحدد رابط الويبينار الثاني يقينًا؛ لم أنسب إليه نصائح.
- هذه 36 قرارًا: تنفيذ موجود، أو تحسين مقترح، أو تحقق جهاز مطلوب. هذا الملحق لم يغيّر كود التطبيق.

## أهم فروق المسارين

- **N01** الإلغاء الأصلي يغلق التعديلات مباشرة، بينما Expo يحمي المسودة؛ أضف حماية dirty واختبر السحب للإغلاق أيضًا. الدليل: `App/NotesView.swift:194`. الحالة: source-confirmed, not repaired by this research.
- **N02** آخر الملاحظات معروضة دون فعل فتح؛ البداية الفارغة تحيل المستخدم لتبويب آخر. الدليل: `App/HomeView.swift:39`. الحالة: source-confirmed, not repaired by this research.
- **N03** إدارة تنزيل النموذج وإلغائه وحذفه موجودة في SwiftUI. لا تدّع أنها موجودة أو مثبتة في Expo؛ النموذجان والمحركان منفصلان. الدليل: `App/ArabicModelView.swift:157`. الحالة: source-confirmed, device inference unverified.
- **N04** التبويبات الأصلية ثابتة؛ تخصيص وحدات Expo لا يعني أن SwiftUI يدعم التخصيص نفسه. الدليل: `App/RusukhNativeApp.swift:21`. الحالة: reviewed files only.

## القرارات القصيرة

- **C001** استمر في SwiftUI ؛ حدّث تدريجيًا. — SwiftUI منفذ ومفحوص بالمصدر؛ نحافظ عليه. [CS07](https://developer.apple.com/videos/play/wwdc2024/10150/)
- **C002** ركّب الواجهة من وحدات صغيرة. — تحسين مقترح فوق تنفيذ موجود. [CS07](https://developer.apple.com/videos/play/wwdc2024/10150/)
- **C003** اجعل التفضيلات ذات مصدر واحد. — تنفيذ موجود؛ حافظ عليه. [CS07](https://developer.apple.com/videos/play/wwdc2024/10150/)
- **C004** حدّث العرض من حالة البيانات. — تنفيذ موجود؛ تحقق عند التوسعة. [CS07](https://developer.apple.com/videos/play/wwdc2024/10150/)
- **C005** استخدم زرًا له اسم وفعل. — تنفيذ موجود؛ اختبار جهاز مطلوب. [CS07](https://developer.apple.com/videos/play/wwdc2024/10150/)
- **C006** استخدم مفتاحًا للإظهار والإخفاء. — تنفيذ موجود؛ قابل للتحسين. [CS07](https://developer.apple.com/videos/play/wwdc2024/10150/)
- **C007** اجعل البحث مرئيًا ومفهومًا. — تحسين مقترح. [CS07](https://developer.apple.com/videos/play/wwdc2024/10150/)
- **C008** راجع المظهرين في كل شاشة. — منفذ؛ تحقق بصري وجهاز مطلوب. [CS07](https://developer.apple.com/videos/play/wwdc2024/10150/)
- **C009** اسمح بتكبير النص دون قص. — منفذ جزئيًا؛ اختبار جهاز مطلوب. [CS07](https://developer.apple.com/videos/play/wwdc2024/10150/)
- **C010** عاين RTL قبل اعتماد التخطيط. — منفذ جزئيًا؛ اختبار جهاز مطلوب. [CS07](https://developer.apple.com/videos/play/wwdc2024/10150/)
- **C011** أعد استخدام الوحدات بهويات ثابتة. — تنفيذ موجود؛ حافظ عليه. [CS07](https://developer.apple.com/videos/play/wwdc2024/10150/)
- **C012** افصل ترتيب الواجهة عن بيانات الدراسة. — تنفيذ موجود؛ وسّع بأمان. [CS07](https://developer.apple.com/videos/play/wwdc2024/10150/)
- **C013** اعكس ترتيب العناصر للعربية. — تحقق مطلوب. [CS08](https://developer.apple.com/videos/play/wwdc2022/10034/)
- **C014** طابق اتجاه الانتقال مع RTL. — مراجعة مقترحة. [CS02](https://www.youtube.com/watch?v=rpIV5hd3Owg)، [CS08](https://developer.apple.com/videos/play/wwdc2022/10034/)
- **C015** اعكس الأيقونة بحسب معناها فقط. — تحقق جهاز مطلوب. [CS08](https://developer.apple.com/videos/play/wwdc2022/10034/)
- **C016** احترم صيغ الأرقام المحلية. — تحسين مقترح. [CS08](https://developer.apple.com/videos/play/wwdc2022/10034/)
- **C017** اختبر العربية مع أسماء إنجليزية. — اختبار مقترح. [CS08](https://developer.apple.com/videos/play/wwdc2022/10034/)
- **C018** لا توسّع تباعد الحروف العربية. — قاعدة محفوظة؛ لا تغيير مطلوب. [CS08](https://developer.apple.com/videos/play/wwdc2022/10034/)
- **C019** اترك ارتفاعًا كافيًا للتشكيل. — منفذ جزئيًا؛ اختبار جهاز مطلوب. [CS08](https://developer.apple.com/videos/play/wwdc2022/10034/)
- **C020** عرّب أسباب طلب الأذونات. — منفذ في إعداد البناء؛ اختبار جهاز مطلوب. [CS05](https://www.youtube.com/watch?v=ZA3_s0of8FY)
- **C021** طابق اسم التطبيق مع لغته. — تنفيذ موجود؛ التثبيت الأصلي غير مثبت. [CS05](https://www.youtube.com/watch?v=ZA3_s0of8FY)
- **C022** اختَر الصور بمنتقي النظام. — منفذ في Expo؛ اختبار جهاز مطلوب. [CS04](https://www.youtube.com/watch?v=8K_o1QGh0SE)
- **C023** اكتب أنواع أخطاء قابلة للمعالجة. — تحسين مقترح. [CS06](https://www.youtube.com/watch?v=IKwhEvDyb1U)
- **C024** اجعل إعادة المحاولة تحفظ المدخلات. — تحسين مقترح. [CS06](https://www.youtube.com/watch?v=IKwhEvDyb1U)
- **C025** افصل الإلغاء عن فشل العملية. — تنفيذ موجود؛ حافظ عليه. [CS06](https://www.youtube.com/watch?v=IKwhEvDyb1U)
- **C026** اختبر التطبيق على آيفون فعلي. — غير منفذ على جهاز المستخدم. [CS03](https://www.youtube.com/watch?v=YPPzOIi51J0)
- **C027** افصل نجاح البناء عن التثبيت. — قاعدة توثيق موجودة. [CS03](https://www.youtube.com/watch?v=YPPzOIi51J0)
- **C028** سمّ التبويبات بحسب المهمة. — تحسين مقترح. [CS09](https://developer.apple.com/videos/play/wwdc2022/10001/)
- **C029** ثبّت التنقل الأساسي. — تحسين مقترح. [CS09](https://developer.apple.com/videos/play/wwdc2022/10001/)
- **C030** اجعل الرجوع يوضح الوجهة. — تحسين مقترح. [CS09](https://developer.apple.com/videos/play/wwdc2022/10001/)
- **C031** خصّص الحوار للمهام المستقلة. — تنفيذ موجود؛ راجع الاستخدام. [CS09](https://developer.apple.com/videos/play/wwdc2022/10001/)
- **C032** اكتب «حفظ» و«إلغاء» بوضوح. — تنفيذ موجود؛ حافظ عليه. [CS09](https://developer.apple.com/videos/play/wwdc2022/10001/)
- **C033** احمِ النص عند ترك التحرير. — Expo يحمي المسودة؛ فجوة إلغاء مثبتة في SwiftUI. [CS09](https://developer.apple.com/videos/play/wwdc2022/10001/)
- **C034** أغلق الحوار الفارغ دون تعطيل. — منفذ للملاحظة؛ تحقق لبقية الحوارات. [CS09](https://developer.apple.com/videos/play/wwdc2022/10001/)
- **C035** قلّل الحوارات المتراكبة. — مراجعة مقترحة. [CS09](https://developer.apple.com/videos/play/wwdc2022/10001/)
- **C036** لا تحشر كل الوظائف فيالرئيسية. — تحسين مقترح. [CS09](https://developer.apple.com/videos/play/wwdc2022/10001/)

## المقارنة واختبار القبول

| القرار | الدليل في Expo | الدليل في SwiftUI | الفحص المطلوب |
|---|---|---|---|
| C001 | ../README.md: المسار الأصلي يستخدم SwiftUI فعلًا؛ مراجعة ستة ملفات من الرأس المذكور. | App/RusukhNativeApp.swift:1: SwiftUI مستورد؛ التطبيق ينشئ RootView ويحقن LibraryStore. | راجع إطار كل شاشة قبل نقل تقنية من دورة UIKit. |
| C002 | src/StudyHome.tsx؛ src/WorkspaceEditor.tsx: مكوّنان منفصلان موجودان. | App/RusukhNativeApp.swift:21: RootView يركّب HomeView وNotesView وReviewView وGraphView وLocalAIView. | كل وحدة تقبل بياناتها وإجراءاتها دون امتلاك قاعدة البيانات. |
| C003 | App.tsx:137؛ src/workspace.ts: saveWorkspace يحفظ قبل setWorkspace ؛ المحرر يحتفظ بمسودة. | App/RusukhNativeApp.swift:5: LibraryStore منشأ مرة عبر StateObject ومشارك عبر environmentObject؛ ليس دليلًا على اكتمال تخصيص الواجهة. | فشل الحفظ يبقي المسودة ولا يغيّر الإعداد المنشور. |
| C004 | App.tsx؛ src/StudyHome.tsx: عدادات وملاحظات الرئيسية تمرّر عبر props. | App/HomeView.swift:21: عدادات الرئيسية مشتقة من library.snapshot وlibrary.due. | إضافة ملاحظة تحدّث القائمة والعداد معًا. |
| C005 | src/ui.tsx:39: Button يحتوي accessibilityRole و Label. | App/NotesView.swift:59: أزرار PDF والإضافة لها accessibilityLabel وaccessibilityIdentifier. | VoiceOver يعلن الاسم والفعل والحالة. |
| C006 | src/WorkspaceEditor.tsx: Switch متصل بـ enabled. | App/HomeView.swift:8: لا يظهر محرر وحدات أو مفاتيح تخصيص في HomeView أو RootView المفحوصين؛ Expo يملكها بالفعل. | إخفاء وحدة لا يزيل بياناتها. |
| C007 | App.tsx؛ src/StudyHome.tsx: الملاحظات تملك بحثًا؛ الرئيسية لا تبرز البحث. | App/NotesView.swift:56: searchable موجود في قائمة الملاحظات الأصلية. | الوصول للبحث من البداية دون فتح التخصيص. |
| C008 | src/ui.tsx؛ App.tsx: light ود ark موجودان؛ لا دليل جهاز لهذه الدفعة. | App/HomeView.swift:36: ألوان النظام مستخدمة، مع بطاقة جلسة سوداء ونص أبيض صراحة؛ يحتاج فحصًا بصريًا. | قارن الحقول والأخطاء والأزرار في المظهرين. |
| C009 | src/ui.tsx:22: Label يسمح FontScaling ؛ الضوابط لها minHeight. | App/HomeView.swift:13: العنوان يستخدم حجمًا ثابتًا 36؛ معظم النصوص الأخرى تستخدم headline/title/footnote. ملاءمة أكبر Dynamic Type غير مثبتة. | أكبر DynamicType يحافظ على النص والإجراءات. |
| C010 | src/ui.tsx:6: arabicRow يعالج RTL المضيف لتجنب القلب مرتين. | App/RusukhNativeApp.swift:11: layoutDirection مضبوط على rightToLeft في جذر التطبيق. | شغّل واجهة عربية داخل مضيف LTR و RTL. |
| C011 | src/workspace.ts؛ src/WorkspaceEditor.tsx: MODULES يحمل id والمحرر يستخدم key=id. | App/NotesView.swift:30: ForEach(results) يستخدم عناصر Identifiable؛ التخصيص الأصلي لم يثبت. | تغيير الترتيب لا يبدّل حالة الوحدة بأخرى. |
| C012 | src/workspace.ts: دوال toggleModule و moveModule تعدّل Workspace فقط. | App/RusukhNativeApp.swift:21: تبويبات أصلية ثابتة؛ لا حالة تخصيص معروضة في الملفين الجذريين المفحوصين. | الترتيب والإخفاء لا يغيّران Note أو StudyCard. |
| C013 | src/ui.tsx؛ App.tsx: arabicRow مستخدم؛ تغطية جميع الصفحات تحتاج تدقيقًا. | App/RusukhNativeApp.swift:11: اتجاه RTL مفروض في البيئة؛ لا يثبت صحة كل أيقونة أو حقل مختلط. | تتبّع القراءة من اليمين عبر الترويسة والأزرار. |
| C014 | App.tsx: Tab-state مخصص؛ الملاحظة Modal. | App/NotesView.swift:28: NavigationStack موجود، لكن فتح الملاحظة يعرض sheet عند السطر67. | الرجوع والتقديم ومؤشر الصفحات تتفق مع ترتيب العربية. |
| C015 | src/ui.tsx:33: SymbolView مستخدم؛ لا تدقيق بصري موثق لكل رمز. | App/NotesView.swift:42: chevron.left ثابت بجانب الصف؛ يجب فحص علاقته بالفعل المودالي واتجاه النظام. | السهم الاتجاهي يتكيف؛ العدسة والوسائط لا تقلب عشوائيًا. |
| C016 | src/StudyHome.tsx:30؛ App.tsx:526: تواريخ ar-SA موجودة؛ بعض العدادات أعداد مباشرة. | App/HomeView.swift:66: العدادات تستخدم interpolation وmonospacedDigit؛ تنسيق locale صريح غير ظاهر هنا. | جرّب٠١٢و 012 والتواريخ دون افتراض أن الجميع يفضّل صيغة واحدة. |
| C017 | src/ui.tsx:22؛ src/ui.tsx:75: writingDirectionrtl عام؛ العناوين قدتضم PDF و YouTube. | App/NotesView.swift:153: TextField وTextEditor أصليان؛ اختبار العربية والروابط الإنجليزية مطلوب. | اسم ملف مختلط يبقى مقروءًا ورابطه صحيحًا. |
| C018 | src/ui.tsx: لم يظهر letterSpacing فيالمكوّن المشترك. | لم يُراجع هذا الجانب في المصادر الستة. | افحص التشكيل والاتصال عند إضافة خط أو نمط. |
| C019 | src/ui.tsx:24: lineHeight يساويتقريبًا 1.5 لـ Label ؛ Field له 23. | App/NotesView.swift:156: TextEditor له minHeight220؛ سلامة التشكيل عند تكبير الخط تحتاج جهازًا. | نص مشكول مع خط كبير لا يفقد الحركات. |
| C020 | app.json: أسباب الكاميرا والصور والميكروفون عربية. | لم يُراجع هذا الجانب في المصادر الستة. | افحص النص الظاهر فعليًا؛ ExpoGo قد يعرض إذن المضيف. |
| C021 | app.json: name يساوي رُسوخ. | لم يُراجع هذا الجانب في المصادر الستة. | تحقق من اسم الأيقونة في بناء SwiftUI الموقّع. |
| C022 | src/media/MediaCapturePanel.tsx؛ package.json: MediaCapturePanel يستدعي launchImageLibraryAsync ويخرج عند result.canceled قبل savePhoto. | App/NotesView.swift:187: المحرر الأصلي المفحوص يستخدم UIImagePickerController للكاميرا؛ لا يظهر PHPicker لمكتبة الصور في هذا الملف. | اختيار صورة ثم الإلغاء لا ينشئ مرفقًا تالفًا. |
| C023 | src/backup/portable.ts؛ App.tsx: بعض catch يعرض String(error)خامًا. | App/ArabicModelView.swift:39: CancellationError يعالج منفصلًا عن الخطأ العام؛ BackupSettingsView يعرض خطأ المعاينة. | فرّق فشل القراءة والمخطط والمساحة برسالة وفعل مناسب. |
| C024 | src/SourcesWorkbench.tsx؛ App.tsx: المصدر يملك message و error وإلغاء؛ يلزم فحص كل خطأ. | App/BackupSettingsView.swift:320: فشل تطبيق الاستيراد يترك المعاينة مفتوحة مع localError؛ يلزم اختبار مسار فعلي. | فشل القراءة أو الاستيراد لا يمسح النص أو المسودة. |
| C025 | src/SourcesWorkbench.tsx:47؛ App.tsx:386: يوجد canceledguard ورسالةإلغاء القراءة. | App/ArabicModelView.swift:40: إلغاء تحميل النموذج له رسالة منفصلة؛ stop يلغي Task. | الإلغاء لا يعرض نجاحًا ولا ينفّذ حفظًا. |
| C026 | ../README.md؛ RELEASE_0.4.2.md: التوثيق يصرّح بعدم إثبات التثبيت والاختبارات الأصلية. | لم يُراجع هذا الجانب في المصادر الستة. | سجّل الجهاز والإصدار وخطوات Files و VoiceOver والصوت. |
| C027 | ../README.md: README يميز IPA غير الموقع والمحاكي عن آيفون. | لم يُراجع هذا الجانب في المصادر الستة. | لا تُحوّل رابط Expo أو CI إلى ادعاء تثبيت SwiftUI. |
| C028 | App.tsx:31؛ src/workspace.ts: التبويبات تتغير حسب أول ثلاث أدوات مثبتة. | App/RusukhNativeApp.swift:21: خمسة تبويبات مسماة: الرئيسية، ملاحظاتي، المراجعة، الشبكة، ذكاء محلي. | ابدأ بدراسة أو ملاحظات أو مصادر؛ لا يحتاج المستخدم فهم البنية الداخلية. |
| C029 | App.tsx:80؛ src/workspace.ts:60: pinnedModules يربط الشريط بترتيب الرئيسية. | App/RusukhNativeApp.swift:21: TabView أصلي ثابت؛ مشكلة اعتماد الشريط على ترتيب الوحدات تخص Expo. | ترتيب بطاقات الرئيسية لا ينقل مواضع التنقل المعتادة. |
| C030 | App.tsx: حوار تحرير ملاحظة؛ ليس NavigationStack في Expo. | App/NotesView.swift:67: تحرير الملاحظة sheet، لذا الرجوع الهرمي بين الملاحظات لا يثبت بهذا الملف. | فتح رابط ملاحظة ثم الرجوع يحفظ السياق والبحث. |
| C031 | App.tsx؛ src/WorkspaceEditor.tsx: التحرير والتخصيص يستخدمان Modal. | App/NotesView.swift:67: إضافة/تحرير الملاحظة في sheet؛ الإعدادات أيضًا sheet من HomeView. | التنقل المتكرر بين الملاحظات لا يتحول لسلسلة حوارات. |
| C032 | src/WorkspaceEditor.tsx: «حفظ مساحتي» و«إلغاء التخصيص» موجودان. | App/NotesView.swift:194: حفظ وإلغاء موجودان كـToolbarItem؛ زر الإلغاء يغلق مباشرة. | الحفظ والإلغاء لهما نتيجتان منفصلتان يمكن التنبؤ بهما. |
| C033 | App.tsx:234؛ App.tsx:294: حوار حماية مسودة ومحرر بطاقة موجود. | App/NotesView.swift:194: فجوة مثبتة بالمصدر: زر إلغاء يستدعي dismiss مباشرة؛ لا guard للتعديلات أو interactiveDismissDisabled ظاهر في NotesView. | الرجوع أو إغلاق الحوار لا يفقد نصًا غير محفوظ. |
| C034 | App.tsx؛ src/WorkspaceEditor.tsx: closeNote يخرج عبر finishDraftClose(false) إذا كانت dirty=false. | App/NotesView.swift:194: المحرر الأصلي يغلق مباشرة سواء فارغًا أو معدلًا؛ يجب حماية المعدل مع إبقاء الفارغ سهل الإغلاق. | فتح محرر ثم إلغاؤه دون تعديل لا يولّد تحذير فقدان زائفًا. |
| C035 | App.tsx؛ src/SourcesWorkbench.tsx: عدة مسارات: محرر وبطاقات ومنتقي ومصدر. | App/NotesView.swift:207: sheet الكاميرا داخل sheet المحرر؛ يحتاج فحص العودة والأذونات. | منتقي الملف يعود للحوار الصحيح ولا يترك طبقة غير قابلة للإغلاق. |
| C036 | src/StudyHome.tsx: كانت بطاقات عدة أدوات تسبق زر ملاحظة جديدة في أساس 0.4.2. | App/HomeView.swift:39: الملاحظات الحديثة VStack دون زر فتح؛ الحالة الفارغة تطلب الانتقال إلى ملاحظاتي، ولا إجراء إنشاء مباشر. | أظهر الإجراء التالي ووزّع التفاصيل؛ التخصيص اختياري. |

## سجل المصادر ومستوى القراءة

- **CS01** [Swift & Xcode | دورة برمجة تطبيقات الايفون باستخدام لغة سويفت](https://www.youtube.com/playlist?list=PLQaOY10EEc8bNbEBMyiJU1I-GIgs1LQfj) — playlist_metadata. تطابق عنوان الصورة؛ عناوين 100 درس ظهرت في فهرس ثانوي؛ لم نشاهد 100 درس ولم نستخرج نصوصها.
- **CS02** [75 - Swift Xcode RTL UIPageViewController With One ViewController](https://www.youtube.com/watch?v=rpIV5hd3Owg) — description. وصف الناشر يشرح اتجاه الصفحات ومؤشراتها من اليمين إلى اليسار وإعادة استخدام واجهة واحدة.
- **CS03** [79 - Swift Xcode Run Your App on Real iPhone](https://www.youtube.com/watch?v=YPPzOIi51J0) — description. وصف الناشر يتناول توصيل آيفون عبر USB أو Wi-Fi وربط حساب Apple مجاني بـ Xcode ؛ ليس إثباتًا لتثبيت رُسوخ.
- **CS04** [82 - Swift Xcode Select Photo Using PHPicker](https://www.youtube.com/watch?v=8K_o1QGh0SE) — description. وصف الناشر يتناول اختيار الصور باستخدام PHPickerViewController.
- **CS05** [84 - Swift Xcode Localize App Name, Permissions & Directions](https://www.youtube.com/watch?v=ZA3_s0of8FY) — description. وصف الناشر يتناول تعريب اسم التطبيق ورسائل الأذونات واتجاه القيود.
- **CS06** [100 - Swift Xcode Error Handling & Throwing Errors | Do, Try, Catch](https://www.youtube.com/watch?v=IKwhEvDyb1U) — description. وصف الناشر يذكر تصنيف الأخطاء باستخدام enum ومعالجتها باستخدام do/try/catch.
- **CS07** [SwiftUI essentials](https://developer.apple.com/videos/play/wwdc2024/10150/) — transcript_and_code. قراءة نصية لبناء الواجهات بالتركيب والحالة والضوابط المتكيفة والتبنّي التدريجي؛ لم تُشاهد صور الفيديو.
- **CS08** [Design for Arabic](https://developer.apple.com/videos/play/wwdc2022/10034/) — transcript. قراءة نصية لاتجاه التخطيط والأيقونات والخطوط والأرقام؛ لم تُشاهد صور الفيديو.
- **CS09** [Explore navigation design for iOS](https://developer.apple.com/videos/play/wwdc2022/10001/) — transcript. قراءة نصية للتبويبات والتنقل الهرمي والمهام المودالية؛ لم تُشاهد صور الفيديو.
- **CS10** [فهرس دورة بامبرمج،100درس](https://www.wikicourses.net/course/swift-and-xcode) — syllabus. للتعرف على الدروس والرابط الأصلي فقط؛ ليس مرجعًا تقنيًا. تظهر فيه UIKit و Storyboard و Xcode12 و 13.
