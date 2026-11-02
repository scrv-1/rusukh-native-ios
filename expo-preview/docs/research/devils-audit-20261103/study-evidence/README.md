# أدلة تدقيق مسار الدراسة

هذه اختبارات إثبات للسلوك القائم، وليست اختبارات قبول لتصحيح المنتج. لا تُدمج في جناح الإنتاج كما هي: نجاح assertion الذي يثبت جوابًا قديمًا لا يعني صحة التطبيق.

## إعادة التنفيذ

من جذر expo-preview:

```bash
./node_modules/.bin/tsc -p tsconfig.test.json
node --test docs/research/devils-audit-20261103/study-evidence/logic-reproductions.test.cjs
./node_modules/.bin/jest --runInBand --testMatch '**/study-evidence/*.ui.test.jsx'
```

نتيجة التدقيق: 5 اختبارات منطق ناجحة (4 إثباتات وضابط صحيح)، و4 اختبارات واجهة ناجحة. لم تستخدم جهاز iPhone أو نموذج GGUF فعليًا. التخزين والمحرك في اختبارات الواجهة معزولان لتسجيل استدعاءات المكون؛ منطق الدراسة المستورد هو شيفرة المشروع نفسها.

ظهر تحذير بيئة expo-notifications عن إشعارات Android البعيدة؛ لم يُستعمل لإثبات أي عيب هنا.

## لقطة الملفات

HEAD: `7ff06414162d79f3b000fa18e8efcf0376546c76`

| الملف | SHA-256 وقت الإثبات |
|---|---|
| App.tsx | 85883deb8fed2848198017542f948fefcff0e027e2ca17010e1227e5654bdfff |
| src/core.ts | 7daef77e9cde1be65b4f4acba643688054d8f41ffe4c6ad5d2f3affab12e0152 |
| src/studyChunks.ts | 2d97d917427e1e843c736332613ef577a15a4fed9dc0a1c3438c53740d1f85a3 |
| src/types.ts | 70626f68eace209298b111a0e06e816265507b21367a4c85496d5e5efb054b1d |
| src/storage.ts | ca85c2b6a9a7a2b783a45e79ab730dd76fcf437c11fa04d613a3e4023f86c4fc |
| src/AIWorkspace.tsx | 523486867f171fa57251980658ed339fe858e6178e01be1dd31286aa2d3dec1d |
| src/KnowledgeGraph.tsx | 9164876e833786098642c40788fff84b5b886fe3f5ecf448b87f5ebee72b6d26 |

راجِع study.json للسيناريو والأثر والإصلاح والقبول وتصنيف كل نتيجة. مصادر الحلول قُرئت في بحث ux-20261103/study.json السابق؛ الشيفرة والاختبارات هي دليل العيوب الفعلية. الاقتراحات المستقاة من مجتمع Anki وObsidian إرشاد تصميمي وليست حكمًا بوجوب تقليد كامل المنتجين.

