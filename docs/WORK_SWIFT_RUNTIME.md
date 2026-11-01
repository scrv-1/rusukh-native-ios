# Swift في كمبيوتر Work — 2026-11-01

مُثبت بالتنفيذ: Ubuntu 24.04 x86_64؛ `swift --version` أعاد Swift 6.4.2، والهدف x86_64-unknown-linux-gnu. نجح `swift test --jobs 4`: 41 اختبارًا لفرع الصوت أولًا، ثم 50 لدمج FSRS قبل إضافة اختباري تهيئة الصوت. ثم 52 اختبارًا للدفعة المجمعة، واختبار ضغط مستقل لألف بطاقة و32000 مراجعة (7.877 ثانية). خمسة اختبارات مرتبطة بأطر Apple تعمل على Mac فقط. لا Xcode أو Simulator محليًا.

المصدر الرسمي: https://www.swift.org/install/linux/ubuntu/24_04/ . نُزّلت الحزمة التالية وفُكّت داخل مجلد العمل: https://download.swift.org/swift-6.4.2-release/ubuntu2404/swift-6.4.2-RELEASE/swift-6.4.2-RELEASE-ubuntu24.04.tar.gz . لا خدمة مدفوعة. Swiftly انتهى برمز 132 دون نص تشخيص؛ السبب غير مثبت.

مكتبة libncurses.so.6 كانت مفقودة. فشل apt-get بسبب عدم السماح بعمليات setgroups/seteuid؛ لم تُغيّر صلاحيات البيئة. نُزّلت libncurses6 من مستودع Ubuntu الرسمي وفُكّت داخل نسخة toolchain المحلية. البصمة SHA-256 المتحققة `59e8527dfd14473393960bfb7c69566f1ad9d576423421dcb8b8dcdbb3e7fca1` تطابق https://packages.ubuntu.com/noble/amd64/libncurses6/download .

لم يكفِ LD_LIBRARY_PATH لمرحلة الربط الفرعية، فوُضعت المكتبة في RUNPATH الخاص بأداة Swift داخل نسختها المحلية. لم تُعدّل مكتبات النظام. اختبارات Linux لا تثبت SwiftUI أو AVFoundation أو PDFKit أو MLX على الهاتف؛ تُختبر الأجزاء المتاحة منها في Mac Actions. سجل الصوت الأول انتهى برمز 0 رغم تشخيص runtime بعد XCTest عن عدم قراءة status لبعض الخيوط؛ سجل FSRS انتهى برمز 0 دون ذلك التشخيص.
