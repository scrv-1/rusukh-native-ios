# تقرير استلام رُسوخ — 15 نوفمبر 2026

هذا تقرير فحص فقط. لم يُضف تطبيق بديل، ولم يُحذف ملف، ولم يُدمج فرع، ولم يُعدَّل كود المنتج. الملف الوحيد المقصود في هذا الفرع هو هذا التقرير.

تاريخ الفحص على هذه البيئة: 15 نوفمبر 2026. النظام: Linux x86_64، Node v22.23.4، npm 10.9.9. لا يوجد `swift` ولا `xcodebuild`.

## الحكم المختصر

المستودع التنفيذي الوحيد الظاهر هو `scrv-1/rusukh-native-ios`. فرع `main` عند `503b801612ea916ab13c78af473ca07eb0bd6590` تطبيق SwiftUI مدموج، وآخر دفع له في سجل GitHub هو 1 نوفمبر 2026. تطبيق Expo القابل للتشغيل والاختبار هنا يعيش في `expo-preview/` على `work/expo-study-flow-20261103` عند `4f8b4e908aa694b35e91c25c6c1a07d95ca518e6` (3 نوفمبر 2026)، الإصدار 0.5.2، Expo 58.0.22 المثبّت، React Native 0.88.1.

هذا الفرع سليل مباشر لـ `main`: صفر التزامات على `main` ليست فيه، و20 التزامًا فوقه. `git merge-base --is-ancestor` نجح، فالدمج إلى `main` fast-forward من ناحية Git. لم يُدمج. فوقه مسودتان مفتوحتان تتباعدان: الحارس `acc0d603db07c90c175797d369f55be12225fab6` وسياق المراجعة `be9d48809d301e7c12f8ca97de8d36cb34010582`. دمجهما معًا نظيف حسب `git merge-tree --write-tree` (رمز الخروج 0)، ودمجهما مع `work/safe-import-20261101` ليس نظيفًا.

التوصية: خط المنتج القريب هو Expo على فرع الدراسة، لأنه الوحيد الذي نُفّذت اختباراته هنا ويناسب التجربة من المتصفح نحو Expo Go. SwiftUI على `main` يبقى مرجع FSRS-6 والبناء على Mac، وهو ليس نسخة iPhone مثبّتة، وليس فيه ميزات Expo اللاحقة. لا يُعامل نجاح البناء أو نجاح الاختبارات على Linux كدليل تشغيل على iPhone.

## فصل الأدلة

### تم فحصه أو تشغيله هنا

- قراءة شجرة `main` المحلية وكل الفروع البعيدة في `rusukh-native-ios` (18 فرعًا بعيدًا).
- GitHub API لحساب `scrv-1`: المستودع الخاص ظاهر بصلاحية admin. `open_issues_count` = 8.
- بحث القضايا `repo:scrv-1/rusukh-native-ios is:open` مع فرض الأداة `is:issue`: النتيجة 0. القضايا الثماني المفتوحة في العداد هي طلبات دمج مسودة، وليست قضايا منتج مستقلة.
- تثبيت `npm ci` داخل worktree منفصل عند الالتزام `4f8b4e9`: 1058 حزمة، رمز الخروج 0.
- `npx tsc --noEmit`: رمز الخروج 0، بلا مخرجات أخطاء.
- `npm test`: 137 ناجح، 0 فاشل، 0 متخطى. المدة 1060.9 ms.
- `npm run test:ui`: 30 مجموعة، 332 اختبارًا ناجحًا، 0 لقطات، 17.222 ثانية.
- `npx expo export --platform ios`: نجح. 915 وحدة، حزمة Hermes حجمها 47 579 440 بايت.
- `npx expo install --check`: رمز الخروج 1. الحزم المقفلة أقدم من نطاق Expo 58 الحالي.
- إعادة إنتاج حدود النسخ الاحتياطي على `scheduleReview` في `expo-preview/src/core.ts` بأمر Node مباشر.
- فحص أسرار عبر `git log --all -S` وعلى ملفات الشجرتين، مع استثناء `node_modules`.
- قراءة `scrv-1/rusukh-ios` عبر GitHub API فقط: الشجرة، `package.json`، `App.tsx`، `dev.mjs`، `app.json`، `README.md`، الالتزامات والفروع.
- قراءة عناوين ملفات المهارات الثلاثة من GitHub العام، ورؤوس `SKILL.md` ذات الصلة. لم تُثبَّت.

### لم يُختبر

- أي مسار على iPhone حقيقي، أو Expo Go، أو محاكي iOS.
- `npm test` داخل `expo-preview/ai-lab` (حزمة بناء منفصلة لـ wllama، وليست ضمن سكربت الاختبار الجذري).
- Jest أو اختبارات Node على فرعي `fix/expo-guardrails-20261103` و`work/audit-context-20261103`. الإصلاح المذكور في المسودة 14 قُرئ من الفرق ولم يُعاد تشغيله.
- `eas build` و`testflight`. لا حساب بناء ولا توقيع.
- قياس ذاكرة أو بطارية أو زمن إطار على جهاز.
- VoiceOver، والوضع الداكن، واتجاه RTL على واجهة iOS حقيقية.
- استخراج PDF أو تسجيل صوت أو تنزيل نموذج على جهاز.
- إعادة تشغيل GitHub Actions. آخر تشغيل ناجح ليس على رأس فرع Expo ولا على رأس `main`.

### تعذر، والسبب

- `scrv-1/rusukh`: GitHub يجيب `scm_repo_not_accessible`. المستودعات الظاهرة للحساب هي `rusukh-native-ios` و`rusukh-ios` فقط. `git clone` أعاد `Repository not found`. المستودع المذكور في الموجز غير موجود أو غير ممنوح لهذه الصلة.
- `scrv-1/rusukh-ios`: القراءة عبر API نجحت، والاستنساخ عبر Git فشل بـ `Repository not found` حتى مع اعتماد هذه البيئة. الاعتماد مخوّل لـ `rusukh-native-ios` وليس لنسخ المستودع الآخر. المقارنة أدناه من API، لا من نسخة عمل محلية.
- بناء SwiftUI أو تشغيل `swift test`: الأمران `swift` و`xcodebuild` غير موجودين. الهدف في `project.yml` هو iOS 26.0 وعلى مشغّل Actions اسمه `xcode-27`. هذه البيئة Linux.
- لا يمكن من هذا الفحص إثبات أن حزمة موقّعة تُفتح على iPhone المستخدم. نجاح التصدير يثبت أن Metro أنتج حزمة Hermes فقط.

## 1. المستودعات

| المستودع | الوصول | ما هو |
| --- | --- | --- |
| `scrv-1/rusukh-native-ios` | API وقراءة وكتابة Git. خاص. اللغة المسجّلة Swift. الفرع الافتراضي `main`. دُفع `2026-11-03T11:21:00Z`. الحجم 39006. | المستودع الذي نُفّذ عليه الفحص |
| `scrv-1/rusukh` | غير مرئي | لا يُستخدم كمصدر |
| `scrv-1/rusukh-ios` | API فقط. خاص. اللغة TypeScript. `pushed_at` = `2026-10-29T21:56:04Z` | نموذج Expo أولي 0.1.0، ليس المنتج |

`rusukh-ios` على `main` هو `4827def962b646dd7a77903c36f2be81364e4f0f` بتاريخ 2026-10-29: «Create fresh Arabic Expo iOS starter». فرع `fahad-control/verification-20261030` عند `d44abc564a1d76d3576c3a81072b285d694753a0` بنفس وقت آخر دفع، ورسالته حذف ملف فحص اتصال، وشجرته تساوي شجرة `main` (`90a2534ea95c3aa4578091fd7c667f5e7433baea`). الإصدار في `package.json` هو 0.1.0. الاعتماديات: `expo ~58.0.21`، `react-native 0.88.1`، `react 19.3.0`، `@react-native-async-storage/async-storage 2.2.0`، `@expo/ngrok ^4.1.3`. السكربت `dev` يشغّل `dev.mjs`، وهو يفتح `npx expo start --go --tunnel` ويحاول fast-forward من `origin/main` كل 15 ثانية. `README` يقول صراحة إن الدفع إلى GitHub لا يكفي وإن العملية يجب أن تبقى تعمل، وإن اختبار الآيفون لم يُنفَّذ. الشاشة: ملاحظة محلية وبطاقتان ثابتتان في الكود. هذا سلف تاريخي، لا مصدر تنفيذي.

## 2. الفروع والالتزامات وطلبات الدمج

رأس `main`: `503b801612ea916ab13c78af473ca07eb0bd6590` — «Record PR 4 merge and preserve verification screenshot» — 1 نوفمبر 2026. لا مجلد `expo-preview` على هذا الالتزام.

رأس الدراسة: `4f8b4e908aa694b35e91c25c6c1a07d95ca518e6`. `git rev-list --left-right --count origin/main...origin/work/expo-study-flow-20261103` أعطى `0 20`.

التزامات الدراسة العشرون فوق `main`، من الأحدث:

- `4f8b4e9` Attach published PR evidence for the 0.5.2 release
- `11de1dc` Record 0.5.2 verification and draft PR delivery
- `a1ec9eb` Make study capture recoverable and simplify the Expo study flow
- `54230d4` Record pushed preview and product-audit delivery
- `ad86e57` Start with an empty workspace and fix audit-confirmed study defects
- `2486ae1` Checkpoint tested Expo usability work for 0.5.0
- `93f5adb` Refresh Expo Go trial link and record live verification
- `5d84e3c` Protect delayed imports and runtime ownership for Expo 0.4.2
- `c1aad7f` Keep Expo version metadata consistent and record final verification
- `249153f` Fix wiki parsing and quiz selection; add recoverable media backups
- `141fcdf` Clarify final CI result and copyable Expo trial URL
- `b8beca1` Record successful native CI 22 and physical-device trial steps
- `dc5e1d4` Remove quadratic graph scans and record stress-test evidence
- `0d7b1a0` Add local study sources, media, reminders and experimental offline AI to Expo preview
- `13057ff` Disambiguate nested iOS backup confirmation buttons in UI test
- `7d97e01` Restore safe backup workflows and harden native AI and PDF drafts
- `6cee980` Document SVG browser warnings and scope of device verification
- `6eb5967` Improve student workspace, recover drafts, and protect note relationships
- `c376723` Add customizable Expo workspace and safe text source import
- `aa2339d` Add verified Expo SDK 58 preview source

كل فروع Expo (`expo-preview` حتى `expo-usability` و`audit-context` و`expo-guardrails`) سليلة لـ `main` أيضًا: العدّاد الأيسر صفر. فروع Swift الأقدم (`native-foundation` و`native-media` و`native-local-ai` و`native-reliability` و`fsrs-integration`) مدموجة في تاريخ `main` أو متخلفة عنه. `work/safe-import-20261101` عند `73f2e51ec9d5e410c6a5f098c20ac0b88f24c6f0` متقدم 11 التزامًا عن `main` ومتباعد عن خط Expo. `work/local-ai-eval-20261101` متباعد: 62 خلفًا و12 أمامًا. `chatgpt-connector-probe-20261103` تجربة موصل، 3 التزامات فوق `main`، بلا `expo-preview`.

طلبات الدمج من API، الصفحة الكاملة 13 طلبًا:

| الرقم | الحالة | من | إلى | الرأس |
| --- | --- | --- | --- | --- |
| 14 | مسودة مفتوحة | `work/audit-context-20261103` | فرع الدراسة | `be9d48809d301e7c12f8ca97de8d36cb34010582` |
| 13 | مسودة مفتوحة | `fix/expo-guardrails-20261103` | فرع الدراسة | `acc0d603db07c90c175797d369f55be12225fab6` |
| 11 | مغلقة غير مدموجة | `chatgpt-connector-probe-20261103` | `main` | فحص موصل |
| 10 | مسودة مفتوحة | فرع الدراسة | `work/expo-usability-20261103` | `4f8b4e9` |
| 9 إلى 6 | مسودات مفتوحة مكدسة | فروع Expo الأقدم | الفرع السابق أو `main` | حتى 0.4.2 و0.4.1 ومصادر الدراسة |
| 5 | مسودة مفتوحة | `work/safe-import-20261101` | `main` | `73f2e51` |
| 4 | مدموج 2026-11-01 | FSRS والصوت | `main` | |
| 3 و2 و1 | مدموجة 31 أكتوبر | ذكاء محلي، وسائط، أساس عربي | `main` | |

قضية واحدة مغلقة رقم 12 بعنوان فحص موصل، أُغلقت في 3 نوفمبر. لا قضايا منتج مفتوحة.

قابلية الدمج التي قيست:

- Expo الدراسة إلى `main`: fast-forward، بلا التزامات مانعة.
- `safe-import` مع فرع الدراسة: `git merge-tree --write-tree` خرج 1. التعارضان `add/add` في `UITests/BackupUITests.swift` و`docs/SAFE_IMPORT_SOURCE_SHA256.txt`.
- فرع الحارس مع فرع المراجعة: `merge-tree --write-tree` خرج 0. النظافة النصية لا تعني أن المسودتين مراجعتان أو أن اختباراتهما أُعيدت هنا.

`audit-context` يزيد التزامين فوق الدراسة: `2aa51bb8ebb4349c41f52491d30e88022111cb0d` ثم `be9d488`. الحارس يزيد سبعة التزامات، منها منع نشر حزم iOS إذا فشل فحص لاحق، ورفض تفريغ أكبر من 1 MiB عندما لا يرسل المنتقي حجمًا.

## 3. أي شجرة هي المصدر التنفيذي

يوجد اليوم ثلاثة مستويات، ويجب عدم خلطها:

1. **ما يُستنسخ افتراضيًا:** `main` = SwiftUI فقط. التبويبات في `App/RusukhNativeApp.swift`: الرئيسية، الملاحظات، المراجعة، الشبكة، ذكاء محلي. هذا هو المصدر المدموج، وهو متخلف عن منتج Expo.
2. **ما يمكن تشغيل اختباراته وتصدير حزمته على Linux:** `expo-preview` عند `4f8b4e9`. هذه شجرة المنتج الطلابي الأغنى، وهي غير مدموجة.
3. **Swift على فرع الدراسة نفسه** يضيف نسخًا احتياطيًا أوضح من `main` (`App/BackupSettingsView.swift` و`Sources/RusukhCore/StudyImport.swift` وغيرهما: 25 ملفًا، +2181 −118 عن `main`). هذا الكود كان داخل الالتزام `13057ffd60a2c4e6f969b49eda6b607bff3b8e72` الذي نجح عليه Actions في 2 نوفمبر. الفرق في `App/` و`Sources/` بين ذلك الالتزام ورأس `4f8b4e9` فارغ. أي أن Swift على خط Expo مبني على Mac مرة، ثم تقدمت واجهة Expo بلا تشغيل Mac جديد على الرأس.

`main` بعد آخر نجاح Actions لتطبيق FSRS (`07784236eb9d13fc77092fc8713f4ca31727f666`، التشغيل `41301469379`) يختلف في التوثيق و`Tests/ReviewSchedulerStressTests.swift` وسطر في سير العمل، ولا يختلف في `App/` أو `Sources/`. اختبار الضغط على Linux أُضيف بعد ذلك التشغيل، فلم يكن جزءًا من Run 18.

## 4. إعداد Expo

من `expo-preview/package.json` و`app.json` و`eas.json` عند `4f8b4e9`:

- الاسم `rusukh-ios`، الإصدار 0.5.2، `userInterfaceStyle: automatic`، `bundleIdentifier: app.rusukh.study`، `buildNumber: 1`، الهاتف فقط (`supportsTablet: false`).
- الاعتماديات المعلنة: Expo `~58.0.0`، React 19.3.0، RN 0.88.1، `expo-sqlite ~58.0.14`، `expo-audio`، `expo-document-picker`، `expo-file-system`، `expo-image-picker`، `expo-notifications`، `expo-sharing`، `expo-symbols`، `react-native-svg 15.16.0`، `react-native-webview 14.0.1`.
- المثبَّت من القفل بعد `npm ci`: Expo 58.0.22، RN 0.88.1، expo-sqlite 58.0.15.
- محرك Expo المثبّت يطلب Node `^22.13.0 || ^24.3.0 || ^26 || >=27`. البيئة حققت 22.23.4.
- سكربتات: `test` = tsc ثم `node --test tests/*.test.cjs`، `test:ui` = Jest، `typecheck`، `check` = `expo install --check`، `build:ios` = `eas build`. لا سكربت lint ولا ملف ESLint في جذر المعاينة.
- `eas.json` فيه `preview` داخلي و`production` مع `autoIncrement`. لا أثر تشغيل EAS في هذا الفحص.
- `start-codespaces.sh` يثبت `@expo/ngrok` ثم يشغّل `npx expo start --tunnel` بعد `npx expo login`. هذه قناة تجربة، وهي تربط فتح الواجهة بعملية حية وحساب Expo.

`npx expo install --check` في 15 نوفمبر 2026، المقطع الحرفي:

```
The following packages should be updated for best compatibility with the installed expo version:
  expo@58.0.22 - expected version: ~58.0.25
  expo-asset@58.0.19 - expected version: ~58.0.21
  expo-audio@58.0.11 - expected version: ~58.0.12
  expo-document-picker@58.0.4 - expected version: ~58.0.5
  expo-font@58.0.11 - expected version: ~58.0.12
  expo-notifications@58.1.7 - expected version: ~58.1.9
  expo-sharing@58.0.21 - expected version: ~58.0.23
  expo-sqlite@58.0.15 - expected version: ~58.0.17
  expo-symbols@58.0.4 - expected version: ~58.0.5
  react-native-safe-area-context@5.10.1 - expected version: ~5.11.1
  jest-expo@58.0.13 - expected version: ~58.0.14
Found outdated dependencies
```

رمز الخروج 1. لم تُحدَّث الحزم في هذا الاستلام.

## 5. إعداد SwiftUI

- `Package.swift`: أدوات 6.2، FSRS مثبت عند `4fbaf20184d62f82a9f44f343337c61a2c5483e9`، منصة iOS 26.
- `project.yml`: `IPHONEOS_DEPLOYMENT_TARGET` = 26.0، عائلة الجهاز 1 (iPhone)، `DEVELOPMENT_TEAM` فارغ، توقيع الاختبارات مطفأ. حزم MLX 0.32.3 وMLXLM 3.32.3 وswift-transformers 1.3.0.
- `xtool.yml` و`scripts/build-xtool.sh` موجودان للبناء غير الموقّع. واجهة الإعدادات على `main` تقول إن التجربة بلا عضوية مدفوعة قد تحتاج إعادة توقيع كل 7 أيام.
- سير العمل الوحيد: `.github/workflows/ios-unsigned.yml`، الاسم «iOS - SwiftUI build and simulator preview»، التشغيل `workflow_dispatch` فقط. لا يعمل تلقائيًا عند الدفع. المشغّل `xcode-27`. ينفّذ `swift test` ثم XcodeGen ثم محاكيًا وحزمة جهاز غير موقعة وxtool 1.24.0 واختبارات واجهة واستدلال Swift مع `sandbox-exec` ورفض الشبكة.

## 6. GitHub Actions كما سجّلها API

سير عمل واحد، `total_count` للتشغيلات = 22. لا تشغيل على `4f8b4e9` ولا على `503b801`.

أحدث نجاح: التشغيل `41497312983` في `2026-11-02T18:05:57Z`، الفرع `work/expo-local-study-20261102`، الالتزام `13057ffd60a2c4e6f969b49eda6b607bff3b8e72`. المهمة «Test, build and launch SwiftUI» نجحت من 18:06:03 إلى 18:32:07 UTC على `xcode-27`. خطوات النجاح تشمل Test core logic، بناء المحاكي، بناء الجهاز غير الموقّع، تشغيل المحاكي، xtool، اختبار الواجهة العربية، والتحقق من الاستدلال على Mac مع الشبكة مرفوضة. مهمة تقييم النموذج المنفصلة كانت `skipped`. الرابط: `https://github.com/scrv-1/rusukh-native-ios/actions/runs/41497312983`.

هذا النجاح أقدم من رأس Expo بسبعة التزامات واجهة/توثيق، وهو ليس على `main`.

نجاح FSRS الذي يشير إليه `README` على `main`: التشغيل `41301469379`، الالتزام `07784236eb9d13fc77092fc8713f4ca31727f666`. آخر نجاح على فرع `main` نفسه أقدم: التشغيل `41236553179` والالتزام `d617221376c8ea05b5814d6593292288a01f8710` في 31 أكتوبر، قبل دمج FSRS.

فشل مبكر على `main`: التشغيل `41236155202`، الالتزام `78b7d0a74f7440dd9c1abd06b6451af860a9252e`. اختبار النواة وبناء المحاكي والجهاز نجحوا، ثم فشلت خطوة «Launch simulator and capture preview». لم يُنزَّل سجل الخطوة الكامل في هذا الفحص؛ الاستنتاج من كائن المهمة في API.

على فرع الدراسة ما زال رفع حزمة المحاكي وIPA والجهاز وxtool مشروطًا بـ `if: always() && steps.<id>.outcome == 'success'`. معنى ذلك أن فشل خطوة لاحقة لا يمنع نشر حزمة نجحت مبكرًا. المسودة 13 تغيّر الشرط إلى `success() && ...`. الفرق مقروء بين `4f8b4e9` و`acc0d60`. لم يُشغَّل السير بعد التعديل.

## 7. نتائج الاختبار والتصدير

بيئة التشغيل: worktree منفصل عند `4f8b4e908aa694b35e91c25c6c1a07d95ca518e6`، المسار المؤقت `expo-preview`، `npm ci` رمزه 0.

### فحص الأنواع

`npx tsc --noEmit --pretty false` → رمز 0، بلا أسطر أخطاء.

### اختبارات النواة

الأمر: `tsc -p tsconfig.test.json && node --test tests/*.test.cjs`.

مقطع النهاية الحرفي:

```
1..137
# tests 137
# suites 0
# pass 137
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 1060.93945
```

ظهر تحذير Node: `ExperimentalWarning: SQLite is an experimental feature`. الاختبارات نجحت مع التحذير. من بين الحالات: مخطط فارغ عند أول فتح، إبقاء المكتبة القديمة، حدود النسخ، روابط ويكي، درجات المراجعة، استيراد PDF والنصوص، ويوتيوب، ومساحة العمل.

### Jest

```
Test Suites: 30 passed, 30 total
Tests:       332 passed, 332 total
Snapshots:   0 total
Time:        17.222 s
Ran all test suites.
```

Jest أنهى العملية قسرًا بعد النجاح (`Force exiting Jest`). لا فشل. المجموع المنفَّذ هنا: 137 + 332 = 469. رقم 501 المذكور في نص المسودة 10 (137 + 332 + 32 عقد ذكاء) لم يُعد إنتاجه كأمر واحد؛ عقود الواجهة داخل Jest شُغّلت، وحزمة `ai-lab` لم تُشغَّل.

### لا lint

لا سكربت ولا إعداد ESLint. الغياب مسجّل، وليس فشل أداة.

### تصدير iOS

`npx expo export --platform ios --output-dir /tmp/expo-ios-export` رمزه 0. المقطع:

```
iOS Bundled 10869ms node_modules/expo/AppEntry.js (915 modules)
› ios bundles (2):
_expo/static/js/ios/AppEntry-5137e905f2fca93f8d9940061f73a0ce.hbc (48MB)
```

الحجم بالبايت 47 579 440. `metadata.json` يشير إلى الحزمة نفسها و`assets: []`. التصدير لا يثبّت التطبيق ولا يفتحه.

### إعادة إنتاج عيب النسخ

على بطاقة عند سقف المدقق (`intervalDays` 365000، `repetitions` 100000، `ease` 3) أعاد `scheduleReview` في `src/core.ts`:

```
{"grade":"again","intervalDays":0,"repetitions":0,"ease":2.8,"valid":true}
{"grade":"hard","intervalDays":438000,"repetitions":100001,"ease":2.85,"valid":false}
{"grade":"good","intervalDays":1095000,"repetitions":100001,"ease":3,"valid":false}
{"grade":"easy","intervalDays":1423500,"repetitions":100001,"ease":3,"valid":false}
```

`validateBackup` يرفض `intervalDays > 365000` أو `repetitions > 100000`. مراجعة قانونية عند الحد تنتج بطاقة ترفضها النسخة نفسها. الالتزام `2aa51bb` على المسودة 14 يقص القيم بـ `Math.min` إلى السقفين. لم أُعد تشغيل اختبارات ذلك الالتزام.

## 8. الميزات مقابل قائمة الموجز

الحكم «يعمل» هنا يعني: الكود مربوط بسلوك، والاختبارات الحالية غطت المنطق حيث ذُكر. لا يعني تشغيلًا على iPhone.

| الميزة | Expo عند `4f8b4e9` | SwiftUI على `main` `503b801` | Swift على فرع الدراسة |
| --- | --- | --- | --- |
| ملاحظات وتنظيم | يعمل في الكود: SQLite `rusukh-v1.db`، مسودات، روابط ويكي. اختبارات النواة وJest | يعمل في الكود: ملف JSON عبر `LibraryStore`، بحث عربي في الاختبارات التاريخية | نفس أساس `main` مع تعديلات استيراد |
| رسم المعرفة | يعمل: `KnowledgeGraph.tsx`، صفحات وتكبير، اختبارات واجهة | يعمل: `GraphView.swift` وعلاقات من `StudyEngine` | لم يتغير الرسم عن `main` في فرق `App/GraphView.swift` |
| بطاقات | إنشاء وتعديل مع إبقاء الجدول. مغطى باختبارات | إنشاء من المحرر ومن أزواج السؤال والجواب | نفسه مع مسار النسخ الجديد |
| اختيار من متعدد | الدالة `makeQuiz` موجودة وموسومة `@deprecated`. واجهة «اختبار سريع» تفتح `StudyQuiz` وهو استرجاع ذاتي ولا يغيّر المواعيد. الزر يعمل، والمنتج ليس MCQ | `ReviewView` يفتح اختبار خيارات من `StudyEngine.quiz` | الاختبار القديم ما زال في مسار المراجعة |
| FSRS | غير موجود. `scheduleReview` جدول شبيه بـ SM-2: ease بين 1.3 و3، وأول «جيد» يوم ثم 3 أيام، و«مرة أخرى» بعد 10 دقائق | FSRS-6 للبطاقات الجديدة فقط عبر `ReviewScheduler.swift` وأوزان 21. البطاقات القديمة تبقى على المجدول السابق. `StudyEngine.swift` ما زال يصرّح أن فيه مجدولًا مبسطًا وليس FSRS، والاختبار يستخدمه للاختيار من متعدد والرسم | FSRS كما في `main`؛ فرق الجدولة غير داخل فرق هذا الفرع |
| PDF | WebView وpdf.js، حد 10 MiB، نصوص فقط. اختبارات `pdf.test.cjs` ضمن الـ 137. الملفات الممسوحة في fixtures تعني أن الصورة بلا طبقة نص تبقى بلا استخراج مفيد | `PDFTextImport.swift` وزر في الملاحظات | اختبارات مسودة إضافية و`PDFImportDraftTests.swift` |
| كتب | لا استيراد كتاب منظم. النص والويكي ويوتيوب (تفريغ يلصقه الطالب) وPDF نصي | لا مسار كتب مستقل | لا |
| مساعد ذكاء | WebView + wllama 3.8.1 مضمّن في سلسلة HTML حجمها 21 861 949 بايت. النموذج المرجعي Qwen3-0.6B-Q8_0.gguf بحجم 639 446 688 بايت يُفتح رابط تنزيله من Hugging Face. الواجهة تقول إن Expo Go تجريبي ولم يُختبر على آيفون المستخدم | MLX اختياري، زر «تنزيل النموذج — 2.28GB». CI شغّل استدلالًا على Mac مع الشبكة مرفوضة، لا على iPhone | `AppleModelController.swift` لإلغاء التوليد. آخر CI على `13057ff` شمل خطوة Mac |
| وضع المعلم والطلاب | غير موجود في `src/` | غير موجود في `App/` و`Sources/` | غير موجود |
| تحليل قوة وضعف وتحسن | جلسة التدريب تعرض «تذكرت / لم أتذكر» لهذه الجلسة فقط. لا سلسلة زمنية ولا ملف طالب | لا شاشة تحليل | لا |
| بحث محلي | `matchesSearch` مع تطبيع عربي، مغطى باختبار | `StudyEngine.matches` | نفسه |
| نسخ واستعادة | JSON حتى 15 MiB، 3 نقاط رجوع داخل SQLite، مجلد محمول حتى 512 MiB. لقطة إنقاذ SQLite صريحة: لا تستورد داخل التطبيق وتستثني الوسائط | تصدير JSON غير مشفّر. الزر «استيراد نسخة — يستبدل كل البيانات» يستدعي `importFromFile` بعد حوار تأكيد، بلا نقطة رجوع | معاينة ودمج محافظ ونقاط رجوع في `BackupSettingsView`، مبني في CI `13057ff`، غير مدموج في `main` |
| تذكير | إشعار محلي عبر `expo-notifications`. التعليق في `expoGateway.ts`: بلا رمز دفع وبلا خدمة بعيدة. في Expo Go الإشعار يتبع تطبيق Expo Go | `ReviewReminderView` محلي | موجود |
| صوت وصورة | التقاط محلي، اختبارات Jest للجلسة | `VoiceAttachment` وAVFoundation، اختبارات واجهة على Mac في Run 18 | موجود |

أزرار Expo التي فُتحت في القراءة مربوطة بـ `onPress` حقيقي (حفظ، مراجعة، رسم، مصادر، ذكاء، مظهر، استعادة). الزر المضلل وظيفيًا هو «ابدأ الاختبار»: ينفّذ تدريبًا ذاتيًا لا اختيارًا من متعدد. على Swift في `main` الأزرار المقروءة مربوطة؛ زر الاستيراد يعمل وينفّذ استبدالًا خطرًا.

`rusukh-ios` 0.1.0: ملاحظة واحدة في AsyncStorage وبطاقتان ثابتتان. لا رسم، لا FSRS، لا PDF، لا معلم، لا تحليل، لا بحث، لا نسخ. التشغيل المقصود عبر نفق ngrok.

## 9. الأداء

لم يُقاس على جهاز. الأدلة الساكنة:

- حزمة Hermes المصدّرة 45.4 MiB تقريبًا (47 579 440 بايت) من 915 وحدة خلال 10.9 ثانية على هذه الآلة.
- `src/ai/engine.generated.ts` = 21 861 949 بايت. `src/pdf/engine.generated.ts` = 1 808 470 بايت. التعليق في `LocalAILab.tsx` يقول إن سلسلة HTML حوالي 22 MB وتُبنى عند فتح المختبر لا عند الإقلاع، لكنها تبقى داخل الحزمة لأن التصدير أنتج ملفًا واحدًا.
- `App.tsx` ملف واحد 62 624 بايت يجمع التبويبات والحالة.
- توثيق الفرع يسجّل أن إزالة المسح التربيعي للرسم خفّض وسيط 20 000 رابطًا على Linux من 1939.850 ms إلى 174.880 ms. هذا رقم تاريخي في رسالة الالتزام `dc5e1d4`، ولم أُعد قياسه.
- اختبار ضغط FSRS الألفي على Swift موثّق في `docs/PERFORMANCE_REVIEW.md` كزمن اختبار Linux وليس زمن واجهة هاتف. لم يُعاد هنا لأن Swift غير متاح.

## 10. الأمان والأسرار

- `git log --all -S` على 146 التزامًا: 0 لـ `ghp_` و`github_pat_` و`xoxb-` و`sk-proj-` ومفاتيح OpenSSH/RSA الخاصة.
- ظهور `AKIA` في تاريخ الالتزام `0d7b1a06738f6b7e0d877644fb50206dfca36fc9` داخل السطر الطويل لـ `engine.generated.ts`. في الشجرة الحالية: 38 تطابقًا لشكل `AKIA` متبوعًا بـ 16 حرفًا كبيرًا أو رقمًا، وكلها جزء من سلسلة أبجدية أطول في السطر 2، وليست إسناد `AWS_ACCESS_KEY_ID`. لا تُعامل كأسرار مقصودة. لا تُنسخ في هذا التقرير.
- لا ملفات `.env` متتبعة على `main` ولا على فرع الدراسة.
- النسخ JSON على المسارين غير مشفّرة، والكود يقول ذلك في الواجهة.
- لا SQLCipher. قاعدة Expo ملف محلي عادي. حذف التطبيق يحذفها إن لم تُنسخ خارج الحاوية.
- على `main` الاستيراد يستبدل المكتبة كلها بعد التأكيد. هذا أعلى خطر فقد بيانات في النسخة المدموجة.
- على Expo، الاستبدال يمر بنقاط رجوع، لكن مراجعة عند سقف الفترة تنتج حالة ترفضها المدقق، فيفشل تصديرها لاحقًا. لقطة SQLite لا تعيد الوسائط ولا تُستورد من داخل التطبيق.
- نموذج الذكاء يُنزَّل بفعل المستخدم من Hugging Face (Expo) أو مسار التنزيل في Swift. لا مفتاح API للمساعد في مصدر التطبيق.

## 11. الاستقلال عن أدوات التطوير

ما هو مطلوب في التطبيق النهائي: ألا تحتاج الملاحظات والمراجعة والرسم والبحث المحلي إلى ChatGPT أو Grok أو Hermes أو MCP أو Obsidian أو حاسوب خارجي.

ما وُجد في الكود المنتج عند `4f8b4e9`:

- لا استدعاء تشغيلي لـ ChatGPT أو Grok أو خادم وكلاء. اسم Hermes في `package-lock.json` هو `hermes-parser` الخاص بمترجم React Native، لا وكيل Hermes.
- Obsidian يظهر في ملفات بحث `expo-preview/docs/research/` كروابط قراءة، لا كاعتماد تشغيلي.
- `expo-mcp` مذكور كاعتماد اختياري لواجهة Expo التطويرية في القفل، وليس شاشة في التطبيق.
- الدراسة المحلية (ملاحظات، بطاقات، SQLite، بحث، رسم) مكتوبة لتعمل على الجهاز بعد تثبيت الحزمة.
- تجربة Expo Go المقصودة في `start-codespaces.sh` و`dev.mjs` للنموذج القديم تحتاج عملية `expo start` ونفق `@expo/ngrok` وحساب Expo. إغلاق الحاسوب أو الـ Codespace يقطع هذه التجربة. التصدير الذي نجح هنا لا يفتح Expo Go وحده.
- المساعد يطلب ملف GGUF. الرابط في `AIWorkspace.tsx` هو `https://huggingface.co/Qwen/Qwen3-0.6B-GGUF/resolve/23749fefcc72300e3a2ad315e1317431b06b590a/...`. بعد اختيار الملف، التوليد داخل WebView محلي. بلا تنزيل لا يوجد نموذج.
- التذكير في Expo Go منسوب إلى تطبيق Expo Go، حسب `src/reminders/README.md`.
- SwiftUI بعد البناء غير الموقّع ما زال يحتاج إعادة توقيع، وCI هو حاسوب Mac سحابي. الاستدلال المحلي مصمم بلا شبكة بعد وجود الأوزان. لا إثبات جهاز للمستخدم؛ `README` على `main` يقول إن التثبيت على آيفون المستخدم لم يتم.

النتيجتان معًا: منطق الدراسة مكتوب محليًا، ومسار التجربة الحالي على iPhone ما زال مربوطًا بخادم تطوير أو بحزمة غير موقّعة لم تُفتح هنا.

## 12. العربية والوضع الداكن والوصول

Expo:

- النصوص `textAlign: 'right'` و`writingDirection: 'rtl'` في `src/ui.tsx`.
- `I18nManager.isRTL` يُقرأ فقط لتحديد `arabicRow`. لا استدعاء `forceRTL` في المصدر. إن كانت لغة الجهاز من اليسار لليمين، الصفوف تعتمد على `row-reverse` والنص على اتجاه الكتابة. هذا لم يُرَ على iPhone.
- `app.json` يضع `userInterfaceStyle` على `automatic`، بينما التطبيق يحتفظ بعلم `darkMode` في SQLite ويبدأ بـ `useState(false)` ثم يبدّل بزر «داكن / فاتح». لا استخدام لـ `useColorScheme`. الوضعان موجودان كاختيار يدوي، لا كاتباع تلقائي للنظام بعد أول تحميل.
- أزرار كثيرة تحمل `accessibilityRole` و`accessibilityLabel`. `AccessibilityInfo.isReduceMotionEnabled` يُستمع إليه. لا جلسة VoiceOver.

Swift على `main`:

- الجذر يثبت `.environment(\.layoutDirection, .rightToLeft)`.
- تسميات وصول متفرقة (`accessibilityLabel` / `accessibilityIdentifier`) لا تغطي كل عنصر.
- لا مبدّل مظهر داكن مستقل في `RootView`. الاعتماد على مظهر النظام لم يُفحص على جهاز.
- لا اختبار VoiceOver في المستودع؛ `docs/TEST_COVERAGE.md` يقول ذلك عن Run 18.

## 13. المهارات الثلاث

قُرئت من GitHub العام في 15 نوفمبر 2026. لم تُثبَّت أي مهارة ولا حزمة.

1. `software-mansion-labs/skills`، المهارة `skills/react-native-best-practices/SKILL.md` (4340 بايت). تصف أنماط معمارية جديدة: Reanimated، Gesture Handler، SVG، وExecuTorch. المشروع يستخدم SVG فعلًا (`react-native-svg` 15.16.0) وWebView للذكاء لا ExecuTorch، ولا يحتوي Reanimated ولا Gesture Handler. الإرشاد مناسب لاحقًا لأداء الرسم والحركة، وغير متوافق كقائمة اعتماد تُنسخ الآن. RN 0.88 يقع في جيل المعمارية الجديدة، والمهارة لا تذكر رقم 0.88 حرفيًا في رأسها.
2. `wshobson/agents`، المهارة `plugins/frontend-mobile-development/skills/react-native-architecture/SKILL.md` (3602 بايت، 103 أسطر). الهيكل المقترح هو Expo Router (`app/(tabs)`، `Stack`). رُسوخ Expo شاشة واحدة `App.tsx` بلا `expo-router`. المهارة توصي أيضًا بـ `expo-secure-store` وAsyncStorage. النسخ الحساسة في المنتج غير مشفّرة، فملاحظة secure-store مناسبة للحساسية، بينما AsyncStorage تراجع عنه المنتج أصلًا نحو SQLite. لا رقم SDK 58 في المقطع المقروء. استخدام المهارة كقالب مشروع جديد يتعارض مع قرار عدم إنشاء تطبيق بديل.
3. `Appllama/appllama-skills`، المهارتان `appllama-usage` و`appllama-app-design-skill`. الثانية (20 220 بايت) تشترط Expo Router وApple HIG وألوانًا دلالية وحلقة محاكي. اتجاه HIG والوضعان الفاتح والداكن مفيدان. الاعتماد على MCP في `appllama-usage` أداة تصميم أثناء البناء فقط؛ ربط المنتج نفسه بـ MCP يخالف استقلال التطبيق. المحاكي غير متاح هنا، فلا تُستخدم المهارة كدليل إتمام.

## 14. النتائج مرتبة بالأثر

1. **انقسام المصدر.** المستنسخ الافتراضي Swift متخلف. منتج Expo الذي نجح اختباره هنا غير مدموج، وفوقه مسودتان، وفرع استيراد Swift يتعارض في ملفين. أثر ذلك: إصلاح على الفرع الخطأ، أو تجربة نسخة لا تحتوي عمل نوفمبر. دليل: عدّاد `0 20`، وطلبات 5 و6–10 و13 و14 المفتوحة.
2. **فقد بيانات في النسخة المدموجة.** استيراد `main` يستبدل كل المكتبة. لا نقاط رجوع على هذا الفرع. دليل: `App/HomeView.swift` الزر «استيراد نسخة — يستبدل كل البيانات».
3. **نسخ Expo قد ترفض بطاقة راجعتها بنفسها.** مثبت على `4f8b4e9` بالأرقام أعلاه. يظهر عند الاقتراب من سقف 365000 يوم أو 100000 تكرار، لا في الاستخدام اليومي القصير، لكنه يكسر ضمان «كل حالة محفوظة قابلة للتصدير».
4. **التجربة على iPhone ما زالت مربوطة بعملية خارجية أو بحزمة لم تُفتح.** `start-codespaces.sh` وngrok وExpo Go، أو IPA غير موقّع من Mac. لا يوجد في هذا الفحص بناء مستقل أُغلق بعده خادم التطوير ثم فُتح التطبيق.
5. **FSRS موجود في Swift للبطاقات الجديدة فقط، وغير موجود في Expo.** خطان للجدولة. نقل مكتبة بينهما لا يحفظ معنى الاستقرار والصعوبة. البطاقات القديمة في Swift لا تُرحَّل، حسب `ReviewView` و`docs/FSRS_INTEGRATION.md`.
6. **وعود المنتج الناقصة على الخطين:** وضع المعلم، تحليل التحسن عبر الزمن، استيراد كتاب، MCQ في واجهة Expo، OCR للمسح الضوئي.
7. **حجم الإقلاع.** حزمة 45 MiB قبل إضافة ملف النموذج 639 MB. خطر ذاكرة WebView مذكور في رسالة الخطأ داخل `LocalAILab` («نقص الذاكرة») ولم يُقس.
8. **انحراف حزم Expo.** `expo install --check` فشل في 15 نوفمبر. البقاء على القفل الحالي قابل للتشغيل هنا؛ التحديث العشوائي مخاطرة لم تُؤخذ.
9. **CI ينشر حزمة ناجحة جزئيًا** ما دام شرط `always()` قائمًا على فرع الدراسة، ولا يعمل عند الدفع. رأس `4f8b4e9` بلا تشغيل Actions.
10. **الوصول والمظهر.** RTL مفروض في Swift وغير مفروض عبر `forceRTL` في Expo. الداكن في Expo يدوي. لا VoiceOver.
11. **لا أسرار اعتماد مقصودة** في التاريخ المفحوص. النسخ غير مشفّرة عن قصد ظاهر في الواجهة.

## 15. التوصية والمخاطر

المسار العملي للأسابيع القريبة من التطوير هو **Expo `expo-preview` على سلالة `work/expo-study-flow-20261103`**، لأنه:

- يتقدم على `main` بتقديم fast-forward، فيضم Swift المدموج ويزيد عليه.
- اختباراته 469 نجحت على Linux في هذا الفحص، وتصدير Hermes نجح.
- يمكن تجربة المنطق من بيئة سحابية نحو Expo Go، وهذا يطابق قيد «لا Mac على مكتب المستخدم».

مخاطر اختيار Expo:

- ليس فرعًا افتراضيًا. بقاؤه مسودة يترك `main` نسخة أخطر في الاستيراد وأفقر في الميزات.
- الجدولة ليست FSRS. إعلان المنتج «تكرار متباعد بـ FSRS» غير صادق على هذا الخط اليوم.
- Expo Go ونفق ngrok ليسا تطبيقًا مستقلًا. الإشعار والنموذج والرابط تتغير بتغير العملية.
- حزمة الذكاء الضخمة وتحديثات patch الناقصة قد تكسر بناءً لاحقًا.
- دمج `safe-import` فوقه يتعارض في الاختبار وملف البصمة.

مخاطر البقاء على SwiftUI كخط وحيد:

- لا بناء على Linux، وCI يدوي على `xcode-27`، وآخر نجاح ليس على رأس `main`.
- لا مسار قصير مؤكد إلى iPhone المستخدم. الحزمة غير الموقعة لا تثبّت نفسها، و`README` يقرّ بأن التثبيت لم يتم.
- ميزات الطالب التي بُنيت في نوفمبر (مسودات، مصادر، استرجاع، وسائط Expo) ليست على `main`.
- FSRS-6 إنجاز حقيقي للبطاقات الجديدة، لكنه لا يغطي البطاقات القديمة ولا يساوي اكتمال المنتج.

لا يُحذف Swift. يُحفظ كمرجع جدولة وبناء Mac إلى أن يتوحد نموذج البيانات. لا يُنشأ مستودع ثالث.

## 16. خطة مرحلية

المرحلة 0، وهذه الوثيقة: تثبيت الحقائق وعدم الدمج.

المرحلة 1: توحيد السلالة وإغلاق عيب النسخ. بلا ميزات جديدة.

المرحلة 2: مسار iPhone يُغلق بعده خادم التطوير وتبقى الملاحظات والمراجعة. EAS أو حزمة يوقّعها المستخدم بنفسه، مع جملة تحقق قصيرة. لا تُطلب كلمات مرور داخل المحادثة.

المرحلة 3: قرار جدولة واحد. إما إدخال FSRS إلى Expo مع إصدار بيانات جديد واختبارات حدود، أو الإبقاء على المجدول الحالي وتصحيح وصف المنتج. عدم ترحيل صامت للمواعيد القديمة.

المرحلة 4: MCQ حقيقي أو إزالة كلمة «اختبار» من الزر، ثم المعلم والتحليل إن بقيتا في النطاق. قياس على جهاز للذاكرة بعد فتح المساعد.

المرحلة 5: تقرير ما يُؤخذ من Swift (FSRS، PDFKit، صوت النظام) بعد استقرار بيانات Expo. دمج `safe-import` فقط بعد حل التعارضين وإعادة اختبار النسخ.

### أول ثلاثة إصلاحات

**1. تثبيت سلالة واحدة قابلة للدمج دون دمج أعمى الآن**

- العمل: اعتبار `4f8b4e9` نقطة المنتج، ثم ترتيب المسودتين 13 و14 فوقها لأن `merge-tree` بينهما نظيف، وترك المسودة 5 حتى يُحل تعارض `BackupUITests.swift` وملف البصمة. تشغيل Actions على الرأس الذي سيُدمج، لا على التزام أقدم.
- الخطر: دمج الدراسة إلى `main` ينشر Swift backup وملف الذكاء 22 MB دفعة واحدة. فشل CI بعد الدمج يترك `main` بلا بناء حديث. المسودتان نظيفتان نصيًا وقد تتداخلان سلوكيًا في `core.ts` وسير العمل.
- التحقق: `git rev-list --left-right --count main...head` يبقى `0 N` قبل الدمج؛ بعد أي دمج لاحقًا إعادة `npm test` (137) و`npm run test:ui` (332) و`expo export`، ثم `workflow_dispatch` واحد على SHA الرأس ومقارنة عدد اختبارات `swift test` بسجل آخر نجاح.

**2. منع المراجعة من إنتاج بطاقة ترفضها النسخة**

- العمل: قص `intervalDays` و`repetitions` إلى سقفي المدقق، كما في `2aa51bb`، مع اختبار عند 365000 و100000 للدرجات الأربع.
- الخطر: بطاقة بلغت السقف تتوقف عن التباعد أكثر. هذا مقصود لأن البديل حالة لا تُصدَّر. لا يغيّر البطاقات القصيرة. يجب ألا يُخفَض تكرار صحيح تحت السقف.
- التحقق: إعادة السكربت الذي طُبع أعلاه وانتظار `valid: true` لكل درجة؛ إبقاء 137 اختبار نواة أخضر، ومنها اختبار الحد الجديد إن نُقل من المسودة 14. لم يُعد هذا التحقق على `2aa51bb` بعد.

**3. قطع اعتماد التجربة الأساسية على حاسوب مشغّل**

- العمل: إبقاء `expo start --tunnel` أداة تطوير فقط، وبناء داخلي أو مسار توقيع يفتح الملاحظات والمراجعة والبحث بلا Metro. كتابة خطوات iPhone في أقل من عشر خطوات بعد وجود رابط بناء، بلا طلب أسرار في الدردشة.
- الخطر: EAS يحتاج حساب Apple يدخله المستخدم. الحزمة غير الموقعة من CI لا تثبت هذا الإصلاح. تغيير الإضافات في `app.json` قد يرفضه Expo Go.
- التحقق: تثبيت البناء، إيقاف كل عملية Expo، إنشاء ملاحظة، قتل التطبيق، إعادة فتحه، رؤية الملاحظة، تصدير JSON واستعادته على مجموعة فارغة. هذا البند لم يُنفَّذ هنا لأن لا محاكي ولا iPhone ولا توقيع.

## ملحق. التزامات فُحصت مباشرة

- `main`: `503b801612ea916ab13c78af473ca07eb0bd6590`
- Expo الدراسة: `4f8b4e908aa694b35e91c25c6c1a07d95ca518e6`
- آخر CI ناجح لـ Swift على سلالة Expo: `13057ffd60a2c4e6f969b49eda6b607bff3b8e72` تشغيل `41497312983`
- آخر CI ناجح مذكور لتطبيق FSRS: `07784236eb9d13fc77092fc8713f4ca31727f666` تشغيل `41301469379`
- آخر نجاح على فرع `main`: `d617221376c8ea05b5814d6593292288a01f8710` تشغيل `41236553179`
- فشل محاكي مبكر على `main`: `78b7d0a74f7440dd9c1abd06b6451af860a9252e` تشغيل `41236155202`
- المسودة 14: `be9d48809d301e7c12f8ca97de8d36cb34010582`، إصلاح القص `2aa51bb8ebb4349c41f52491d30e88022111cb0d`
- المسودة 13: `acc0d603db07c90c175797d369f55be12225fab6`
- الاستيراد الآمن: `73f2e51ec9d5e410c6a5f098c20ac0b88f24c6f0`
- `rusukh-ios` `main`: `4827def962b646dd7a77903c36f2be81364e4f0f`
- آخر دفع `rusukh-ios`: `d44abc564a1d76d3576c3a81072b285d694753a0`
