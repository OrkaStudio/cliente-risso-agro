"""Pruebas del asistente en Postgres descartable. Nunca usa la base productiva."""
import argparse,hashlib,json,os,re,shutil,subprocess,time
from pathlib import Path
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--modelo-real',action='store_true')
p.add_argument('--repeticiones',type=int,default=1)
p.add_argument('--caso',default='')
a=p.parse_args()
if not 1<=a.repeticiones<=5:p.error('Repeticiones entre 1 y 5')
if a.modelo_real and not os.environ.get('ANTHROPIC_API_KEY'):p.error('Configurar clave QA por variable, sin pegarla en el chat')
here=Path(__file__).resolve().parent
root=here.parents[3]
name='tropero-wa-asistente-20261123';port='55443'
cached=list(Path.home().glob('.npm/_npx/*/node_modules/@deno/linux-x64-glibc/deno'))
deno=shutil.which('deno') or (str(cached[-1]) if cached else None)
assert deno,'Deno no disponible'
assert not subprocess.check_output(['docker','ps','-a','--filter','name=^/'+name+'$','--format','{{.Names}}'],text=True).strip(),'No tocar un contenedor preexistente'
subprocess.run(['docker','run','--rm','-d','--name',name,'-e','POSTGRES_PASSWORD=qa_asistente_only','-p','127.0.0.1:'+port+':5432','postgres:16'],check=True,stdout=subprocess.DEVNULL)
def sql(text):subprocess.run(['docker','exec','-i',name,'psql','-U','postgres','-v','ON_ERROR_STOP=1'],input=text,text=True,check=True,stdout=subprocess.DEVNULL)
try:
    for _ in range(30):
        if subprocess.run(['docker','exec',name,'pg_isready','-U','postgres'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode==0:break
        time.sleep(1)
    else:raise RuntimeError('Postgres local no arrancó')
    for f in [here.parent/'esquema.sql',here.parent/'piloto/esquema-extra.sql',root/'supabase/migrations/20261015120000_whatsapp_piloto_productores.sql',root/'supabase/migrations/20261015200000_infraestructura_carga_whatsapp.sql',here/'esquema-extra.sql',root/'supabase/migrations/20261123120000_whatsapp_asistente.sql']:sql(f.read_text())
    for nombre,archivo in [('dar_baja_animal','20260607214019_hacienda_rpcs.sql'),('mover_animales','20260712190000_mover_animales.sql'),('crear_animales_masivo','20260629140000_crear_animales_masivo.sql')]:
        fuente=(root/'supabase/migrations'/archivo).read_text()
        funcion=re.search(r'create or replace function '+nombre+r'\([\s\S]*?\$\$;',fuente)
        assert funcion,nombre
        sql(funcion.group(0))
    env=dict(os.environ,SUPABASE_DB_URL='postgres://postgres:qa_asistente_only@127.0.0.1:'+port+'/postgres',
        SUPABASE_URL='https://qa.invalid',SUPABASE_SERVICE_ROLE_KEY='qa_service_only',WA_QA_ASISTENTE='1',
        WA_QA_MODELO_REAL='1' if a.modelo_real else '0',WA_QA_REPETICIONES=str(a.repeticiones),WA_QA_CASO=a.caso)
    def snapshot():
        files=sorted((root/'supabase/functions').rglob('*.ts'))+[root/'supabase/migrations/20261123120000_whatsapp_asistente.sql']
        return hashlib.sha256(json.dumps([(str(f.relative_to(root)),hashlib.sha256(f.read_bytes()).hexdigest()) for f in files]).encode()).hexdigest()
    fingerprint=snapshot()
    env['WA_QA_SOURCE_SHA']=fingerprint
    red='127.0.0.1:'+port+(',api.anthropic.com:443' if a.modelo_real else '')
    subprocess.run([deno,'run','--check','--no-config','--no-lock','--node-modules-dir=none','--allow-env','--allow-read','--allow-write','--allow-net='+red,str(here/'integracion.ts')],env=env,check=True)
    assert snapshot()==fingerprint,'El código cambió durante la prueba; repetir antes de acreditar el resultado'
finally:subprocess.run(['docker','rm','-f',name],stdout=subprocess.DEVNULL,check=True)