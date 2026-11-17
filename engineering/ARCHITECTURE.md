# ARCHITECTURE.md — معمارية رُسوخ

**تاريخ:** 2026-11-17  
**الفرع:** engineering/audit-phase1

## المعمارية الحالية

```
RusukhNative (iOS 26+)
├── App/                          # SwiftUI Views + LibraryStore
│   ├── RusukhNativeApp.swift
│   ├── HomeView.swift
│   ├── NotesView.swift
│   ├── ReviewView.swift
│   ├── GraphView.swift
│   ├── LocalAIView.swift
│   ├── ArabicModel*.swift
│   └── LibraryStore.swift      # الحالة المركزية + التخزين
├── Sources/RusukhCore/            # منطق الأعمال المستقل
│   ├── StudyModels.swift
│   ├── StudyEngine.swift       # بحث، روابط، SM-2 القديم
│   ├── ReviewScheduler.swift   # FSRS + الجدولة
│   ├── StudyRepository.swift   # JSON ذري
│   └── PDFTextImport.swift
├── Tests/ + AppTests/ + UITests/
└── docs/
```

**التقييم:** فصل جيد بين المنطق والواجهة. LibraryStore هو نقطة التراكز الرئيسية. الذكاء مخلوط بالواجهة حاليًا.

## المعمارية المقترحة (تدريجية)

لا نُنشئ وحدات فارغة. نُفصل فقط ما يثبت الحاجة إليه:

```
Core                    # نماذج، أخطاء، تسجيل
StudyEngine             # البحث، الروابط، المجدولة (FSRS + قديم)
Storage                 # مستودع مجرد (حاليًا JSON، لاحقًا GRDB)
AIEngine                # طبقة مزود مستقلة (Apple FM / MLX / مستقبلي)
Conversation            # المحادثات والسياق والأدوات
MCPBridge               # الأدوات والصلاحيات (مستقلة عن الواجهة)
DesignSystem            # الألوان، الخطوط، المكونات (عند الحاجة)
```

**مبادئ:**
- فصل الواجهة عن منطق الأعمال.
- فصل الذكاء الاصطناعي عن بقية التطبيق.
- فصل MCP عن مزود الذكاء وعن الواجهة.
- لا تهجير جماعي. الترحيل التدريجي فقط مع إثبات.

## القرارات المرفوضة حاليًا
- عدم إدخال GRDB في نفس دفعة FSRS (موثّق في OPEN_SOURCE_MAP).
- عدم اعتماد التطبيق على ChatGPT للعمل.
- عدم إرسال البيانات للخارج دون موافقة صريحة.

## الخطوة التالية
إنشاء `AI_ARCHITECTURE.md` و`MCP_ARCHITECTURE.md` مع تحديد الواجهات المقترحة قبل أي تنفيذ.
