"""Provision the pinned synthetic-test model in the CI simulator only."""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import urllib.request

manifest = json.loads(Path('docs/qwen-model-manifest.json').read_text())
simulator = Path('evidence/simulator-id.txt').read_text().strip()
container = subprocess.check_output(['xcrun', 'simctl', 'get_app_container', simulator,
                                     'com.scrv1.rusukhnative', 'data'], text=True).strip()
folder = Path(container) / 'Library/Application Support/RusukhTestModels/Qwen3-Instruct-2507'
folder.mkdir(parents=True, exist_ok=True)
if shutil.disk_usage(folder).free < 5_000_000_000:
    raise RuntimeError('Insufficient disk for model test')
for item in manifest['files']:
    name = item['name']
    if Path(name).name != name or not 0 < item['bytes'] < 3_000_000_000:
        raise ValueError('Invalid pinned manifest')
    source = item.get('url', f"https://huggingface.co/{manifest['model']}/resolve/{manifest['revision']}/{name}")
    if not source.startswith('https://huggingface.co/'):
        raise ValueError('Unexpected model source')
    target = folder / name
    digest, count = hashlib.sha256(), 0
    with urllib.request.urlopen(source, timeout=60) as response, target.open('wb') as output:
        while chunk := response.read(1024 * 1024):
            count += len(chunk)
            if count > item['bytes']:
                raise RuntimeError('Download exceeded pinned size')
            digest.update(chunk)
            output.write(chunk)
    if count != item['bytes'] or digest.hexdigest() != item['sha256']:
        raise RuntimeError('Model integrity check failed: ' + name)
    print('VERIFIED', name, count, digest.hexdigest(), flush=True)
(folder / 'verified.txt').write_text(manifest['revision'])
Path('evidence/ai-simulator-model.json').write_text(json.dumps(manifest, indent=2))

Path("evidence/ai-simulator-model-directory.txt").write_text(str(folder))
