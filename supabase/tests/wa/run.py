"""QA del db.ts real en un Postgres descartable, sin credenciales ni acceso a producción."""
import os,shutil,subprocess,time
from pathlib import Path

root=Path(__file__).resolve().parent
name='tropero-wa-v14-qa'
port='55439'
candidates=list(Path.home().glob('.npm/_npx/*/node_modules/deno/deno'))
deno=shutil.which('deno') or (str(candidates[-1]) if candidates else None)
assert deno,'Se requiere Deno disponible en WSL'
assert not subprocess.check_output(['docker','ps','-a','--filter','name=^/'+name+'$','--format','{{.Names}}'],text=True).strip(),'Ya existe el contenedor de QA: no tocarlo'
subprocess.run(['docker','run','--rm','-d','--name',name,'-e','POSTGRES_PASSWORD=qa_local_only','-p','127.0.0.1:'+port+':5432','postgres:16'],check=True,stdout=subprocess.DEVNULL)
try:
    for attempt in range(30):
        if subprocess.run(['docker','exec',name,'pg_isready','-U','postgres'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode==0: break
        time.sleep(1)
    else: raise RuntimeError('Postgres de QA no arrancó')
    subprocess.run(['docker','exec','-i',name,'psql','-U','postgres','-v','ON_ERROR_STOP=1'],input=(root/'esquema.sql').read_text(),text=True,check=True,stdout=subprocess.DEVNULL)
    env=dict(os.environ,SUPABASE_DB_URL='postgres://postgres:qa_local_only@127.0.0.1:'+port+'/postgres',WA_QA_LOCAL_DB='1')
    subprocess.run([deno,'run','--no-config','--no-lock','--node-modules-dir=none','--allow-env','--allow-net=127.0.0.1:'+port,'--allow-read',str(root/'db.integration.ts')],env=env,check=True)
finally:
    subprocess.run(['docker','rm','-f',name],check=True,stdout=subprocess.DEVNULL)
