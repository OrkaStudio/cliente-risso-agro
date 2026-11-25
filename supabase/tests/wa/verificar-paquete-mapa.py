"""Verifica los assets del mapa en un ESZIP compilado, no en el fuente local."""
from pathlib import Path
import argparse
import hashlib
import json

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('bundle', type=Path, help='ESZIP sin compresión obtenido del runtime o de Management API')
args = parser.parse_args()
root = Path(__file__).resolve().parents[3]
raw = args.bundle.read_bytes()
if not raw.startswith(b'ESZIP2.'):
    parser.error('Se requiere el ESZIP sin comprimir; no un ZIP ni el contenedor EZBR.')
assets = []
for name in ('Inter.ttf', 'resvg.wasm'):
    path = root / 'supabase/functions/wa-webhook/mapa-assets' / name
    payload = path.read_bytes()
    entry = ('static:functions/wa-webhook/mapa-assets/' + name).encode()
    if entry not in raw or payload not in raw:
        parser.error('Falta el registro estático o el contenido exacto de ' + name)
    assets.append({'nombre': name, 'bytes': len(payload), 'sha256': hashlib.sha256(payload).hexdigest()})
print(json.dumps({'mapa_assets': 'ok', 'bundle_sha256': hashlib.sha256(raw).hexdigest(), 'assets': assets}))