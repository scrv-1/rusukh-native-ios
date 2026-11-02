#!/usr/bin/env python3
"""Compile the source audit without conflating code tests with iPhone validation.

Usage: python scripts/build-devils-audit.py [--report-dir PATH]
Only standard-library modules are used. The raw reviewer files are never rewritten.
Optional root.json and fix-status.json are reread on every run.
"""
from __future__ import annotations
import argparse
import base64
from collections import Counter
from copy import deepcopy
from datetime import datetime, timezone
from hashlib import sha256
from html import escape
import json
from pathlib import Path
from urllib.parse import quote

EXPO_SHA = "2486ae13f2ecb7d2eddb7a29c36caf358d9dd3c0"
NATIVE_SHA = "93f5adb1c2ee43195e0ceda35d39a9992c11e320"
REPO = "https://github.com/scrv-1/rusukh-native-ios"
INPUTS = ("data", "navigation", "study", "ai", "release-native", "access-sources")
MERGES = {"A008": "S006", "X203": "D007", "X204": "N007", "X206": "D006"}
MERGE_REASONS = {
    "A008": "منشأ السؤال والمصدر والنموذج جزء من مشكلة التتبع نفسها.",
    "X203": "حذف الوسائط: التحكم في المحتوى والخصوصية ضمن مسار حذف واحد.",
    "X204": "اختبار لوحة المفاتيح يشمل المحرر وحقول المصادر والمحرك.",
    "X206": "إذن الميكروفون الأول جزء من قبول التسجيل الأصلي على الجهاز.",
}
PENDING = {"D001", "N001", "D003", "S003", "X201", "X202"}
REPRODUCED_BUGS = {"D002", "D003", "D004", "D005", "S001", "S003", "S005", "X201"}
AREAS = {"data": "البيانات والاسترجاع", "navigation": "التنقل والتخصيص", "study": "الدراسة والبطاقات", "ai": "الذكاء المحلي", "release-native": "الإصدار وSwiftUI", "access-sources": "الوصول والصوت والمصادر", "root": "الاعتماديات"}
KINDS = {"reproduced-bug": "خطأ أعيد إنتاجه", "source-bug": "خطأ مثبت بالمصدر", "requirement-gap": "متطلب ناقص", "design-risk": "خطر تصميم", "release-risk": "خطر إصدار", "device-gap": "فجوة تحقق جهاز"}
STATUSES = {"open": "مفتوح", "implemented-pending-verification": "تعديل منفذ؛ تحقق نهائي منتظر", "fixed-verified": "أصلح واختبر ضمن النطاق المسجل"}
STATUS_ALIASES = {"fixed": "fixed-verified", "verified": "fixed-verified", "fixed-tested": "fixed-verified", "implemented-and-tested": "fixed-verified", "implemented": "implemented-pending-verification", "pending-verification": "implemented-pending-verification", "implemented-pending-verification": "implemented-pending-verification", "open": "open", "fixed-verified": "fixed-verified"}
SCOPE = [
    "التدقيق يصف Expo 0.5.0 عند الالتزام 2486ae13f2ecb7d2eddb7a29c36caf358d9dd3c0. أرقام الأسطر تخص المصدر وقت المراجعة، وقد تتحرك بعد الإصلاح.",
    "ملفات SwiftUI المفحوصة نسخة قراءة منفصلة عند 93f5adb1c2ee43195e0ceda35d39a9992c11e320؛ لا تنسب إليها إصلاحات Expo أو اختبارات JavaScript.",
    "الالتزام المحلي المصطنع 2372410 ليس التزام إصدار على GitHub. حالة الإصلاح مستقلة عن لقطة اكتشاف المشكلة وعن رفعها أو اعتمادها للإصدار.",
    "الاختبار المعاد إنتاجه قد يستخدم Node SQLite أو مكونات حقيقية مع موائمات أصلية محاكية. لا يعني تشغيلًا على iPhone. التقرير لا يثبت تثبيت SwiftUI المستقل.",
    "مراجع المجتمع والوثائق تساند اقتراح الحل. دليل عيب رُسوخ هو مصدره أو اختبار محدد عليه؛ وجود نصيحة خارجية ليس دليل عيب.",
    "هذه حصيلة تدقيق محدد وليست حصرًا لكل عيوب المنتج أو إعلان اكتماله. لا يستهدف التقرير عددًا معينًا من القرارات.",
]
TARGET_BULLETS = [
    "أول فتح: مكتبة ومساحة بلا بيانات أو أقسام مفروضة، مع مدخل إنشاء واضح.",
    "الفتح التالي: استعادة المحتوى والتخطيط والمسودة؛ لا مسح عند كل تشغيل.",
    "أضف مادة ← افحص النص ← اختر ناتج الدراسة ← راجع النتيجة ← ابدأ ← استأنف.",
    "إخفاء قسم يغيّر الواجهة فقط؛ استرجاعه لا يحذف المحتوى ولا يكرره.",
    "النماذج تُعرض بقدراتها الفعلية؛ الإدارة التلقائية والتشغيل دون اتصال يحتاجان تنفيذًا ودليل جهاز.",
    "الرحلة الموحدة تصميم مستهدف؛ الإصلاحات الجزئية لا تعني اكتمالها.",
]


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def json_text(value):
    return json.dumps(value, ensure_ascii=False, indent=2)


def unique(items):
    return list(dict.fromkeys(items))


def repository_path(path):
    path = str(path).replace("\\", "/")
    if "/native-source-review/" in path:
        return path.split("/native-source-review/", 1)[1], NATIVE_SHA
    if "/rusukh-native-ios/" in path:
        path = path.split("/rusukh-native-ios/", 1)[1]
    if path.startswith("App/") and path.endswith(".swift"):
        return path, NATIVE_SHA
    if path.startswith((".github/", "App/", "Tests/", "UITests/")):
        return path, EXPO_SHA
    if not path.startswith("expo-preview/"):
        path = "expo-preview/" + path.lstrip("./")
    return path, EXPO_SHA


def normalize_kind(finding):
    raw = finding["kind"].lower().replace("_", "-").replace(" ", "-")
    if finding["id"] == "R001":
        return "design-risk"
    if raw in KINDS:
        return raw
    if raw in {"missing-requirement", "spec-gap"}:
        return "requirement-gap"
    if raw in {"device-validation-gap"}:
        return "device-gap"
    if raw in {"risk", "design-risk"}:
        return "design-risk"
    if raw in {"release-risk"}:
        return "release-risk"
    if raw in {"bug", "bug/source-proven", "code-verified-bug", "source-verified-defect"}:
        return "reproduced-bug" if finding["id"] in REPRODUCED_BUGS else "source-bug"
    raise ValueError(f"Unrecognized kind for {finding['id']}: {raw}")


def normalize(finding, area):
    result = deepcopy(finding)
    result["raw_kind"] = finding["kind"]
    result["raw_severity"] = finding["severity"]
    result["kind"] = normalize_kind(finding)
    result["severity"] = {"high": "P1", "medium": "P2", "low": "P3"}.get(finding["severity"], finding["severity"])
    result["area"] = area
    result["area_ar"] = AREAS[area]
    result["original_file"] = finding["file"]
    result["file"], result["reviewed_commit"] = repository_path(finding["file"])
    anchor = "#L" + str(result["line_start"])
    if result.get("line_end") != result["line_start"]:
        anchor += "-L" + str(result["line_end"])
    result["code_url"] = f"{REPO}/blob/{result['reviewed_commit']}/{quote(result['file'])}{anchor}"
    result["source_urls"] = unique([result["code_url"], *finding.get("source_urls", [])])
    result["supporting_source_urls"] = [url for url in finding.get("source_urls", []) if not url.startswith(REPO + "/blob/")]
    result["merged_ids"] = []
    result["merged_findings"] = []
    result["status"] = "implemented-pending-verification" if result["id"] in PENDING else "open"
    result["fix_status"] = {"status": result["status"], "scope_ar": "حالة التعديل الأولية؛ لا ادعاء اجتياز التحقق النهائي أو اختبار الجهاز."} if result["id"] in PENDING else {"status": "open"}
    if result["id"] == "R001":
        result["original_title_ar"] = result["title_ar"]
        result["title_ar"] = "إلغاء محرر SwiftUI قد يتجاهل تعديلات غير محفوظة دون فرصة تراجع"
        result["severity"] = "P2"
        result["impact_ar"] = "زر إلغاء مقصود يتجاهل التعديلات المحلية قبل حفظها؛ الخطر هو غياب الحماية من إلغاء عرضي. لا يثبت هذا تلف البيانات المحفوظة أو انهيار التطبيق. حماية مسودة Expo لا تمتد إلى هذا المحرر الأصلي."
        result["normalization_note_ar"] = "أعيد تصنيف السلوك خطر تصميم P2: الإلغاء المقصود ليس بذاته عطلًا أو تلف بيانات. لم يعاد إنتاجه على جهاز."
    return result


def load_statuses(path):
    if not path.exists():
        return {}, None
    data = read_json(path)
    candidates = data
    if isinstance(data, dict):
        candidates = data.get("findings", data.get("fixes", data.get("statuses", data)))
    if isinstance(candidates, list):
        mapped = {item["id"]: item for item in candidates}
    elif isinstance(candidates, dict):
        mapped = {key: ({"status": val} if isinstance(val, str) else val) for key, val in candidates.items() if isinstance(val, (dict, str)) and key[:1] in "DNXSARM" and key[1:].isdigit()}
    else:
        raise ValueError("fix-status.json must contain a list or id map")
    return mapped, data


def human(value):
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        return "\n".join(human(item) for item in value)
    return json_text(value)


def paragraphs(value):
    return "".join("<p>" + escape(line) + "</p>" for line in human(value).split("\n") if line)


def record_detail_html(finding):
    blocks = []
    for field, label in (("evidence", "الدليل"), ("scenario", "سيناريو التحقق"), ("impact_ar", "الأثر والحدود"), ("fix_ar", "التعديل المقترح"), ("acceptance_ar", "معيار القبول"), ("verification", "كيف تحققنا")):
        blocks.append(f"<div class='detail-block'><h4>{label}</h4>{paragraphs(finding.get(field))}</div>")
    return "".join(blocks)


def card_html(finding):
    extras = ""
    for related in finding["merged_findings"]:
        extras += f"<details class='merged'><summary>الدليل المدمج {escape(related['id'])} — {escape(related['title_ar'])}</summary><p><a href='{escape(related['code_url'], quote=True)}' dir='ltr'>{escape(related['file'])}:{related['line_start']}</a></p>{record_detail_html(related)}</details>"
    external = unique([url for record in [finding, *finding["merged_findings"]] for url in record["supporting_source_urls"]])
    links = "".join(f"<li><a href='{escape(url, quote=True)}' dir='ltr'>{escape(url)}</a></li>" for url in external)
    if links:
        extras += "<details><summary>وثائق ومراجع مساندة للحل</summary><p>هذه المراجع لا تثبت عيب رُسوخ؛ يرجع الإثبات إلى الكود والاختبار أعلاه.</p><ul>" + links + "</ul></details>"
    search = " ".join(human(finding.get(field, "")) for field in ("id", "title_ar", "file", "evidence", "fix_ar", "acceptance_ar", "merged_ids"))
    note = f"<p>{escape(finding.get('normalization_note_ar', ''))}</p>" if finding.get("normalization_note_ar") else ""
    return f"""<article class='finding' data-kind='{finding['kind']}' data-severity='{finding['severity']}' data-area='{finding['area']}' data-status='{finding['status']}' data-search='{escape(search, quote=True)}' id='{finding['id']}'>
<div class='tags'><b dir='ltr'>{finding['id']} · {finding['severity']}</b><span>{KINDS[finding['kind']]}</span><span>{finding['area_ar']}</span><span class='status'>{STATUSES[finding['status']]}</span></div>
<h3>{escape(finding['title_ar'])}</h3>
<details><summary>الدليل والتعديل ومعيار القبول</summary><p><a dir='ltr' href='{escape(finding['code_url'], quote=True)}'>{escape(finding['file'])}:{finding['line_start']}</a></p>{note}{record_detail_html(finding)}
<div class='detail-block'><h4>حالة الإصلاح المسجلة</h4>{paragraphs(finding['fix_status'])}<p>اجتياز اختبار محاكى أو منطقي لا يعني تحقق السلوك على iPhone.</p></div>{extras}</details></article>"""


def build_html(audit, report):
    summary = audit["summary"]
    by_kind = summary["by_kind"]
    cards = "".join(card_html(item) for item in audit["findings"])
    filters = ""
    for key, label, choices in (("kind", "نوع النتيجة", KINDS), ("severity", "الأولوية", {"P1": "P1 — مرتفعة", "P2": "P2 — متوسطة", "P3": "P3 — منخفضة"}), ("area", "المجال", AREAS), ("status", "الحالة", {"open": "مفتوح", "implemented-pending-verification": "تعديل ينتظر التحقق", "fixed-verified": "أصلح واختبر ضمن النطاق"})):
        options = "".join(f"<option value='{val}'>{title}</option>" for val, title in choices.items())
        filters += f"<label>{label}<select id='{key}'><option value=''>الكل</option>{options}</select></label>"
    images = ""
    for shot in audit["screenshots"]:
        path = report / shot["file"]
        b64 = base64.b64encode(path.read_bytes()).decode("ascii")
        images += f"<figure><img loading='lazy' src='data:image/jpeg;base64,{b64}' alt='{escape(shot['caption_ar'], quote=True)}'><figcaption>{escape(shot['caption_ar'])}</figcaption></figure>"
    limits = "".join("<li>" + escape(item) + "</li>" for item in audit["limits_ar"])
    target = "".join("<li>" + escape(item) + "</li>" for item in TARGET_BULLETS)
    counts = "".join(f"<li>{KINDS[kind]}: <b>{by_kind.get(kind, 0)}</b></li>" for kind in KINDS)
    merges = " · ".join(f"{src} → {dst}" for src, dst in MERGES.items())
    target_full = escape(audit["target_experience"]["text_ar"])
    return """<!doctype html><html lang='ar' dir='rtl'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><meta name='color-scheme' content='light dark'><title>رُسوخ — تدقيق التجربة والإصدار</title><style>
:root{color-scheme:light dark;--bg:#f6f6f4;--card:#fff;--text:#171717;--muted:#4d4d4d;--line:#ccc;--focus:#154dbe}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:1rem/1.8 system-ui,-apple-system,sans-serif}main{max-width:1050px;margin:auto;padding:20px}h1{font-size:1.8rem;margin:.4em 0}h2{font-size:1.3rem}h3{font-size:1.05rem;margin:.5em 0}h4{font-size:1rem;margin:.7em 0 .1em}p{margin:.4em 0}a{color:inherit;text-underline-offset:4px;overflow-wrap:anywhere}a:focus-visible,input:focus-visible,select:focus-visible,summary:focus-visible,button:focus-visible{outline:3px solid var(--focus);outline-offset:3px}.panel,.finding{background:var(--card);padding:18px;border:1px solid var(--line);border-radius:14px;margin:14px 0}.muted{color:var(--muted)}.counts{display:flex;gap:10px 26px;list-style:none;flex-wrap:wrap;padding:0}.filters{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}label{display:block}input,select,button{font:inherit;color:inherit;background:var(--card);border:1px solid var(--line);border-radius:8px;padding:10px;width:100%;min-height:46px}#search{margin:5px 0 12px}button{width:auto;cursor:pointer}.tags{display:flex;flex-wrap:wrap;gap:6px 10px;font-size:.83rem;color:var(--muted)}.tags span,.tags b{border:1px solid var(--line);padding:2px 8px;border-radius:20px}.tags b{color:var(--text)}summary{cursor:pointer;min-height:44px;padding:7px 0;font-weight:600}details details{border-top:1px solid var(--line);margin-top:14px}.detail-block{margin:12px 0;padding-inline-start:12px;border-inline-start:3px solid var(--line);overflow-wrap:anywhere}.detail-block p{white-space:pre-wrap}pre{white-space:pre-wrap;word-break:break-word;font:inherit;line-height:1.9}figure{margin:12px 0}img{display:block;max-width:100%;height:auto;border:1px solid var(--line);border-radius:8px}figcaption{color:var(--muted);font-size:.9rem}.photos{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px}.legend{font-size:.95rem}[hidden]{display:none!important}.skip{position:absolute;top:-80px}.skip:focus{top:0;background:var(--card);padding:10px;z-index:10}@media(max-width:600px){main{padding:12px}.panel,.finding{padding:14px}.filters{grid-template-columns:repeat(2,minmax(0,1fr))}h1{font-size:1.45rem}}@media(prefers-color-scheme:dark){:root{--bg:#121212;--card:#1d1d1d;--text:#f5f5f5;--muted:#c6c6c6;--line:#686868;--focus:#9cbdff}}@media print{body{background:white;color:black}.filters,button,.search-label,#search{display:none}.panel,.finding{break-inside:avoid}.photos{display:block}img{max-height:65vh;width:auto}}
</style></head><body><a class='skip' href='#findings'>تجاوز إلى النتائج</a><main>
<header><p class='muted'>رُسوخ — متابعة هندسية</p><h1>ما الذي يعوق تجربة دراسة بسيطة؟</h1><p>نبدأ فارغًا، نضيف المادة، ثم نعود إلى عمل محفوظ. التقرير يميّز ما تعطل فعلًا عما ينقص أو يحتاج تجربة على الجهاز.</p></header>
""" + f"""<section class='panel' aria-labelledby='summary-title'><h2 id='summary-title'>نتيجة التدقيق</h2><p><b>{summary['bugs']} أخطاء</b> بين إعادة إنتاج وفحص مصدر، و<b>{summary['gaps']} فجوات</b> متطلب أو جهاز، و<b>{summary['risks']} مخاطر</b> تصميم أو إصدار. ليست هذه قائمة عيوب مثبتة كلها.</p><ul class='counts'>{counts}</ul><p class='legend'>P1: مرتفعة · P2: متوسطة · P3: منخفضة. لا P0 في هذه الحصيلة.</p><p>الحالة: {summary['by_status'].get('fixed-verified',0)} أصلحت واختبرت ضمن النطاق المسجل، {summary['by_status'].get('implemented-pending-verification',0)} تعديلات تنتظر التحقق، {summary['by_status'].get('open',0)} مفتوحة.</p><p class='muted'>كل تحقق جهاز ما زال غير مثبت في هذا التقرير. صور المتصفح واختبارات الموائمات لا تغيّر هذا الحد.</p></section>
<section class='panel'><h2>التجربة المستهدفة</h2><ul>{target}</ul><p><a href='TARGET_EXPERIENCE.md'>وثيقة التصميم المستهدف</a></p><details><summary>قراءة الوثيقة كاملة دون اتصال</summary><pre>{target_full}</pre></details></section>
<details class='panel'><summary>نطاق المراجعة والحدود</summary><ul>{limits}</ul><p dir='ltr'>Expo: {EXPO_SHA}<br>SwiftUI: {NATIVE_SHA}</p><p>العدد الناتج بعد إزالة التكرار: {summary['total']} حالة. جُمعت الأدلة المتداخلة مع الاحتفاظ بها داخل كل سجل.</p><p dir='ltr'>{merges}</p><p>R008 نقل إلى حدود التحقق؛ لم يحتسب كفجوة جهاز إضافية. M001 يمثل بلاغين في سلسلة اعتماديات، لا 12 عيبًا مستقلًا.</p><p><a href='audit.json'>السجل المنظم JSON</a> · <a href='AUDIT.md'>التقرير النصي</a></p></details>
<section class='panel' aria-label='البحث والتصفية'><label class='search-label' for='search'>ابحث في العنوان أو الدليل أو الحل</label><input id='search' type='search' placeholder='مثال: مسودة، مصدر، D003'><div class='filters'>{filters}</div><p><button id='reset' type='button'>مسح التصفية</button></p><p id='result-count' role='status' aria-live='polite'>عرض {summary['total']} من {summary['total']}</p><noscript>البحث يحتاج JavaScript؛ جميع النتائج متاحة أدناه دون تشغيله.</noscript></section>
<section id='findings' aria-label='حالات التدقيق'>{cards}</section><p id='empty' hidden>لا نتائج مطابقة. جرّب إزالة أحد المرشحات.</p>
<details class='panel'><summary>صور المعاينة وحدودها</summary><p>صور WEB harness في متصفح؛ ليست صور iPhone، ولا تثبت لمسًا أو VoiceOver أو قياسًا لتخطيط الهاتف. صورة نافذة التخصيص قد تمتد داخل المتصفح. صور 01–03 توثق ما قبل الإصلاح، وأي صورة 04 توثق معاينة لاحقة فقط.</p><div class='photos'>{images}</div></details>
<footer class='muted'><p>هذا تقرير قابل للمراجعة، وليس شهادة جاهزية نهائية. الدليل وإجراء القبول داخل كل حالة؛ تبقى رحلة الجهاز والذكاء المحلي والتطبيق المستقل أعمالًا منفصلة.</p></footer></main>""" + """<script>
(()=>{'use strict';const cards=[...document.querySelectorAll('.finding')];const search=document.getElementById('search');const keys=['kind','severity','area','status'];const selects=keys.map(k=>document.getElementById(k));const normalize=s=>s.normalize('NFKC').toLocaleLowerCase('ar').replace(/[\u064b-\u065f\u0670\u0640]/g,'');function update(){const query=normalize(search.value.trim());let shown=0;cards.forEach(card=>{const match=(!query||normalize(card.dataset.search).includes(query))&&selects.every((select,i)=>!select.value||card.dataset[keys[i]]===select.value);card.hidden=!match;if(match)shown++;});document.getElementById('result-count').textContent=`عرض ${shown} من ${cards.length}`;document.getElementById('empty').hidden=shown!==0;}search.addEventListener('input',update);selects.forEach(select=>select.addEventListener('change',update));document.getElementById('reset').addEventListener('click',()=>{search.value='';selects.forEach(select=>select.value='');update();search.focus();});update();})();
</script></body></html>"""


def md_details(record):
    text = f"**المصدر:** [{record['file']}:{record['line_start']}]({record['code_url']})\n\n"
    for field, label in (("evidence", "الدليل"), ("scenario", "السيناريو"), ("impact_ar", "الأثر"), ("fix_ar", "التعديل"), ("acceptance_ar", "القبول"), ("verification", "التحقق")):
        text += f"**{label}:** {human(record.get(field))}\n\n"
    return text


def build_markdown(audit):
    summary = audit["summary"]
    text = "# رُسوخ — تدقيق التجربة والإصدار\n\n"
    text += f"**{summary['bugs']} أخطاء** بين إعادة إنتاج وفحص مصدر، **{summary['gaps']} فجوات** متطلب أو جهاز، **{summary['risks']} مخاطر** تصميم أو إصدار. لا يصح وصف المجموع كله بأنه عيوب مثبتة.\n\n"
    text += "- لا اختبار iPhone مثبت هنا، ولا تثبيت SwiftUI مستقل.\n- صور WEB harness واختبارات الموائمات لا تثبت جودة الجهاز أو الذكاء المحلي.\n- الوثائق والمجتمع تدعم الحلول؛ الكود والاختبار يثبتان نتائج المشروع.\n\n"
    text += f"الحالة: {summary['by_status'].get('fixed-verified',0)} أصلحت واختبرت ضمن النطاق المسجل، {summary['by_status'].get('implemented-pending-verification',0)} تعديلات تنتظر التحقق، {summary['by_status'].get('open',0)} مفتوحة.\n\n"
    text += "[التقرير التفاعلي](audit.html) · [البيانات المنظمة](audit.json) · [التصميم المستهدف](TARGET_EXPERIENCE.md)\n\n## كيف يفترض أن يعمل\n\n" + "\n".join("- " + item for item in TARGET_BULLETS) + "\n\n"
    text += "## حدود الأدلة\n\n" + "\n".join("- " + item for item in audit["limits_ar"]) + "\n\n"
    text += "| التصنيف | الحالات |\n|---|---:|\n" + "".join(f"| {KINDS[kind]} | {summary['by_kind'].get(kind,0)} |\n" for kind in KINDS) + "\n"
    text += "P1 مرتفعة، P2 متوسطة، P3 منخفضة. لا P0. العدد حصيلة نطاق التدقيق وليس هدفًا.\n\n"
    text += "## الحالات\n\n"
    for finding in audit["findings"]:
        text += f"- **{finding['id']} · {finding['severity']} — {finding['title_ar']}**\n  {KINDS[finding['kind']]} · {finding['area_ar']} · {STATUSES[finding['status']]}\n\n<details>\n<summary>الدليل والتعديل ومعيار القبول</summary>\n\n"
        if finding.get("normalization_note_ar"):
            text += finding["normalization_note_ar"] + "\n\n"
        text += md_details(finding)
        text += "**حالة الإصلاح المسجلة:**\n\n```json\n" + json_text(finding["fix_status"]) + "\n```\n\n"
        for merged in finding["merged_findings"]:
            text += f"### الدليل المدمج {merged['id']}\n\n" + md_details(merged)
        external = unique([url for record in [finding, *finding["merged_findings"]] for url in record["supporting_source_urls"]])
        if external:
            text += "**مراجع تساند الحل، وليست إثباتًا لعيبنا:**\n\n" + "\n".join(f"- <{url}>" for url in external) + "\n\n"
        text += "</details>\n\n"
    text += "## الدمج والاستبعاد\n\n" + "\n".join(f"- {source} داخل {target}: {MERGE_REASONS[source]}" for source, target in MERGES.items()) + "\n- R008: نقل إلى حدود التحقق؛ بقي سجله كاملًا في audit.json ولم يحتسب مرة أخرى.\n- M001: نتيجة اعتماديات واحدة تضم بلاغين؛ عدد عقد الحزم ليس عدد عيوب مستقلة.\n\n"
    text += "## صور المعاينة\n\nWEB harness في المتصفح، لا iPhone. لا تثبت الصور VoiceOver أو الأذونات أو صلاحية التخطيط على الجهاز.\n\n"
    for shot in audit["screenshots"]:
        text += f"![{shot['caption_ar']}]({shot['file']})\n\n"
    return text


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--report-dir", type=Path, default=Path(__file__).resolve().parents[1] / "docs/research/devils-audit-20261103")
    args = parser.parse_args()
    report = args.report_dir.resolve()
    names = [*INPUTS, *(["root"] if (report / "root.json").exists() else [])]
    raw = {name: read_json(report / (name + ".json")) for name in names}
    records = {}
    for name, contents in raw.items():
        for item in contents["findings"]:
            if item["id"] in records:
                raise ValueError("Duplicate raw id: " + item["id"])
            records[item["id"]] = normalize(item, name)
    raw_count = len(records)
    required = set(MERGES) | set(MERGES.values()) | {"R008"}
    if required - records.keys():
        raise ValueError("Missing dedup ids: " + str(required - records.keys()))
    for source, destination in MERGES.items():
        records[destination]["merged_ids"].append(source)
        records[destination]["merged_findings"].append(records.pop(source))
    limitation = records.pop("R008")
    statuses, status_document = load_statuses(report / "fix-status.json")
    unknown_status_ids = []
    for ident, status in statuses.items():
        if ident not in records:
            unknown_status_ids.append(ident)
            continue
        status_name = status.get("status", "open")
        if status_name not in STATUS_ALIASES:
            raise ValueError(f"Unknown fix status {ident}: {status_name}")
        records[ident]["status"] = STATUS_ALIASES[status_name]
        records[ident]["fix_status"] = deepcopy(status)
        records[ident]["fix_status"]["status"] = records[ident]["status"]
    if unknown_status_ids:
        raise ValueError("fix-status references unknown/merged IDs: " + ",".join(unknown_status_ids))
    findings = sorted(records.values(), key=lambda record: (record["severity"], list(AREAS).index(record["area"]), record["id"]))
    for record in findings:
        assert record["kind"] in KINDS and record["severity"] in {"P1", "P2", "P3"}
        assert record["status"] in STATUSES
        assert "expo-preview/expo-preview" not in record["file"]
    by_kind = Counter(record["kind"] for record in findings)
    by_status = Counter(record["status"] for record in findings)
    snapshot_path = report / "review-snapshot.json"
    snapshot = read_json(snapshot_path)
    snapshot["upstreamReviewedCommit"] = EXPO_SHA
    snapshot["nativeReviewedCommit"] = NATIVE_SHA
    snapshot["scope_ar"] = SCOPE[:4]
    snapshot["limits"] = [
        "Reviewed Expo baseline is remote commit " + EXPO_SHA + " (0.5.0). Existing sourceHashes describe the original review snapshot, not subsequent repairs.",
        "upstreamBase is historical ancestry, not the reviewed release. Synthetic local commit 2372410 is not an upstream release identifier.",
        "No physical iPhone or SwiftUI build was run in this audit. Native source came from a separate read-only snapshot at " + NATIVE_SHA + ".",
        "307 green tests describe the prior baseline; current repair verification belongs to fix-status.json and its referenced logs, not this historical count.",
    ]
    snapshot_path.write_text(json_text(snapshot) + "\n", encoding="utf-8")
    screenshots = []
    for path in sorted((report / "screenshots").glob("*.jpg")):
        if not path.name[:2].isdigit():
            continue
        caption = {"01": "01 — الرئيسية قبل الإصلاح؛ WEB harness.", "02": "02 — نافذة التخصيص قبل الإصلاح؛ WEB harness وقد تمتد داخل المتصفح، لا قياس هاتف.", "03": "03 — إخفاء الأقسام قبل الإصلاح؛ WEB harness.", "04": "04 — معاينة بعد الإصلاح؛ WEB harness، لا اختبار جهاز."}.get(path.name[:2], path.stem + " — WEB harness، لا اختبار جهاز.")
        screenshots.append({"file": path.relative_to(report).as_posix(), "caption_ar": caption, "sha256": sha256(path.read_bytes()).hexdigest(), "environment": "web-harness", "device_validation": False})
    input_paths = [report / (name + ".json") for name in names] + [snapshot_path, report / "TARGET_EXPERIENCE.md"]
    if (report / "fix-status.json").exists():
        input_paths.append(report / "fix-status.json")
    audit = {
        "schema_version": 1,
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "upstreamReviewedCommit": EXPO_SHA,
        "nativeReviewedCommit": NATIVE_SHA,
        "baseline_version": "0.5.0",
        "scope_ar": SCOPE,
        "limits_ar": SCOPE + ["R008: نجاح الاختبارات والصور وHTTP 200 لا يثبت Files/iCloud أو VoiceOver أو استدلال النموذج والذاكرة والبطارية والحرارة على الهاتف."],
        "kind_labels_ar": KINDS,
        "status_labels_ar": STATUSES,
        "area_labels_ar": AREAS,
        "summary": {"raw_findings": raw_count, "merged_duplicates": len(MERGES), "moved_to_limits": 1, "total": len(findings), "bugs": by_kind["reproduced-bug"] + by_kind["source-bug"], "gaps": by_kind["requirement-gap"] + by_kind["device-gap"], "risks": by_kind["design-risk"] + by_kind["release-risk"], "by_kind": dict(by_kind), "by_severity": dict(Counter(record["severity"] for record in findings)), "by_status": dict(by_status)},
        "deduplication": [{"merged_id": source, "canonical_id": target, "reason_ar": MERGE_REASONS[source]} for source, target in MERGES.items()],
        "findings": findings,
        "validation_limitations": [limitation],
        "target_experience": {"file": "TARGET_EXPERIENCE.md", "status": "target-design-not-complete", "summary_ar": TARGET_BULLETS, "text_ar": (report / "TARGET_EXPERIENCE.md").read_text(encoding="utf-8")},
        "screenshots": screenshots,
        "fix_status_document": status_document,
        "input_sha256": {path.name: sha256(path.read_bytes()).hexdigest() for path in input_paths},
        "normalization_ar": ["احتفظت كل حالة بالدليل والتعديل ومعيار القبول. الأدلة المدمجة كاملة داخل merged_findings.", "المنفذ ينتظر التحقق يبقى منفصلًا عن الأصلح واختبر. حالة الجهاز لا تستنتج من أي منهما.", "R001 خطر إلغاء عرضي لتعديلات غير محفوظة P2؛ لا دليل تلف بيانات أو عطل من قصد الإلغاء نفسه.", "الدليل المحسوب أو المبني على المصدر لا يصنف معاد الإنتاج إلا مع اختبار سلوك محدد في أدلة المراجع."],
    }
    assert len(findings) == raw_count - len(MERGES) - 1
    (report / "audit.json").write_text(json_text(audit) + "\n", encoding="utf-8")
    (report / "AUDIT.md").write_text(build_markdown(audit), encoding="utf-8")
    (report / "audit.html").write_text(build_html(audit, report), encoding="utf-8")
    print(json_text({"output": str(report), "summary": audit["summary"], "screenshots": [shot["file"] for shot in screenshots], "fix_status_loaded": status_document is not None}))


if __name__ == "__main__":
    main()
