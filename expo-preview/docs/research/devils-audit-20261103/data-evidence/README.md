# أدلة تدقيق البيانات

لم تتغير ملفات المنتج. ملفات الاختبارات هنا مخصصة لإثبات نتائج التدقيق وليست إصلاحات.

- `storage-probes.cjs`: يحوّل مصدر التخزين الحقيقي في الذاكرة ويشغّله على Node SQLite. أثبت D001 وD002؛ النتائج التفصيلية في `storage-probes.log`.
- `draft-audit.ui.test.jsx`: واجهة App وآلية المسودة الحقيقية مع storage adapter. أثبت محو مسودة محفوظة بعد استيراد وافق عليه المستخدم، مع غياب ذكرها عن التأكيد (D003).
- `media-audit.ui.test.jsx`: كود مكتبة الوسائط مع موائم filesystem في الذاكرة. أثبت بقاء jpg وعدم ظهوره أو إمكانية إصلاحه بعد فشلmetadata وفقدcache (D004).
- `reminders-audit.ui.test.jsx`: واجهة التذكير مع AppState/service محاكيين. أثبت رجوع حقل20:30 إلى19:00 بعد active دونschedule (D005).
- `ui-probes.log`: 3 suites /3 tests passed. الاختبارات تتوقع السلوك المعيب الموجود لكي تثبت السيناريو؛ هذا ليس نجاح إصلاح.
- `source-hashes.json`: بصمات الملفات المقروءة وقت كتابة التقرير لتمييز هذا التدقيق عن تغييرات لاحقة.

من مجلد expo-preview:

```sh
node docs/research/devils-audit-20261103/data-evidence/storage-probes.cjs
./node_modules/.bin/jest --config docs/research/devils-audit-20261103/data-evidence/jest.config.cjs --runInBand
```

لا يوجد في هذه الأدلة اختبار iPhone أو Files/iCloud أصلي أو مكالمة أو تسليم إشعار فعلي. القياس في D002 لحجم JSON UTF-8، وليس لاستهلاك الذاكرة.
