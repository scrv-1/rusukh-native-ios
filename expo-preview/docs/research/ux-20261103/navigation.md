# بحث التنقل والاكتشاف في رسوخ

التاريخ: 2026-11-03 — Asia/Riyadh.

35 نصيحة (T001–T035)، و17 رابط فيديو يوتيوب فريدًا (V001–V017)، و21 صفحة مصدر مقروءة. نطاق هذا الجزء: التنقل، اكتشاف الأدوات، الحالات الفارغة، التهيئة، البحث، وسير تدوين الملاحظات.

هذه خلاصة أدلة من أفراد المجتمع، وممارسين، وأبحاث أصلية، ووثائق رسمية؛ ليست كلها إجماعًا مجتمعيًا أو نتائج تجربة على رسوخ. التطبيقات والاختبارات استنتاجات تصميمية. لم تُشاهد الفيديوهات ولم تُقرأ نصوص تفريغها؛ الوصول إليها كان عبر بيانات البحث ووصف الناشر المفهرس، ولذلك تحمل جميعها `search_metadata`.

الأولوية المقترحة: بداية جاهزة بلا إعداد إلزامي، إنشاء وبحث ظاهران، حالات فارغة تقود لفعل مباشر، ثم حفظ سياق العودة وموضع القراءة. فُحصت App.tsx وStudyHome.tsx وقت البحث لربط الاقتراحات بالمنتج؛ التطبيق والتحقق النهائي يحددهما سجل الإصدار لدى الفريق.

## النصائح والأدلة

### T001 — الوجهات اليومية ظاهرة

- الدليل: وجدت دراسة NN/G أن التنقل المخفي أقل اكتشافًا من التنقل الظاهر جزئيًا على الهاتف.
- التحقق والحدود: حقيقة بحثية ضمن مواقع الدراسة؛ التطبيق على رسوخ استنتاج يحتاج اختبارًا.
- التطبيق المقترح: احتفظ بوجهات يومية مستقرة في الشريط، مع مدخل واضح لكل الأدوات.
- الاختبار: اطلب فتح الملاحظات والمصادر دون شرح؛ سجّل النجاح والزمن.
- المصدر: [Hamburger Menus and Hidden Navigation Hurt UX Metrics](https://www.nngroup.com/articles/hamburger-menus/) — original_research. مرجع البحث: `turn6view4`.

### T002 — مساحة المحتوى قبل زخرفة التنقل

- الدليل: توصي المقالة بموازنة اكتشاف التنقل مع مساحة المحتوى المحدودة على الهاتف.
- التحقق والحدود: إرشاد منشور؛ حجم الاختصار المقترح استنتاج.
- التطبيق المقترح: اختصر مقدمة الرئيسية كي تظهر مهمة مفيدة قبل التمرير.
- الاختبار: افتح الرئيسية على آيفون صغير وحدد هل تظهر بداية مهمة فعلية.
- المصدر: [Basic Patterns for Mobile Navigation](https://www.nngroup.com/articles/mobile-navigation-patterns/) — practitioner_article. مرجع البحث: `turn6view7`.

### T003 — أسماء ظاهرة للأدوات

- الدليل: توضح دراسة الأيقونات أن الرمز قد يُفهم بصريًا دون فهم وظيفته؛ النص يزيل الغموض.
- التحقق والحدود: حقيقة من بحث قابلية الاستخدام؛ صياغة أسماء رسوخ استنتاج.
- التطبيق المقترح: أبق أسماء عربية ظاهرة بجانب أيقونات الشبكة والمصادر والتخصيص.
- الاختبار: اطلب توقع وظيفة كل أداة قبل لمسها.
- المصدر: [Icon Usability](https://www.nngroup.com/articles/icon-usability/) — original_research. مرجع البحث: `turn57view4`.

### T004 — لا تجعل الإيماءة الطريق الوحيد

- الدليل: أفاد مستخدمان أنهما لم يكتشفا قائمة الملاحظة التي تتطلب ضغطًا مطولًا.
- التحقق والحدود: شهادة أفراد عن نسخة قديمة، وليست حكمًا على النسخة الحالية؛ التطبيق استنتاج.
- التطبيق المقترح: وفّر زرًا ظاهرًا لكل وظيفة أساسية، ثم اجعل الإيماءات اختصارات إضافية.
- الاختبار: نفّذ فتح قائمة الملاحظة دون تجربة ضغط مطول عشوائي.
- المصدر: [[Feature] Mobile navigation guide](https://forum.obsidian.md/t/feature-mobile-navigation-guide/30295) — community_first_person. مرجع البحث: `turn6view1`.

### T005 — ابدأ بإعداد جاهز

- الدليل: تحذر المقالة من مطالبة المستخدم بتخصيص المظهر قبل أن يفهم التطبيق وتوصي بتأجيله.
- التحقق والحدود: التوصية الأصلية تخص التخصيص؛ تعميمها على ترتيب أدوات رسوخ استنتاج.
- التطبيق المقترح: اعرض ترتيبًا افتراضيًا صالحًا فورًا واجعل تخصيص المساحة خيارًا لاحقًا.
- الاختبار: على تثبيت جديد احفظ ملاحظة دون المرور بإعداد ترتيب الأدوات.
- المصدر: [Mobile-App Onboarding: An Analysis of Components and Techniques](https://www.nngroup.com/articles/mobile-app-onboarding/) — original_research. مرجع البحث: `turn36view0`.

### T006 — تعليم عند الحاجة

- الدليل: توصي المقالة بتلميحات مرتبطة بالسياق بدل تحميل الذاكرة بشرح مسبق طويل.
- التحقق والحدود: إرشاد بحثي منشور؛ موضع التلميح المقترح استنتاج.
- التطبيق المقترح: اشرح ربط ملاحظة عند أول محاولة ربط، لا عند أول تشغيل.
- الاختبار: اطلب ربط فكرتين وسجّل فهم التلميح دون رجوع لدليل.
- المصدر: [Mobile-App Onboarding: An Analysis of Components and Techniques](https://www.nngroup.com/articles/mobile-app-onboarding/) — original_research. مرجع البحث: `turn36view0`.

### T007 — اختبر دون جولة إجبارية

- الدليل: تنصح المقالة باختبار التطبيق بلا تهيئة قبل الاستثمار في شاشات تعليم منفصلة.
- التحقق والحدود: إرشاد منشور؛ لا توجد نتيجة تجربة رسوخ حتى الآن.
- التطبيق المقترح: افتح الرئيسية مباشرة، واجعل البدء والدليل قابلين للتجاوز والعودة.
- الاختبار: قارن إتمام أول ملاحظة مع نسخة بلا جولة ونسخة بجولة اختيارية.
- المصدر: [Mobile-App Onboarding: An Analysis of Components and Techniques](https://www.nngroup.com/articles/mobile-app-onboarding/) — original_research. مرجع البحث: `turn36view0`.

### T008 — اشرح سبب الفراغ

- الدليل: تفرق المقالة بين محتوى غير موجود، معالجة جارية، وحالة ناتجة عن تصفية.
- التحقق والحدود: إرشاد منشور؛ نصوص رسوخ استنتاج.
- التطبيق المقترح: اعرض نصًا خاصًا لكل حالة: لا ملاحظات، لا نتائج، جار التحميل.
- الاختبار: تحقق بصريًا من الحالات الثلاث ولا يظهر لا ملاحظات أثناء التحميل.
- المصدر: [Designing Empty States in Complex Applications: 3 Guidelines](https://www.nngroup.com/articles/empty-state-interface-design/) — practitioner_article. مرجع البحث: `turn36view1`.

### T009 — زر البدء داخل الحالة الفارغة

- الدليل: توصي المقالة بربط الحالة الفارغة مباشرة بالخطوة التي تملؤها.
- التحقق والحدود: إرشاد منشور؛ تطبيق مباشر مقترح.
- التطبيق المقترح: ضع إنشاء أول ملاحظة داخل بطاقة الملاحظات الفارغة.
- الاختبار: من الرئيسية الجديدة أنشئ ملاحظة دون البحث أسفل الصفحة.
- المصدر: [Designing Empty States in Complex Applications: 3 Guidelines](https://www.nngroup.com/articles/empty-state-interface-design/) — practitioner_article. مرجع البحث: `turn36view1`.

### T010 — اشرح كيف تمتلئ القوائم الشخصية

- الدليل: تستخدم المقالة المفضلة والعناصر الحديثة لبيان فائدة وصف طريقة إضافة المحتوى.
- التحقق والحدود: مثال منشور؛ إن استُخدم قسم حديثة في رسوخ فهو اقتراح.
- التطبيق المقترح: عند فراغ قسم الحديثة اذكر أنه يعرض ما فُتح مؤخرًا، مع مدخل للملاحظات.
- الاختبار: اطلب من مستخدم تفسير القسم قبل وبعد فتح ملاحظة.
- المصدر: [Designing Empty States in Complex Applications: 3 Guidelines](https://www.nngroup.com/articles/empty-state-interface-design/) — practitioner_article. مرجع البحث: `turn36view1`.

### T011 — صرّح بنطاق البحث

- الدليل: ذكر مستخدم أن بحث العناوين وحده جعله يظن أن المزامنة فقدت المحتوى.
- التحقق والحدود: تجربة فردية موثقة؛ لا تثبت معدل انتشار المشكلة.
- التطبيق المقترح: سمّ الحقل بحث في العناوين والمحتوى عندما يكون هذا نطاقه الفعلي.
- الاختبار: ابحث بكلمة موجودة في المتن فقط وتحقق من النتيجة والتسمية.
- المصدر: [[Mobile] Faster access to global search in mobile app](https://forum.obsidian.md/t/mobile-faster-access-to-global-search-in-mobile-app/42072) — community_first_person. مرجع البحث: `turn6view0`.

### T012 — البحث متاح مباشرة

- الدليل: تصف المناقشة كلفة فتح شريط جانبي وتبديل القسم للوصول للبحث المتكرر.
- التحقق والحدود: رغبة وتجارب مجتمع؛ اقتراح رسوخ استنتاج.
- التطبيق المقترح: وفّر مدخل بحث واضحًا من الرئيسية والملاحظات.
- الاختبار: ابدأ من الرئيسية واسترجع ملاحظة معروفة دون قائمة إعدادات.
- المصدر: [[Mobile] Faster access to global search in mobile app](https://forum.obsidian.md/t/mobile-faster-access-to-global-search-in-mobile-app/42072) — community_first_person. مرجع البحث: `turn6view0`.

### T013 — بدّل نطاق البحث بلا إعادة كتابة

- الدليل: تقترح المناقشة الانتقال من بحث العنوان إلى كل المحتوى داخل واجهة البحث نفسها.
- التحقق والحدود: اقتراح مجتمع صريح؛ ليس ميزة مؤكدة في Obsidian.
- التطبيق المقترح: إذا أضيف نطاق ضيق، وفّر توسيع البحث مع الاحتفاظ بعبارة المستخدم.
- الاختبار: اكتب عبارة ثم بدّل النطاق؛ يبقى النص وتُحدّث النتائج.
- المصدر: [[Mobile] Faster access to global search in mobile app](https://forum.obsidian.md/t/mobile-faster-access-to-global-search-in-mobile-app/42072) — community_first_person. مرجع البحث: `turn6view0`.

### T014 — اسم واحد للأمر نفسه

- الدليل: وجد مشارك أن Find في القائمة يسمى Search current file في الإعدادات فتعذر العثور عليه.
- التحقق والحدود: شهادة موثقة عن أسماء أوامر؛ تطبيق التوحيد استنتاج.
- التطبيق المقترح: استخدم البحث داخل الملاحظة في زرها ودليلها وأي اختصار لها.
- الاختبار: اطلب العثور على الأمر من الشاشة ومن قائمة الأدوات بالاسم نفسه.
- المصدر: [[mobile] Is there a quick way to open Find... command on mobile to search for text on a Note?](https://forum.obsidian.md/t/mobile-is-there-a-quick-way-to-open-find-command-on-mobile-to-search-for-text-on-a-note/65960) — community_first_person. مرجع البحث: `turn6view5`.

### T015 — نتائج صفر واضحة

- الدليل: توثق المقالة تجاهل المشاركين رسالة لا نتائج عندما تكون هامشية بصريًا.
- التحقق والحدود: ملاحظة من اختبار منشور؛ نقلها لرسوخ استنتاج.
- التطبيق المقترح: اعرض لا توجد نتائج لعبارتك في منطقة النتائج نفسها.
- الاختبار: ابحث بعبارة لا تطابق شيئًا؛ اطلب تفسير الشاشة قبل أي تلميح.
- المصدر: [3 Guidelines for Search Engine "No Results" Pages](https://www.nngroup.com/articles/search-no-results-serp/) — original_research. مرجع البحث: `turn33view0`.

### T016 — احتفظ بالعبارة لتعديلها

- الدليل: تنصح المقالة بإبقاء الاستعلام الأصلي داخل حقل البحث عند غياب النتائج.
- التحقق والحدود: توصية منشورة؛ توسيعها للعودة من النتيجة استنتاج.
- التطبيق المقترح: لا تمسح العبارة عند فشل البحث أو إغلاق نتيجة والعودة.
- الاختبار: عدّل حرفًا بعد بحث فاشل دون إعادة كتابة الاستعلام.
- المصدر: [3 Guidelines for Search Engine "No Results" Pages](https://www.nngroup.com/articles/search-no-results-serp/) — original_research. مرجع البحث: `turn33view0`.

### T017 — طريق تعافٍ بعد البحث الفاشل

- الدليل: توصي المقالة باقتراح كلمات أقل أو بديلة بدل جعل الصفحة نهاية مسدودة.
- التحقق والحدود: إرشاد منشور؛ لا تُعرض اقتراحات مزعومة أنها نتائج.
- التطبيق المقترح: وفّر مسح البحث وإرشادًا مختصرًا لتقليل الكلمات أو إزالة التصفية.
- الاختبار: ابحث بعبارة طويلة ثم أصلحها من الشاشة نفسها.
- المصدر: [3 Guidelines for Search Engine "No Results" Pages](https://www.nngroup.com/articles/search-no-results-serp/) — original_research. مرجع البحث: `turn33view0`.

### T018 — التقاط قصير من موضع العمل

- الدليل: قدّم مساهم نموذجًا لإدخال ملاحظات قصيرة متتابعة من قائمة الملاحظات.
- التحقق والحدود: نموذج مجتمع مقترح؛ ليس دليلًا على توفره في إصدار حالي.
- التطبيق المقترح: اجعل ملاحظة جديدة إجراءً مباشرًا في الرئيسية والقائمة.
- الاختبار: التقط ثلاث أفكار قصيرة وسجّل خطوات الرجوع بين كل فكرة.
- المصدر: [Mobile: Quickly add notes (incl prototypes)](https://discourse.joplinapp.org/t/mobile-quickly-add-notes-incl-prototypes/30085) — community_prototype. مرجع البحث: `turn33view4`.

### T019 — انتقال واضح من العنوان للمتن

- الدليل: طلب مستخدمون تفعيل الكتابة مباشرة والانتقال من العنوان للمتن بزر الإدخال.
- التحقق والحدود: طلب مستخدمين؛ أفضل حقل ابتدائي لرسوخ يحتاج تجربة.
- التطبيق المقترح: عند الإنشاء ركّز حقلًا مناسبًا، واجعل التالي ينقل إلى المتن.
- الاختبار: أنشئ عنوانًا ثم انتقل للمتن بلوحة المفاتيح دون لمس إضافي.
- المصدر: [Change title when editing a note](https://discourse.joplinapp.org/t/change-title-when-editing-a-note/37671) — community_discussion. مرجع البحث: `turn33view3`.

### T020 — لا تغيّر العنوان الذي اختاره صاحبه

- الدليل: اعترض مشارك على تحديث العنوان تلقائيًا مع أول سطر لأنه يفقده مرجع الاسترجاع.
- التحقق والحدود: رأي مستخدم ضمن نقاش مختلف الآراء؛ التطبيق استنتاج.
- التطبيق المقترح: احفظ العنوان اليدوي ثابتًا عند تعديل المتن؛ اقترح عنوانًا فقط عند فراغه.
- الاختبار: غيّر أول فقرة في ملاحظة مسماة وتأكد أن عنوانها لا يتبدل.
- المصدر: [Change title when editing a note](https://discourse.joplinapp.org/t/change-title-when-editing-a-note/37671) — community_discussion. مرجع البحث: `turn33view3`.

### T021 — قوالب سريعة اختيارية

- الدليل: طلب مستخدم اختيار قالب عند إنشاء ملاحظة باختصار الهاتف لتخفيف العمل المتكرر.
- التحقق والحدود: طلب مجتمع؛ عدد قوالب رسوخ المقترح ليس حقيقة من المصدر.
- التطبيق المقترح: اعرض قوالب محدودة اختيارية مع ملاحظة فارغة كمسار مباشر.
- الاختبار: أنشئ ملاحظة فارغة ثم ملاحظة بقالب دون إعداد مسبق.
- المصدر: [[Mobile] Add the ability to select a template when using the "Open New Note" shortcut command](https://forum.obsidian.md/t/mobile-add-the-ability-to-select-a-template-when-using-the-open-new-note-shortcut-command/110549) — community_first_person. مرجع البحث: `turn33view2`.

### T022 — حديثة قبل كتابة البحث

- الدليل: توثق مساعدة Obsidian عرض أحدث الملاحظات عندما يكون استعلام المبدّل فارغًا.
- التحقق والحدود: سلوك موثق رسميًا؛ تطبيقه في رسوخ اقتراح.
- التطبيق المقترح: يمكن لمدخل البحث في رسوخ عرض ملاحظات حديثة معنونة بوضوح.
- الاختبار: افتح البحث فارغًا وعد إلى آخر ملاحظة دون كتابة.
- المصدر: [Quick switcher](https://obsidian.md/help/plugins/quick-switcher) — official_documentation. مرجع البحث: `turn33view6`.

### T023 — حوّل الاسم الجديد إلى ملاحظة

- الدليل: توثق المساعدة إنشاء ملاحظة باسم الاستعلام إذا لم يوجد مطابق.
- التحقق والحدود: سلوك موثق رسميًا؛ واجهة التأكيد المقترحة استنتاج.
- التطبيق المقترح: وفّر إنشاء ملاحظة بهذا العنوان بعد غياب المطابقة مع فصلها عن النتائج.
- الاختبار: ابحث عن عنوان جديد ثم أنشئه؛ لا تنشأ نسخة عند وجود مطابق.
- المصدر: [Quick switcher](https://obsidian.md/help/plugins/quick-switcher) — official_documentation. مرجع البحث: `turn33view6`.

### T024 — الرجوع يعيد إلى السياق السابق

- الدليل: اشتكى مستخدمون أن الرجوع بعد تتبع رابط يعيد لقائمة بدل الملاحظة السابقة.
- التحقق والحدود: شهادات مجتمع عن إصدار قديم؛ الاختبار لرسوخ مقترح.
- التطبيق المقترح: احفظ مصدر الدخول كي يعود إغلاق الملاحظة للرئيسية أو نتائج البحث أو الملاحظة الأصلية.
- الاختبار: اختبر رئيسية ← ملاحظة، وبحث ← ملاحظة، ورابط ← ملاحظة ثم الرجوع.
- المصدر: [Mobile navigation experience with note links](https://discourse.joplinapp.org/t/mobile-navigation-experience-with-note-links/23810) — community_first_person. مرجع البحث: `turn6view2`.

### T025 — احتفظ بموضع القائمة

- الدليل: ذكر مستخدم أن إعادة مستكشف الملفات للأعلى بعد إغلاق ملاحظة تعيق التنقل في القوائم الكبيرة.
- التحقق والحدود: شكوى تاريخية ورد يفيد إصلاحها؛ لا ننسب العطل للنسخة الحالية.
- التطبيق المقترح: أعد المستخدم إلى موضع قائمة الملاحظات نفسه بعد إغلاق المحرر.
- الاختبار: افتح العنصر رقم 40 ثم أغلقه؛ يبقى موضع القائمة قريبًا منه.
- المصدر: [Preserve Scroll Position in the File Explorer for Obsidian Mobile](https://forum.obsidian.md/t/preserve-scroll-position-in-the-file-explorer-for-obsidian-mobile/93965) — community_first_person. مرجع البحث: `turn57view0`.

### T026 — استأنف موضع القراءة

- الدليل: وصف مستخدم للهاتف فقدان موضعه في الملاحظات الطويلة عند مغادرة التطبيق والعودة.
- التحقق والحدود: تجربة فردية موثقة؛ آلية التنفيذ في رسوخ تحتاج فحصًا.
- التطبيق المقترح: احتفظ بموضع قراءة الملاحظة عند التنقل واستئناف التطبيق حيثما أمكن.
- الاختبار: اقرأ منتصف ملاحظة طويلة ثم بدّل التطبيق وعد؛ قارن موضع النص.
- المصدر: [[Feature] Save location within notes](https://forum.obsidian.md/t/feature-save-location-within-notes/43878) — community_first_person. مرجع البحث: `turn57view1`.

### T027 — قفز واضح داخل الملاحظة الطويلة

- الدليل: تصف المناقشة التمرير البطيء وصعوبة بلوغ بداية الملاحظة أو نهايتها.
- التحقق والحدود: طلب مجتمع؛ اختيار أزرار القفز أو الفهرس لرسوخ استنتاج.
- التطبيق المقترح: وفّر انتقالًا واضحًا للبداية والنهاية أو عناوين الأقسام في الملاحظات الطويلة.
- الاختبار: أضف نصًا طويلًا واطلب الوصول لآخر فقرة دون تمرير مطوّل.
- المصدر: [Mobile app: navigate to the start/end of the note](https://discourse.joplinapp.org/t/mobile-app-navigate-to-the-start-end-of-the-note/29489) — community_first_person. مرجع البحث: `turn6view6`.

### T028 — البحث أثناء القراءة

- الدليل: يقترح مساهم توفير بحث داخل الملاحظة في وضع القراءة بدل اشتراط التحرير.
- التحقق والحدود: مقترح مساهم موثق؛ ليس إثباتًا أنه طُبق.
- التطبيق المقترح: اجعل بحث النص قابلًا للاستخدام دون دخول وضع يغير المحتوى.
- الاختبار: ابحث داخل ملاحظة وافتح التطابق دون تعديل نصها.
- المصدر: [Search notes in view mode on mobile](https://discourse.joplinapp.org/t/search-notes-in-view-mode-on-mobile/45364) — community_contributor_proposal. مرجع البحث: `turn33view5`.

### T029 — انتقل بين التطابقات

- الدليل: يقترح المساهم زري السابق والتالي للقفز بين كلمات البحث داخل الملاحظة.
- التحقق والحدود: السابق والتالي اقتراح صريح؛ إضافة العدد استنتاج.
- التطبيق المقترح: اعرض عدد التطابقات وانتقل بينها دون تمرير يدوي.
- الاختبار: في ملاحظة بها خمسة تطابقات انتقل لكل واحد ثم أغلق البحث.
- المصدر: [Search notes in view mode on mobile](https://discourse.joplinapp.org/t/search-notes-in-view-mode-on-mobile/45364) — community_contributor_proposal. مرجع البحث: `turn33view5`.

### T030 — مقتطف يفسر النتيجة

- الدليل: اشتكى مستخدم من عرض عناوين فقط، ما يجبره على فتح النتائج واحدة واحدة.
- التحقق والحدود: شهادة مستخدم وليست قياسًا عامًا؛ مقتطف رسوخ اقتراح.
- التطبيق المقترح: أظهر مقتطفًا حول تطابق المتن مع إبقاء عنوان الملاحظة.
- الاختبار: استخدم عناوين متشابهة وحدد الملاحظة المقصودة من قائمة النتائج.
- المصدر: [Joplin is let down by very poor search](https://discourse.joplinapp.org/t/joplin-is-let-down-by-very-poor-search/13679) — community_discussion. مرجع البحث: `turn57view2`.

### T031 — التصفية المكتشفة أفضل من الصيغة المخفية

- الدليل: صحح ردّ في المناقشة اعتقاد غياب بحث الدفتر؛ الوظيفة موجودة بصيغة لم يعرفها السائل.
- التحقق والحدود: حقيقة النقاش هي وجود تصحيح؛ لا ننسب انعدام الوظيفة إلى Joplin.
- التطبيق المقترح: إذا أضيفت فئات، اعرض تصفية مرئية بدل اشتراط كتابة معاملات خاصة.
- الاختبار: اطلب البحث في فئة واحدة دون معرفة صيغة بحث.
- المصدر: [Joplin is let down by very poor search](https://discourse.joplinapp.org/t/joplin-is-let-down-by-very-poor-search/13679) — community_discussion. مرجع البحث: `turn57view2`.

### T032 — افتح النتيجة عند موضع التطابق

- الدليل: اشتكى السائل من الوصول لأول الملاحظة بدل النص المطابق عند البحث.
- التحقق والحدود: شكوى تاريخية مع اختلاف تجارب المشاركين؛ اقتراح رسوخ يحتاج اختبارًا.
- التطبيق المقترح: مرر عبارة البحث لعارض الملاحظة وحدد التطابق أو زر الانتقال إليه.
- الاختبار: ابحث بكلمة في آخر ملاحظة طويلة وافتح النتيجة مباشرة.
- المصدر: [Joplin is let down by very poor search](https://discourse.joplinapp.org/t/joplin-is-let-down-by-very-poor-search/13679) — community_discussion. مرجع البحث: `turn57view2`.

### T033 — ترتيب النتائج يخدم قصد البحث

- الدليل: طلب مستخدمون فرز نتائج كثيرة بالتاريخ أو الاسم بدل الاعتماد الدائم على الصلة.
- التحقق والحدود: طلبات ومناقشة مساهم؛ لا ندعي دمج طلب التعديل.
- التطبيق المقترح: أضف ترتيبًا معلنًا مثل آخر تعديل عند الحاجة الفعلية للقوائم الكبيرة.
- الاختبار: ابحث عن موضوع متكرر واختر أحدث ملاحظة بوضوح.
- المصدر: [Search result order](https://discourse.joplinapp.org/t/search-result-order/3763) — community_maintainer_discussion. مرجع البحث: `turn57view5`.

### T034 — أجّل الأدوات المتخصصة

- الدليل: توصي المقالة بإظهار المهم أولًا ونقل الخيارات النادرة إلى مستوى ثانٍ.
- التحقق والحدود: إرشاد منشور؛ اختيار الوظائف الأساسية لرسوخ فرضية.
- التطبيق المقترح: ابدأ بالملاحظة والبحث والمصدر، وضع الإعدادات المتقدمة داخل الأداة.
- الاختبار: اطلب حفظ ملاحظة من مستخدم جديد وسجّل الخيارات غير الضرورية التي يفتحها.
- المصدر: [Progressive Disclosure](https://www.nngroup.com/articles/progressive-disclosure/) — practitioner_article. مرجع البحث: `turn57view3`.

### T035 — سمِّ الطريق للأدوات الثانوية

- الدليل: تشترط المقالة أن يكون الانتقال للمستوى الثاني ظاهرًا وأن تصف تسميته المحتوى المتوقع.
- التحقق والحدود: إرشاد منشور؛ التفريق بين الظهور والتثبيت استنتاج خاص برسـوخ.
- التطبيق المقترح: احتفظ بمدخل كل الأدوات، وافصل فتح الأداة عن إظهارها في الرئيسية وتثبيتها بالشريط.
- الاختبار: أخف أداة ثم اطلب فتحها وإعادتها للرئيسية دون تغيير بياناتها.
- المصدر: [Progressive Disclosure](https://www.nngroup.com/articles/progressive-disclosure/) — practitioner_article. مرجع البحث: `turn57view3`.

## فهرس الفيديوهات

الحقول غير الظاهرة في المصدر تكتب «غير متحقق» بدل التخمين. الارتباط بالنصائح يبين مجال المقارنة، ولا يعني أن كل توصية وردت حرفيًا في الفيديو.

### V001 — Hamburger Menus Hurt UX Metrics (Kara Pernice)

- الرابط: [YouTube](https://www.youtube.com/watch?v=rdeoPuPzONg).
- القناة: NNgroup. التاريخ: 2017-02-17.
- مستوى الوصول: `search_metadata`؛ دون مشاهدة أو تفريغ.
- الدرس المدعوم بالبيانات المتاحة: الوصف يربط إخفاء التنقل بانخفاض اكتشافه وزيادة زمن المهمة؛ يساند إبقاء الوجهات الأساسية ظاهرة.
- النصائح المرتبطة: T001. مرجع البحث: `turn12youtube47`.

### V002 — How to Design a Good Search UI

- الرابط: [YouTube](https://www.youtube.com/watch?v=3J8YKKHhhhA).
- القناة: NNgroup. التاريخ: 2021-05-14.
- مستوى الوصول: `search_metadata`؛ دون مشاهدة أو تفريغ.
- الدرس المدعوم بالبيانات المتاحة: الوصف ينبه أن ضعف استخدام البحث قد ينتج عن واجهته؛ اختبر اكتشاف مدخل البحث قبل افتراض عدم الحاجة إليه.
- النصائح المرتبطة: T012. مرجع البحث: `turn12youtube48`.

### V003 — Navigation Menus - 5 Tips to Make Them Visible

- الرابط: [YouTube](https://www.youtube.com/watch?v=Vp77JWjjaiQ).
- القناة: NNgroup. التاريخ: 2020-06-12.
- مستوى الوصول: `search_metadata`؛ دون مشاهدة أو تفريغ.
- الدرس المدعوم بالبيانات المتاحة: الوصف يركز على ظهور قائمة التنقل؛ يدعم اختبار العثور على كل الأدوات دون شرح.
- النصائح المرتبطة: T001، T035. مرجع البحث: `turn19youtube48`.

### V004 — Tips for Icon Usability

- الرابط: [YouTube](https://www.youtube.com/watch?v=ZF_25i-be8k).
- القناة: NNgroup. التاريخ: 2017-09-01.
- مستوى الوصول: `search_metadata`؛ دون مشاهدة أو تفريغ.
- الدرس المدعوم بالبيانات المتاحة: الوصف يعلن إرشادات لفهم الأيقونات؛ يساند اختبار المعنى المتوقع للأدوات، ولا نسرد إرشادات لم تُقرأ.
- النصائح المرتبطة: T003. مرجع البحث: `turn22youtube48`.

### V005 — Empty States in Application Design: 3 Guidelines

- الرابط: [YouTube](https://www.youtube.com/watch?v=MUh3xyvEWDE).
- القناة: غير متحقق. التاريخ: غير متحقق.
- مستوى الوصول: `search_metadata`؛ دون مشاهدة أو تفريغ.
- الدرس المدعوم بالبيانات المتاحة: وصف الناشر الأصلي للفيديو يربط الحالة الفارغة بالثقة والتعلم وبدء المهام؛ رابط يوتيوب فُتح بعنوان مطابق.
- النصائح المرتبطة: T008، T009، T010. مرجع البحث: `turn19search0`.
- وصف الناشر: [صفحة الفيديو الأصلية](https://www.nngroup.com/videos/empty-states-in-application-design-guidelines/).

### V006 — Progressive Disclosure

- الرابط: [YouTube](https://www.youtube.com/watch?v=qlKWPNgPjmw).
- القناة: NNgroup. التاريخ: 2022-07-15.
- مستوى الوصول: `search_metadata`؛ دون مشاهدة أو تفريغ.
- الدرس المدعوم بالبيانات المتاحة: الوصف يوصي بنقل الخيارات الثانوية لشاشة فرعية لتركيز الانتباه على الأساسية.
- النصائح المرتبطة: T034، T035. مرجع البحث: `turn27youtube3`.

### V007 — العنوان الدقيق غير متحقق

- الرابط: [YouTube](https://www.youtube.com/watch?v=4oJ0rAeWIss).
- القناة: NNgroup. التاريخ: 2022-10-28.
- مستوى الوصول: `search_metadata`؛ دون مشاهدة أو تفريغ.
- الدرس المدعوم بالبيانات المتاحة: الوصف المرصود يدعو لأماكن متوقعة وتسلسل بصري واضح وإظهار تدريجي للخيارات؛ العنوان لم يظهر في نتيجة البحث.
- النصائح المرتبطة: T002، T034. مرجع البحث: `turn27youtube4`.

### V008 — Information Scent

- الرابط: [YouTube](https://www.youtube.com/watch?v=-c9AUhXAFD8).
- القناة: NNgroup. التاريخ: 2020-11-27.
- مستوى الوصول: `search_metadata`؛ دون مشاهدة أو تفريغ.
- الدرس المدعوم بالبيانات المتاحة: الوصف يشرح استخدام نص الرابط وسياقه لتوقع وجهته؛ سمّ فتح الأداة وتخصيص ظهورها بدقة.
- النصائح المرتبطة: T035. مرجع البحث: `turn39youtube30`.

### V009 — Designing Search Suggestions

- الرابط: [YouTube](https://www.youtube.com/watch?v=7XpQVWaTO2s).
- القناة: NNgroup. التاريخ: 2019-03-22.
- مستوى الوصول: `search_metadata`؛ دون مشاهدة أو تفريغ.
- الدرس المدعوم بالبيانات المتاحة: الوصف يشترط صلة اقتراحات البحث وتمييزها بصريًا عن الاستعلام؛ أي اقتراح في رسوخ يجب ألا يبدو نتيجة مؤكدة.
- النصائح المرتبطة: T017. مرجع البحث: `turn39youtube31`.

### V010 — العنوان الدقيق غير متحقق

- الرابط: [YouTube](https://www.youtube.com/watch?v=zgYapNWI6EA).
- القناة: CreaDev Labs. التاريخ: 2026-01-29.
- مستوى الوصول: `search_metadata`؛ دون مشاهدة أو تفريغ.
- الدرس المدعوم بالبيانات المتاحة: وصف الفيديو يناقش تقليل صعوبة الالتقاط على الهاتف ومداخل مباشرة للملاحظات؛ لا نستنتج تفاصيل تنفيذ لرسوخ.
- النصائح المرتبطة: T018. مرجع البحث: `turn41youtube1`.

### V011 — Obsidian ➡ 3 tips for content capture (how I do it)

- الرابط: [YouTube](https://www.youtube.com/watch?v=6UA6PkYMRyY).
- القناة: Vladimir Campos. التاريخ: 2026-07-03.
- مستوى الوصول: `search_metadata`؛ دون مشاهدة أو تفريغ.
- الدرس المدعوم بالبيانات المتاحة: الوصف والفصول يتناولان التقاط المحتوى بالهاتف وتنظيمه في مجلد؛ الدرس المحدود هو اختبار التقاط الفكرة في سياقها.
- النصائح المرتبطة: T018، T021. مرجع البحث: `turn41youtube2`.

### V012 — Quick Capture Obsidian Mobile Notes on IPhone

- الرابط: [YouTube](https://www.youtube.com/watch?v=xxmczG4dcS4).
- القناة: غير متحقق. التاريخ: غير متحقق.
- مستوى الوصول: `search_metadata`؛ دون مشاهدة أو تفريغ.
- الدرس المدعوم بالبيانات المتاحة: المقتطف يصف إعداد اختصار Siri من ثلاث خطوات لالتقاط الملاحظات؛ يبرهن وجود مسار اختصار يناقشه ممارس، لا جودة مسار رسوخ.
- النصائح المرتبطة: T018. مرجع البحث: `turn45youtube49`.

### V013 — Tree Testing to Evaluate Information Architecture Categories

- الرابط: [YouTube](https://www.youtube.com/watch?v=P0WDO76300Q).
- القناة: NNgroup. التاريخ: 2019-11-01.
- مستوى الوصول: `search_metadata`؛ دون مشاهدة أو تفريغ.
- الدرس المدعوم بالبيانات المتاحة: الوصف يعرّف اختبار شجرة التنقل لتقييم التصنيف؛ يمكن استخدام مهام بسيطة لاختبار موضع أدوات رسوخ.
- النصائح المرتبطة: T035. مرجع البحث: `turn55youtube46`.

### V014 — How Many Items in a Navigation Menu?

- الرابط: [YouTube](https://www.youtube.com/watch?v=zJLQdMmYWFQ).
- القناة: NNgroup. التاريخ: 2019-05-24.
- مستوى الوصول: `search_metadata`؛ دون مشاهدة أو تفريغ.
- الدرس المدعوم بالبيانات المتاحة: الوصف يرفض العدد سبعة كقاعدة تلقائية للقوائم؛ اختر عدد الوجهات وفق المهمة والمساحة ثم اختبره.
- النصائح المرتبطة: T001، T002. مرجع البحث: `turn55youtube47`.

### V015 — Onboarding: Skip it When Possible

- الرابط: [YouTube](https://www.youtube.com/watch?v=OO0jveK-x0w).
- القناة: NNgroup. التاريخ: 2021-01-15.
- مستوى الوصول: `search_metadata`؛ دون مشاهدة أو تفريغ.
- الدرس المدعوم بالبيانات المتاحة: الوصف يحذر من كلفة التعليمات التي تسبق الاستخدام؛ يدعم دخول تجربة جاهزة وتعليمًا عند الحاجة.
- النصائح المرتبطة: T005، T006، T007. مرجع البحث: `turn83youtube33`.

### V016 — Best Way To Organize Your Apple Notes - Most Don't Know This Method

- الرابط: [YouTube](https://www.youtube.com/watch?v=s2_hdIXW5UU).
- القناة: Craig Neidel. التاريخ: 2025-06-03.
- مستوى الوصول: `search_metadata`؛ دون مشاهدة أو تفريغ.
- الدرس المدعوم بالبيانات المتاحة: الوصف والفصول يعرضان ملاحظة تجميع مثبتة ووسومًا للاسترجاع؛ المقارنة المفيدة لرسوخ هي سرعة الالتقاط ثم العثور على المحتوى، دون اعتماد تفضيل المنشئ كقاعدة عامة.
- النصائح المرتبطة: T018، T031. مرجع البحث: `turn88youtube22`.

### V017 — The #1 Apple Notes Organization System You Need to Try

- الرابط: [YouTube](https://www.youtube.com/watch?v=O4eB1aTy9Uc).
- القناة: The MacWhisperer. التاريخ: 2024-11-22.
- مستوى الوصول: `search_metadata`؛ دون مشاهدة أو تفريغ.
- الدرس المدعوم بالبيانات المتاحة: الوصف يذكر الفرز بتاريخ التعديل أو الإنشاء أو العنوان والتثبيت والوسوم؛ يساند اختبار طرق استرجاع مختلفة بدل افتراض معيار ترتيب واحد.
- النصائح المرتبطة: T031، T033. مرجع البحث: `turn88youtube23`.

## حدود الأدلة

- لم تُشاهد الفيديوهات ولم تتوفر نصوص تفريغ؛ الدروس مقيدة بالعناوين والأوصاف المفهرسة. لذلك صنفت كلها search_metadata.
- العنوان الدقيق غير متاح للفيديوهين V007 وV010. لا يعني الوصف المتاح التحقق من المحتوى الكامل.
- القناة والتاريخ الدقيق غير متحققين للفيديوهين V005 وV012، وتُحفظ هذه الحقول null.
- دراسات NN/G تتعلق بسياقاتها ومنتجاتها؛ لا ننقل أحجام أثرها إلى رسوخ. شهادات المجتمع إشارة تصميم وليست إجماعًا.
- هذه 35 نصيحة متميزة مستخلصة من 21 صفحة فعلية؛ ليست ادعاء قراءة 35 منشورًا مستقلًا.

## المصادر المقروءة

- [Hamburger Menus and Hidden Navigation Hurt UX Metrics](https://www.nngroup.com/articles/hamburger-menus/) — original_research؛ `turn6view4`.
- [Basic Patterns for Mobile Navigation](https://www.nngroup.com/articles/mobile-navigation-patterns/) — practitioner_article؛ `turn6view7`.
- [Icon Usability](https://www.nngroup.com/articles/icon-usability/) — original_research؛ `turn57view4`.
- [[Feature] Mobile navigation guide](https://forum.obsidian.md/t/feature-mobile-navigation-guide/30295) — community_first_person؛ `turn6view1`.
- [Mobile-App Onboarding: An Analysis of Components and Techniques](https://www.nngroup.com/articles/mobile-app-onboarding/) — original_research؛ `turn36view0`.
- [Designing Empty States in Complex Applications: 3 Guidelines](https://www.nngroup.com/articles/empty-state-interface-design/) — practitioner_article؛ `turn36view1`.
- [[Mobile] Faster access to global search in mobile app](https://forum.obsidian.md/t/mobile-faster-access-to-global-search-in-mobile-app/42072) — community_first_person؛ `turn6view0`.
- [[mobile] Is there a quick way to open Find... command on mobile to search for text on a Note?](https://forum.obsidian.md/t/mobile-is-there-a-quick-way-to-open-find-command-on-mobile-to-search-for-text-on-a-note/65960) — community_first_person؛ `turn6view5`.
- [3 Guidelines for Search Engine "No Results" Pages](https://www.nngroup.com/articles/search-no-results-serp/) — original_research؛ `turn33view0`.
- [Mobile: Quickly add notes (incl prototypes)](https://discourse.joplinapp.org/t/mobile-quickly-add-notes-incl-prototypes/30085) — community_prototype؛ `turn33view4`.
- [Change title when editing a note](https://discourse.joplinapp.org/t/change-title-when-editing-a-note/37671) — community_discussion؛ `turn33view3`.
- [[Mobile] Add the ability to select a template when using the "Open New Note" shortcut command](https://forum.obsidian.md/t/mobile-add-the-ability-to-select-a-template-when-using-the-open-new-note-shortcut-command/110549) — community_first_person؛ `turn33view2`.
- [Quick switcher](https://obsidian.md/help/plugins/quick-switcher) — official_documentation؛ `turn33view6`.
- [Mobile navigation experience with note links](https://discourse.joplinapp.org/t/mobile-navigation-experience-with-note-links/23810) — community_first_person؛ `turn6view2`.
- [Preserve Scroll Position in the File Explorer for Obsidian Mobile](https://forum.obsidian.md/t/preserve-scroll-position-in-the-file-explorer-for-obsidian-mobile/93965) — community_first_person؛ `turn57view0`.
- [[Feature] Save location within notes](https://forum.obsidian.md/t/feature-save-location-within-notes/43878) — community_first_person؛ `turn57view1`.
- [Mobile app: navigate to the start/end of the note](https://discourse.joplinapp.org/t/mobile-app-navigate-to-the-start-end-of-the-note/29489) — community_first_person؛ `turn6view6`.
- [Search notes in view mode on mobile](https://discourse.joplinapp.org/t/search-notes-in-view-mode-on-mobile/45364) — community_contributor_proposal؛ `turn33view5`.
- [Joplin is let down by very poor search](https://discourse.joplinapp.org/t/joplin-is-let-down-by-very-poor-search/13679) — community_discussion؛ `turn57view2`.
- [Search result order](https://discourse.joplinapp.org/t/search-result-order/3763) — community_maintainer_discussion؛ `turn57view5`.
- [Progressive Disclosure](https://www.nngroup.com/articles/progressive-disclosure/) — practitioner_article؛ `turn57view3`.

