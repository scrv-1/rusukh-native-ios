"""Synthetic feasibility probe; not an iOS integration or device benchmark."""
import errno
import hashlib
import json
import os
from pathlib import Path
import resource
import socket
import sys
import time

VARIANTS = {
    "0.6B": ("Qwen/Qwen3-0.6B-MLX-4bit", "173234aa840d113125e9f2271100ddbaf16c9620"),
    "1.7B": ("Qwen/Qwen3-1.7B-MLX-4bit", "21457c6f51ed54a7c16e988c0844db973815c137"),
    "4B": ("Qwen/Qwen3-4B-MLX-4bit", "52a5ab34fa604bc8af6d3ce0cac0cab10b7eb495"),
}
MODEL, REVISION = VARIANTS[os.environ.get("MODEL_VARIANT", "0.6B")]
EVIDENCE = Path("evidence")


def write(name, value):
    EVIDENCE.mkdir(exist_ok=True)
    (EVIDENCE / name).write_text(json.dumps(value, ensure_ascii=False, indent=2))


def download(folder):
    from huggingface_hub import snapshot_download

    snapshot_download(
        MODEL, revision=REVISION, local_dir=folder, token=False,
        allow_patterns=["*.json", "*.safetensors", "*.txt", "*.jinja", "LICENSE", "README.md"],
    )
    files = []
    for path in sorted(folder.iterdir()):
        if not path.is_file():
            continue
        with path.open("rb") as handle:
            digest = hashlib.file_digest(handle, "sha256").hexdigest()
        files.append({"name": path.name, "bytes": path.stat().st_size, "sha256": digest})
    write("ai-model-manifest.json", {"model": MODEL, "revision": REVISION, "files": files,
                                     "total_bytes": sum(f["bytes"] for f in files)})
    # Preserve the actual upstream license, not only the model card label.
    (EVIDENCE / "model-LICENSE.txt").write_bytes((folder / "LICENSE").read_bytes())
    print(json.dumps({"model": MODEL, "revision": REVISION, "files": files,
                      "downloaded_bytes": sum(f["bytes"] for f in files)}), flush=True)


def evaluate(folder):
    # The workflow's sandbox denies network to this entire process and its children.
    # A refused TCP port alone is not evidence of a network sandbox.
    try:
        connection = socket.create_connection(("127.0.0.1", 9), timeout=2)
    except OSError as error:
        if error.errno not in (errno.EPERM, errno.EACCES):
            raise RuntimeError("Network denial not proven: " + repr(error)) from error
        network_proof = {"denied": True, "errno": error.errno, "error": str(error)}
    else:
        connection.close()
        raise RuntimeError("Network was not denied")
    write("ai-network-denial.json", network_proof)
    print("NETWORK_DENIAL_CONFIRMED " + json.dumps(network_proof), flush=True)

    import mlx.core as mx
    metal = mx.metal.is_available()
    mx.set_default_device(mx.gpu if metal else mx.cpu)
    from mlx_lm import load, stream_generate
    from mlx_lm.sample_utils import make_sampler

    start = time.perf_counter()
    model, tokenizer = load(str(folder), trust_remote_code=False)
    report = {
        "model": MODEL, "revision": REVISION, "backend": "Metal GPU" if metal else "CPU",
        "scope": "cloud Mac Python MLX; not Swift/iOS/iPhone/Neural Engine",
        "network_denied": True, "load_seconds": time.perf_counter() - start,
        "quality_status": "Human review required; execution success is not accuracy",
        "memory_scope": "Cumulative process peaks, not isolated per-case allocations",
        "cases": [],
    }
    cases = [
        ("summary", "لخّص في جملة عربية واحدة: الاسترجاع النشط هو محاولة تذكر المعلومات دون النظر إلى المصدر. المراجعة المتباعدة توزع جلسات التعلم على أيام مختلفة."),
        ("grounded_answer", "الملاحظة: عاصمة فرنسا باريس. أجب بكلمة واحدة اعتمادًا على الملاحظة فقط: ما عاصمة فرنسا؟"),
        ("flashcard", "حوّل هذه المعلومة إلى بطاقة عربية بصيغة س: ثم ج: فقط: الماء يتكون من الهيدروجين والأكسجين."),
        ("unknown", "الملاحظة: أحمد يراجع دروسه يوميًا. كم عمر أحمد؟ إذا لم يذكر العمر، قل غير مذكور. لا تخمّن."),
        ("negation", "الملاحظة: الضوء موجة كهرومغناطيسية، وليس موجة صوتية. هل الضوء موجة صوتية؟ أجب بالعربية باختصار وفق الملاحظة."),
        ("schedule", "الملاحظة: راجع الدرس بعد يوم ثم ثلاثة أيام ثم سبعة أيام. استخرج مواعيد المراجعة الثلاثة كما وردت، دون إضافة موعد."),
        ("explain", "اشرح لطالب بالعربية في جملتين معنى الاسترجاع النشط، واذكر مثالًا عمليًا واحدًا."),
        ("faithfulness", "اعتمد على النص التالي فقط: يتجمد الماء النقي عند صفر درجة مئوية في الضغط الجوي العادي. أنشئ سؤالًا وجوابًا عربيين عن درجة التجمد. لا تضف معلومات."),
    ]
    for name, prompt in cases:
        text = tokenizer.apply_chat_template(
            [{"role": "user", "content": prompt}], tokenize=False,
            add_generation_prompt=True, enable_thinking=False,
        )
        begin = time.perf_counter()
        output, final = "", None
        for response in stream_generate(model, tokenizer, text, max_tokens=128,
                                        max_kv_size=1024, sampler=make_sampler(temp=0)):
            output += response.text
            final = response
        if final is None or not output.strip():
            raise RuntimeError("No generated text for " + name)
        result = {"name": name, "prompt": prompt, "output": output,
                  "seconds": time.perf_counter() - begin,
                  "prompt_tokens": final.prompt_tokens, "generated_tokens": final.generation_tokens,
                  "tokens_per_second": final.generation_tps, "mlx_peak_memory_gb": final.peak_memory,
                  "finish_reason": final.finish_reason,
                  "process_peak_rss_bytes_macos": resource.getrusage(resource.RUSAGE_SELF).ru_maxrss}
        report["cases"].append(result)
        write("ai-results.json", report)
        print(json.dumps(result, ensure_ascii=False), flush=True)
    with Path(os.environ["GITHUB_STEP_SUMMARY"]).open("a") as handle:
        handle.write("## Local Arabic model feasibility\n\n")
        handle.write(f"{MODEL} at `{REVISION}`; backend: {report['backend']}.\n\n")
        handle.write(f"{len(cases)} synthetic prompts generated with process network access denied by macOS sandbox. See raw answers and cumulative process memory peaks in the artifact. This is a cloud Mac Python evaluation, not an iOS integration, iPhone installation, accuracy certification or Neural Engine test.\n")


if __name__ == "__main__":
    mode, directory = sys.argv[1:]
    folder = Path(directory).resolve()
    if mode == "download":
        download(folder)
    elif mode == "evaluate":
        evaluate(folder)
    else:
        raise ValueError(mode)
