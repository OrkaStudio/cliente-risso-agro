"""Webhook contra PostgreSQL descartable. El modo de conversación puede usar el modelo real."""
import argparse
import os,subprocess,time,shutil
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--modelo-real', action='store_true', help='Repite charlas con Anthropic y datos ficticios. Meta permanece simulado.')
args = parser.parse_args()
if args.modelo_real and not os.environ.get('ANTHROPIC_API_KEY'):
    parser.error('Falta ANTHROPIC_API_KEY para probar el modelo real.')

here=Path(__file__).resolve().parent
root=here.parents[3]
name='tropero-wa-infra-20261015'
port='55442'
cached=[*Path.home().glob('.npm/_npx/*/node_modules/@deno/linux-x64-glibc/deno'),*Path.home().glob('.npm/_npx/*/node_modules/deno/deno')]
deno=os.environ.get('DENO_BIN') or shutil.which('deno') or (str(cached[-1]) if cached else None)
assert deno,'Instalar Deno 2 o indicar DENO_BIN; no se usan credenciales de producción'
assert not subprocess.check_output(['docker','ps','-a','--filter','name=^/'+name+'$','--format','{{.Names}}'],text=True).strip(),'Ya existe un contenedor con ese nombre; no se toca'
subprocess.run(['docker','run','--rm','-d','--name',name,'-e','POSTGRES_PASSWORD=qa_local_only','-p','127.0.0.1:'+port+':5432','postgres:16'],check=True,stdout=subprocess.DEVNULL)
try:
    for attempt in range(30):
        if subprocess.run(['docker','exec',name,'pg_isready','-U','postgres'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode==0:break
        time.sleep(1)
    else:raise RuntimeError('Postgres local no arrancó')
    time.sleep(1)
    for file in [here.parent/'esquema.sql',here.parent/'piloto'/'esquema-extra.sql',root/'supabase/migrations/20261015120000_whatsapp_piloto_productores.sql',root/'supabase/migrations/20261015200000_infraestructura_carga_whatsapp.sql']:
        subprocess.run(['docker','exec','-i',name,'psql','-U','postgres','-v','ON_ERROR_STOP=1'],input=file.read_text(),text=True,check=True,stdout=subprocess.DEVNULL)
    env=dict(os.environ,SUPABASE_DB_URL='postgres://postgres:qa_local_only@127.0.0.1:'+port+'/postgres',WA_QA_LOCAL_DB='1',
             WA_QA_MODELO_REAL='1' if args.modelo_real else '0')
    red = '127.0.0.1:'+port+(',api.anthropic.com:443' if args.modelo_real else '')
    subprocess.run([deno,'run','--check','--no-config','--no-lock','--node-modules-dir=none','--allow-env','--allow-read','--allow-write','--allow-net='+red,str(here/'integracion.ts')],env=env,check=True)
finally:
    subprocess.run(['docker','rm','-f',name],check=True,stdout=subprocess.DEVNULL)
