# تحديث EAS لرُسوخ — لم يُنشر

هذا الإعداد يجهّز بناءً مستقلًا يستقبل التحديثات من EAS. لم يُنفَّذ `eas init` ولا `eas update` ولا أي نشر، لأن رمز Expo غير متوفر هنا. المعرّف `REPLACE_WITH_EAS_PROJECT_ID` في `app.json` عنصر نائب متعمد، وليس مشروعًا حقيقيًا.

الملاحظات والمراجعة والبحث والنسخ المحلي تعمل من الحزمة المضمّنة. `fallbackToCacheTimeout` قيمته 0 حتى لا ينتظر التطبيق شبكة التحديث قبل إظهار الحزمة المدمجة. سكربت `start-codespaces.sh` لا يعود يثبّت `@expo/ngrok` ولا يشغّل Metro إلا إذا طُلب النفق صراحة بـ `--tunnel`، وهذا مسار تطوير فقط.

## ما تغيّر في الإعداد

- `app.json`: المالك `svrvs-team`، المعرّف `rusukh`، `runtimeVersion.policy` = `appVersion` (يتبع الإصدار 0.5.2)، وعنوان التحديث `https://u.expo.dev/REPLACE_WITH_EAS_PROJECT_ID`.
- `eas.json`: قناة `preview` لملف المعاينة، وقناة `production` لملف الإنتاج. اسم فرع التحديث يطابق اسم القناة.
- الاعتماد `expo-updates` مضاف بما يوافق Expo SDK 58.
- سير `.github/workflows/expo-update.yml` يدوي فقط. يرفض العنصر النائب، ثم ينشر بالسر `EXPO_TOKEN` إن وُجد. لا يعمل عند الدفع.

## أوامر المرة الواحدة

تُنفَّذ من مجلد `expo-preview` بعد تسجيل الدخول إلى حساب Expo الذي يملك المؤسسة `svrvs-team`. لا تُلصق الرمز في المحادثة.

```bash
cd expo-preview
npx eas-cli login
npx eas-cli init
npx eas-cli channel:edit preview --branch preview
npx eas-cli update --branch preview
```

`eas init` يستبدل `REPLACE_WITH_EAS_PROJECT_ID` في `extra.eas.projectId` و`updates.url`. بعدها يُراجع الفرق ويُلتزم. بناء iOS الذي يستقبل هذه القناة، ولم يُشغَّل هنا:

```bash
npx eas-cli build --profile preview --platform ios
```

النشر اليدوي من GitHub، بعد التزام المعرّف الحقيقي وإضافة السر `EXPO_TOKEN`: تشغيل سير «Publish Expo update» واختيار الفرع `preview`.

Expo Go مع نفق التطوير يبقى أداة معاينة مؤقتة. التطبيق المستقل هو بناء القناة `preview` أو `production`، ويعمل بلا حاسوب يشغّل Metro.
