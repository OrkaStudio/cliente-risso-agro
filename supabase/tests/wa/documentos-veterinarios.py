"""Webhook firmado y Meta simulado en un PostgreSQL descartable."""
import os
import shutil
import subprocess
import time
from pathlib import Path

here = Path(__file__).resolve().parent
root = here.parents[2]
name = 'troppero-wa-docs-vet-qa'
port = '55446'
cached = list(Path.home().glob('.npm/_npx/*/node_modules/@deno/linux-x64-glibc/deno'))
deno = os.getenv('DENO_BIN') or shutil.which('deno') or (str(cached[-1]) if cached else None)
assert deno, 'Instalar Deno 2 o indicar DENO_BIN.'
subprocess.run(['docker', 'run', '--rm', '-d', '--name', name, '-e', 'POSTGRES_PASSWORD=qa_local_only',
                '-p', '127.0.0.1:' + port + ':5432', 'postgres:16'], check=True, stdout=subprocess.DEVNULL)
try:
    for _ in range(30):
        if subprocess.run(['docker', 'exec', name, 'pg_isready', '-U', 'postgres', '-h', '127.0.0.1'],
                          stdout=subprocess.DEVNULL).returncode == 0:
            break
        time.sleep(1)
    else:
        raise RuntimeError('PostgreSQL descartable no arrancó.')

    def aplicar(texto):
        subprocess.run(['docker', 'exec', '-i', name, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1'],
                       input=texto, text=True, check=True, stdout=subprocess.DEVNULL)

    aplicar((here / 'esquema.sql').read_text())
    aplicar((here / 'piloto' / 'esquema-extra.sql').read_text())
    aplicar((root / 'supabase/migrations/20261112121500_wa_documentos_veterinarios.sql').read_text())
    aplicar("""
      create table caravana (empresa_id uuid, animal_id uuid, numero_rfid text, vigente boolean, fecha_alta date, fecha_baja date);
      create type tipo_evento as enum ('sanidad', 'nota');
      create table evento (id uuid primary key default gen_random_uuid(), empresa_id uuid, animal_id uuid,
        tipo tipo_evento, fecha date, datos jsonb, nota text, created_by uuid default auth.uid());
      grant select on caravana to authenticated;
      grant select, insert on evento to authenticated;
      alter table caravana enable row level security;
      alter table evento enable row level security;
      create policy caravana_qa on caravana for select using (empresa_id in (select auth_empresa_ids()));
      create policy evento_qa on evento using (empresa_id in (select auth_empresa_ids()));
    """)
    env = dict(os.environ, SUPABASE_DB_URL='postgres://postgres:qa_local_only@127.0.0.1:' + port + '/postgres',
               WA_QA_DOCS='1', WA_QUEUE_ENABLED='false', WA_AGENDA_OPERATIVA_ENABLED='false')
    subprocess.run([deno, 'run', '--check', '--no-config', '--no-lock', '--allow-env', '--allow-read',
                    '--allow-net=127.0.0.1:' + port, str(here / 'documentos-veterinarios.integration.ts')],
                   env=env, check=True)
finally:
    subprocess.run(['docker', 'rm', '-f', name], check=True, stdout=subprocess.DEVNULL)
