# قارئ PDF النصي المحلي

يستخدم `PdfTextExtractor` مكوّن `react-native-webview@14.0.1` المشمول في Expo Go SDK 58 وفق `expo/bundledNativeModules.json` ووثائق Expo. تُشحن مكتبة PDF.js وworker داخل سلسلة JavaScript محلية؛ لا CDN ولا رفع ملف ولا نموذج ذكاء اصطناعي ولا OCR.

## الدمج

اختر ملفًا عبر DocumentPicker، وافحص حجمه أولًا، ثم اقرأ `new File(uri).base64()`. مرّر معرفًا فريدًا لكل عملية:

```tsx
<PdfTextExtractor
  request={{ id, filename, base64 }}
  onProgress={({ completed, total }) => { /* واجهة تقدم */ }}
  onExtract={result => { /* راجع result.warnings وresult.body قبل الحفظ */ }}
  onError={({ code, message }) => { /* رسالة وخيار إعادة المحاولة */ }}
/>
```

إلغاء العملية بإزالة المكوّن. يعزل `request.id` كل جلسة، ويمنع الإلغاء استقبال نتيجة متأخرة. يُزال WebView عند الانتهاء أو الخطأ أو المهلة. القارئ لا يحفظ بيانات الطالب بنفسه.

`result` يحتوي `status: text | no-text` و`title` و`body` و`pageCount` و`pages: [{pageNumber,text}]` و`emptyPages` و`warnings`. صفحات الصور لا تُحذف بصمت: يبقى رقمها مع تنبيه بأنها بلا نص. نتيجة `no-text` لا تنتج ملاحظة بمحتوى مختلق.

الحدود: 10 MiB، 50 صفحة، مليون حرف، 30 ثانية. يعاد التحقق من البنية والحدود على جانبي WebView. لا يُشغّل JavaScript الموجود داخل PDF، ولا تُعرض HTML مستخرجة منه. CSP يمنع الاتصالات والخطوط والصور والإطارات الخارجية؛ ملفات PDF تدخل فقط عبر bytes/base64. `useWasm` و`useSystemFonts` و`useWorkerFetch` معطلة. ملفات PDF المحمية بكلمة مرور مرفوضة برسالة واضحة.

## النسخة والترخيص وإعادة البناء

PDF.js **6.5.438** من حزمة npm الرسمية، بترخيص Apache-2.0 الموجود كاملًا في `LICENSE.pdfjs`. نسخة البناء/الحجم/بصمة SHA-256 ومصدر الحزمة مثبتة في `engine-manifest.json`. `engine.generated.ts` مشتق من المكتبة بإضافة بروتوكول استخلاص رُسوخ؛ ليس تنزيلًا وقت الاستخدام. الحجم قرابة 1.77 MB قبل ضغط حزمة التطبيق.

لإعادة البناء ثبّت `pdfjs-dist@6.5.438` و`esbuild@0.25.12` في prefix منفصل لأدوات التطوير، ثم:

```sh
RUSUKH_PDF_TOOLING=/absolute/tooling-prefix node src/pdf/build-engine.cjs
```

لا يلزم إضافة PDF.js إلى اعتماديات إنتاج التطبيق؛ الأصل المولّد مضمّن. من الأفضل إعادة توليده ومقارنة البصمة عند ترقية المكتبة، ثم إعادة جميع اختبارات PDF.

## التحقق الفعلي وحدوده

`tests/pdf.test.cjs` يشغّل **نفس الحزمة المضمّنة** على ملفات PDF ثنائية فعلية مصطنعة: عربية/إنجليزية من صفحتين، صورة فقط، ملف مختلط، ملف مشفّر وملف 51 صفحة. يفحص عدم إجراء أي `fetch` في تجربة الاستخراج، وتوثيق الصفحات، وحدود الإدخال، وربط الحروف المتجاورة بدل فصل كل حرف بمسافة. هذه اختبارات parser في Node، وليست اختبار WKWebView على آيفون.

`tests/pdf.ui.test.jsx` يفحص رسائل WebView والمهلة والإلغاء وعزل معرفات العمليات **بمحاكاة WebView**، وليس محرك WebKit. يجب اختبار اختيار ملف وقراءة النتيجة/الإلغاء على Expo Go في iPhone قبل إعلان نجاح التكامل على الجهاز.

تولّد `tests/fixtures/pdf/generate.py` ملفات اصطناعية باستخدام ReportLab/PyMuPDF وخط DejaVu Sans (رخصته في `tests/fixtures/pdf/LICENSE-DejaVu.txt`). لا تحتوي ملفات مستخدم. fixture العربية ذات ترتيب stream بصري تسترجع «المراجعة المتباعدة تثبت المعرفة» و«العلم نور» وEnglish 123 بنجاح. `arabic-standard.pdf` يوثّق حالة منتج مختلفة ترجع فيها كلمات معكوسة؛ لذلك **لا نَعِد بصحة جميع ملفات العربية** ولا نقلب النص آليًا، فهذا قد يفسد الملفات الصحيحة والمحتوى المختلط. تبقى مراجعة النص قبل الحفظ مطلوبة. الجداول، الخطوط ذات ToUnicode غير الصحيح، وترتيب ligatures قد تحتاج تصحيحًا يدويًا.

لاحظنا كذلك حالة خط مضمّن من منتج HTML بها خرائط Unicode غير سليمة؛ لم نُحوّل الرموز تخمينًا إلى حروف عربية. الصور تحتاج مسار OCR منفصلًا لم يُنفّذ هنا.

مصادر التحقق:

- https://docs.expo.dev/versions/v58.0.0/sdk/webview/
- https://github.com/react-native-webview/react-native-webview/blob/master/docs/Reference.md
- https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib.html
- https://github.com/mozilla/pdf.js/issues/16880
- https://github.com/mozilla/pdf.js
