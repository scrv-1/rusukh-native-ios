"""Validate the research inventory and emit a concise, honest Arabic decision register."""
import json
from collections import Counter
from pathlib import Path
from urllib.parse import urlparse, parse_qs

root = Path(__file__).resolve().parents[1] / 'docs/research/ux-20261103'
catalog = json.loads((root / 'catalog.json').read_text())
tips, videos = catalog['tips'], catalog['videos']
assert [t['id'] for t in tips] == [f'T{i:03}' for i in range(1, 101)]
assert [v['id'] for v in videos] == [f'V{i:03}' for i in range(1, 51)]
assert len({t['title_ar'] for t in tips}) == 100
video_ids = []
for video in videos:
    url = urlparse(video['url'])
    assert url.scheme == 'https' and url.netloc == 'www.youtube.com' and url.path == '/watch'
    video_ids.append(parse_qs(url.query)['v'][0])
    assert video.get('title') and video.get('source_ref')
    assert video['access_level'] in ['search_metadata', 'description', 'transcript']
    assert all(t in {x['id'] for x in tips} for t in video['related_tip_ids'])
assert len(set(video_ids)) == 50
for tip in tips:
    assert urlparse(tip['source_url']).scheme == 'https'
    assert tip['verification'] and tip['test_idea'] and tip['application_ar']

# Each disposition is a review decision about Rusukh, not a claim made by its source.
# new/existing = code implemented; validation below distinguishes tests from inspection.
rows = '''
1|new|تنقّل ثابت بخمس وجهات|App.tsx;tests/workspace.ui.test.jsx
2|new|الإضافة والبحث قبل الأقسام|src/StudyHome.tsx;tests/home.ui.test.jsx
3|existing|أسماء عربية مع الأيقونات|src/ui.tsx;App.tsx
4|existing|أزرار ظاهرة للوظائف الحالية|App.tsx;src/SourcesWorkbench.tsx
5|new|ترتيب افتراضي وثلاثة قوالب اختيارية|src/workspace.ts;tests/workspace.ui.test.jsx
6|partial|تعليمات داخل المحرر؛ لا تعليم تفاعلي لأول ربط|App.tsx
7|existing|الدخول مباشر بلا جولة إجبارية|App.tsx
8|new|تمييز الفراغ والتحميل وغياب النتائج|App.tsx;tests/workspace.ui.test.jsx
9|new|إنشاء مباشر من قسم الملاحظات الفارغ|src/StudyHome.tsx;tests/home.ui.test.jsx
10|pending|لا نسجل تاريخ الفتح؛ المعروض آخر تعديل|src/StudyHome.tsx
11|new|التصريح بأن البحث يشمل العنوان والمتن|App.tsx
12|new|مدخل بحث ظاهر في الرئيسية|src/StudyHome.tsx;tests/home.ui.test.jsx
13|not_applicable|البحث الحالي شامل؛ لا نطاق ضيق منفصل|src/sources.ts
14|partial|بحث الملاحظات مسمى؛ البحث داخل ملاحظة غير منفذ|App.tsx
15|existing|رسالة واضحة لغياب النتائج|App.tsx
16|existing|عبارة البحث تبقى في حالة التطبيق|App.tsx
17|existing|مسح البحث وإرشاد تقليل العبارة|App.tsx;tests/workspace.ui.test.jsx
18|new|إنشاء ملاحظة من الرئيسية والقائمة|src/StudyHome.tsx;App.tsx
19|pending|تنقل التالي بين الحقول يحتاج تنفيذًا|src/ui.tsx
20|new|عنوان تلقائي اختياري للمصدر؛ اليدوي محفوظ|src/SourcesWorkbench.tsx;tests/sources-workbench.ui.test.jsx
21|pending|قوالب محتوى الملاحظات غير قوالب ترتيب الواجهة|src/workspace.ts
22|partial|آخر تعديل ظاهر في الرئيسية؛ لا اقتراحات بحث خاصة|src/StudyHome.tsx
23|pending|الإنشاء باسم عبارة البحث غير منفذ|App.tsx
24|existing|المحرر نافذة فوق الصفحة الأصلية|App.tsx
25|device|احتفاظ القائمة بالموضع يحتاج قياسًا على الهاتف|App.tsx
26|pending|حفظ موضع القراءة بعد إعادة التشغيل غير منفذ|App.tsx
27|pending|قفز العناوين داخل الملاحظات الطويلة غير منفذ|App.tsx
28|pending|بحث داخل الملاحظة دون تحرير غير منفذ|App.tsx
29|pending|التنقل بين تطابقات النص غير منفذ|App.tsx
30|pending|مقتطف مطابق للبحث غير منفذ؛ الحالي بداية المتن|App.tsx
31|not_applicable|لا فئات أو لغة استعلام مخفية حاليًا|src/sources.ts
32|pending|فتح الملاحظة عند التطابق غير منفذ|App.tsx
33|partial|عرض حديث حسب التعديل؛ لا اختيار ترتيب للنتائج|src/StudyHome.tsx
34|new|خيارات التفريغ والنموذج تظهر عند الحاجة|src/SourcesWorkbench.tsx;src/AIWorkspace.tsx
35|new|كل الأدوات متاحة والإخفاء يخص الرئيسية|App.tsx;tests/workspace.ui.test.jsx
36|existing|الإجابة مخفية حتى طلب كشفها|App.tsx;tests/safety.ui.test.jsx
37|new|تعريف النسيان والصعوبة بوضوح|App.tsx
38|pending|وضع تقييم ثنائي يحتاج تجربة؛ لم نعتمده|App.tsx
39|existing|السؤال يبقى ظاهرًا بعد الكشف|App.tsx;tests/safety.ui.test.jsx
40|new|إرشاد فكرة واحدة لكل بطاقة|App.tsx
41|new|مثال لسؤال يحدد المطلوب|App.tsx
42|new|زر الملاحظة الأصلية أثناء المراجعة|App.tsx
43|new|إرشاد إبقاء الشرح الطويل في المصدر|App.tsx
44|pending|أمثلة تفسيرية متنوعة لم تضاف|App.tsx
45|existing|البطاقة مرتبطة بعنوان مصدر؛ يظهر بعد الكشف|App.tsx
46|pending|لا تأريخ تلقائي لحقائق متغيرة|src/types.ts
47|pending|تعديل بطاقة موجودة أثناء المراجعة غير منفذ|App.tsx
48|pending|تنبيه البطاقات المتعثرة غير منفذ|App.tsx
49|pending|تعليق البطاقات القابل للعكس غير منفذ|src/types.ts
50|partial|فتح المصدر متاح؛ اقتراحه بعد الأخطاء غير منفذ|App.tsx
51|pending|تأجيل بطاقة بعينها غير منفذ|src/core.ts
52|partial|التاريخ محفوظ؛ حد جلسة اختياري غير منفذ|src/storage.ts
53|existing|المراجعة تعرض المستحق فقط|src/core.ts;tests/core.test.cjs
54|partial|عداد المستحق موجود؛ الجديد ليس عدادًا مستقلًا|src/StudyHome.tsx
55|new|توضيح أن الاختبار لا يغير الجدول|App.tsx
56|partial|تصحيح السؤال الحالي موجود؛ ملخص كل الأخطاء غير منفذ|App.tsx
57|existing|منع تكرار الإجابة المطابقة في الخيارات|src/core.ts;tests/core.test.cjs
58|new|عنوان المصدر لا يكشف الجواب قبل طلبه|App.tsx;tests/safety.ui.test.jsx
59|existing|عدة بطاقات ترتبط بالملاحظة عبر noteId|src/types.ts;tests/storage.test.cjs
60|partial|الروابط داخل سياق المتن؛ لا إرشاد خاص لسبب العلاقة|src/core.ts
61|pending|مقتطف الروابط الواردة داخل الملاحظة غير منفذ|App.tsx
62|partial|قائمة علاقات نصية؛ لا تقسيم وارد وصادر كامل|src/KnowledgeGraph.tsx
63|pending|إنشاء الملاحظة من رابط مفقود غير منفذ|src/core.ts
64|pending|الأسماء البديلة بصيغة pipe غير مدعومة|src/core.ts
65|partial|بحث وصفحات للشبكة؛ لا شبكة محلية بعمق مختار|src/KnowledgeGraph.tsx
66|pending|مرشح الملاحظات اليتيمة غير منفذ|src/KnowledgeGraph.tsx
67|pending|عمق شبكة محلية غير منفذ|src/KnowledgeGraph.tsx
68|pending|قالب خريطة موضوع غير منفذ|App.tsx
69|partial|بحث وعدد وصفحات؛ لا مرشحات موضوعات|src/KnowledgeGraph.tsx;tests/graph.ui.test.jsx
70|pending|قائمة بطاقات تحتاج تحسينًا غير منفذة|src/types.ts
71|partial|الأفعال مسماة؛ مراجعة جميع أزرار الوسائط على الجهاز باقية|src/ui.tsx
72|device|استقلال الأزرار المركبة يحتاج VoiceOver|src/media/MediaCapturePanel.tsx
73|device|انتقال التركيز وإعادته يحتاج VoiceOver|src/WorkspaceEditor.tsx
74|device|التمرير والتفاف النص موجودان؛ أكبر خط لم يختبر على iOS|src/ui.tsx
75|existing|حالات النجاح والفشل نصية|src/useNoteDraft.ts;src/SourcesWorkbench.tsx
76|existing|الإجراءات الأساسية بأزرار ولا تتطلب إيماءة|src/media/MediaCapturePanel.tsx
77|device|ترتيب عربي برمجي؛ تدفق VoiceOver الأصلي غير مختبر|src/ui.tsx
78|device|النص المختلط يحتاج فحصًا على لوحة مفاتيح iOS|src/SourcesWorkbench.tsx
79|device|لم نعكس الصور؛ اتجاه الرموز الأصلية يحتاج فحصًا|src/ui.tsx
80|not_applicable|لا مفتاح لتبديل اتجاه التطبيق وقت التشغيل|src/ui.tsx
81|device|الزر الأساسي بحد 44 نقطة؛ الفصل الفعلي يحتاج لمسًا|src/ui.tsx
82|device|KeyboardAvoidingView موجود؛ لم تختبر لوحة الهاتف|App.tsx
83|existing|عناوين الحقول تبقى ظاهرة|src/ui.tsx;src/SourcesWorkbench.tsx
84|new|أخطاء المصدر قابلة للإصلاح مع بقاء المدخلات|src/SourcesWorkbench.tsx;tests/sources-workbench.ui.test.jsx
85|partial|PDF بلا نص معلن؛ OCR غير منفذ|src/pdf;src/SourcesWorkbench.tsx
86|existing|معاينة نص PDF قبل المسودة|src/SourcesWorkbench.tsx;tests/sources-workbench.ui.test.jsx
87|partial|لا حذف للأصل المختار؛ لا أرشيف مصادر PDF دائم داخل التطبيق|src/SourcesWorkbench.tsx
88|partial|تفريغ يقدمه المستخدم؛ الرابط مطلوب في مسار YouTube الحالي|src/SourcesWorkbench.tsx
89|new|اكتشاف الصيغة مع الإبقاء على التوقيتات|src/youtube.ts;tests/sources-workbench.ui.test.jsx
90|partial|أصل النص موضح؛ لا مقارنة نسخ أصلية ومصححة كاملة|src/SourcesWorkbench.tsx
91|device|حالات الصوت مختبرة بمحاكاة؛ الانقطاع الحقيقي باقٍ|src/media/AudioCaptureSession.ts
92|device|فصل السماعة وتزامن التشغيل لم يختبرا على الهاتف|src/media
93|device|الأذونات عند الحاجة؛ رفضها الحقيقي يحتاج جهازًا|src/media
94|existing|تمييز نقاط الاستعادة النصية عن نسخة الوسائط|App.tsx;src/backup
95|existing|معاينة الاستعادة وتأكيد الاستبدال|src/backup;tests/backup-app-integration.ui.test.jsx
96|partial|المشاركة لا تثبت الحفظ النهائي في Files|src/backup/PortableBackupPanel.tsx
97|existing|تلف النسخة والمسارات والأحجام والبصمات مفحوص|src/backup/portable.ts;tests/portable-backup.ui.test.jsx
98|partial|لا ادعاء تنزيل أو جاهزية؛ مدير تنزيل Expo غير منفذ|src/AIWorkspace.tsx;ai-lab/engine-entry.mjs
99|existing|نتيجة الذكاء مسودة مع فحص المصدر|src/ai/contracts.ts;tests/ai-workspace.ui.test.jsx
100|new|حماية اختيار النموذج وإلغاء العمليات الأقدم|ai-lab/engine-entry.mjs;ai-lab/engine-runtime.test.mjs
'''.strip().splitlines()
labels = {'new':'منفذ في 0.5.0','existing':'موجود سابقًا','partial':'جزئي','pending':'غير منفذ','device':'يحتاج اختبار الجهاز','not_applicable':'غير منطبق حاليًا'}
decisions = []
for row in rows:
    number, status, decision, evidence = row.split('|')
    tip = tips[int(number)-1]
    paths = evidence.split(';')
    assert all((root.parents[2]/path).exists() for path in paths), paths
    decisions.append({'id':tip['id'], 'decision_ar':decision, 'status':status, 'status_ar':labels[status],
        'evidence_paths':paths, 'verification_ar':'اختبار آلي مرتبط؛ ليس إثبات جهاز' if any('test' in x for x in paths) else 'فحص المصدر أو بند غير منفذ؛ لا ادعاء اختبار آلي خاص',
        'source_url':tip['source_url'], 'source_title':tip['source_title'], 'acceptance_test':tip['test_idea']})
assert len(decisions) == 100 and len({d['id'] for d in decisions}) == 100
(root/'decisions.json').write_text(json.dumps(decisions,ensure_ascii=False,indent=2)+'\n')
counts = Counter(d['status_ar'] for d in decisions)
lines = ['# سجل القرارات المختصر — رُسوخ 0.5.0','',
    '100 توصية + 50 رابط فيديو + ملحق 36 قرار مقارنة للدورات. لا نساوي وجود التوصية بتنفيذها.','',
    'حالة التنفيذ مبنية على الكود والاختبارات المسجلة. كل اختبار آلي هنا يظل منفصلًا عن تجربة الآيفون.', '',
    ' · '.join(f'{key}: {value}' for key,value in counts.items()), '',
    'القرارات الموسعة والمصدر واختبار القبول: [decisions.json](decisions.json). قائمة البحث الأصلية: [catalog.json](catalog.json).', '']
for d in decisions:
    lines.append(f"- **{d['id']} · {d['status_ar']}**: {d['decision_ar']}. [مصدر]({d['source_url']})")
lines += ['', '## المقاطع الخمسون', '',
    '22 وصفًا مفهرسًا من صفحات الفيديو و28 نتيجة بيانات بحث؛ لم نشاهد هذه المقاطع ولم نقرأ تفريغها الكامل. نصوص Apple المقروءة مفصلة في ملحق الدورات. العناوين وحدها لا تُستخدم دليلًا تقنيًا.', '']
for v in videos:
    access = 'وصف الناشر' if v['access_level']=='description' else 'بيانات بحث فقط'
    lines.append(f"- {v['id']} · [{v['title']}]({v['url']}) — {access}.")
lines += ['', '## ملحق الصورة وبقية الطلبات', '',
    '- [36 قرارًا ومقارنة Expo وSwiftUI](ios-courses.md).',
    '- [كل ما بقي من طلبات التسليم](DELIVERY_GAPS.md).',
    '- [تقرير الإصدار والاختبارات](../../../RELEASE_0.5.0.md).',
    '- [خطة التنفيذ](../../superpowers/plans/2026-11-03-usability.md).',
    '', 'استُبعدت أربعة ترشيحات فيديو ضعيفة التوثيق من القائمة النهائية واستُبدلت بأوصاف دروس بامبرمج من دورة الصورة؛ محفوظة في excluded_video_candidates للتدقيق.']
(root/'DECISIONS.md').write_text('\n'.join(lines)+'\n')
validation = {'tips':100,'videos':50,'unique_video_ids':len(set(video_ids)),
    'video_access':dict(Counter(v['access_level'] for v in videos)), 'decision_statuses':dict(counts),
    'source_urls':len(catalog['sources']), 'limits':'Counts and schema validation; not proof of video viewing, content completeness or device behavior.'}
(root/'validation.json').write_text(json.dumps(validation,ensure_ascii=False,indent=2)+'\n')
course = json.loads((root/'ios-courses.json').read_text())
payload = json.dumps({'tips':decisions,'videos':videos,'courses':course['decisions']},ensure_ascii=False).replace('<','\\u003c')
(root/'decisions.html').write_text((root/'report-template.html').read_text().replace('__REPORT_DATA__',payload))
print(json.dumps(validation,ensure_ascii=False))
