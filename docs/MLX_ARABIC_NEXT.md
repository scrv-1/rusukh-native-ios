# محرك توليدي عربي مستقل على الآيفون — المرحلة التالية

**الوضع: غير منفّذ في نسخة MVP الحالية**. لا تسوّق استخراج الكلمات في Apple NaturalLanguage على أنه نموذج توليدي. لا تخلط بين Core ML وMLX: MLX غالبًا يستخدم GPU عبر Metal، ولا يضمن تشغيل النموذج على Apple Neural Engine.

1. اعتمد محرك `ml-explore/mlx-swift-lm` 3.x بعد تثبيت نسخة توافق SDK iOS 27 (3.x أجرى تغييرات API كاسرة، لذلك لا تثبت `main` بلا تدقيق).
2. ابدأ من مثال Apple MLX الرسمي `ml-explore/mlx-swift-examples/Applications/MLXChatExample` وملفات iOS الخاصة به، ثم انقل محرّك التحميل والتوليد إلى `NativeAIEngine` ضمن بروتوكول `LocalTextEngine`.
3. اختر نموذجًا متعدد اللغات، مع مراجعة ترخيصه، ودعم العربية، وحجم الذاكرة. اختبر نموذجًا كمّيًا صغيرًا على iPhone الفعلي قبل أي افتراضات عن التوكن/الثانية.
4. نزّل الأوزان على الجهاز **بموافقة صريحة**، واظهر حجم التحميل، والمساحة المطلوبة، وحالة الإيقاف/الحذف. لا تضع الأوزان الضخمة ضمن IPA الأولى.
5. اعزل محركات Apple Foundation Models وMLX لكل نموذج/لغة؛ قدّم رسالة إن لم يتوفر نموذج عربي، بدون تحويل سري إلى API سحابي.
6. اختبر الحرارة والبطارية والذاكرة وأداء النص العربي، وقارن GPU مع Core ML `computeUnits=.all` فقط عندما يتوفر نموذج Core ML حقيقي قابل للترجمة.
7. امنع التوليد غير المحدود في الخلفية؛ التقيد بنظام iOS وإدارة الطاقة والتبريد واجب في التطبيق الأصلي أيضًا.

المراجع الرسمية (راجعت في 31 أكتوبر 2026):
- https://github.com/ml-explore/mlx-swift-lm
- https://github.com/ml-explore/mlx-swift-examples
- https://github.com/ml-explore/mlx-swift-examples/blob/main/Applications/MLXChatExample/README.md
- https://developer.apple.com/documentation/coreml/mlcomputeunits
