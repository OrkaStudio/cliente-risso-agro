"""Postgres descartable exclusivo del resumen semanal; nunca usa producción."""
import os,shutil,subprocess,time
from pathlib import Path
root=Path(__file__).resolve().parent
name='tropero-wa-weekly-qa';port='55440'
candidates=list(Path.home().glob('.npm/_npx/*/node_modules/deno/deno'))
deno=shutil.which('deno') or (str(candidates[-1]) if candidates else None)
assert deno,'Deno no disponible'
assert not subprocess.check_output(['docker','ps','-a','--filter','name=^/'+name+'$','--format','{{.Names}}'],text=True).strip(),'No sobrescribir un contenedor existente'
subprocess.run(['docker','run','--rm','-d','--name',name,'-e','POSTGRES_PASSWORD=qa_local_only','-p','127.0.0.1:'+port+':5432','postgres:16'],check=True,stdout=subprocess.DEVNULL)
try:
    for attempt in range(30):
        if subprocess.run(['docker','exec',name,'pg_isready','-U','postgres'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode==0:break
        time.sleep(1)
    else:raise RuntimeError('Postgres no arrancó')
    project=root.parents[3]
    schema=(root.parent/'esquema.sql').read_text()+'''\n
create role anon nologin; create role service_role nologin;
create schema interno; create table if not exists auth.users(id uuid primary key);
create table if not exists wa_vinculo(id uuid primary key,telefono text,user_id uuid,empresa_id uuid,activo boolean default true,pendiente jsonb,pendiente_at timestamptz);
alter table movimiento_financiero add column if not exists fecha_vencimiento date,add column if not exists descripcion text,add column if not exists contraparte text;
-- animal ya viene en esquema.sql (con su RLS).
'''+(project/'supabase/migrations/20261013010000_whatsapp_resumen_semanal.sql').read_text()+'''
-- Un resumen por cuenta (20261114150000_varias_cuentas_bot, sólo la parte del resumen).
alter table interno.wa_resumen_config add column empresa_id uuid;
alter table interno.wa_resumen_config drop constraint wa_resumen_config_pkey;
alter table interno.wa_resumen_config add primary key (vinculo_id, empresa_id);
alter table interno.wa_resumen_envio drop constraint wa_resumen_envio_vinculo_id_desde_hasta_key;
alter table interno.wa_resumen_envio add constraint wa_resumen_envio_un_envio_por_cuenta unique (vinculo_id, empresa_id, desde, hasta);
'''
    subprocess.run(['docker','exec','-i',name,'psql','-U','postgres','-v','ON_ERROR_STOP=1'],input=schema,text=True,check=True,stdout=subprocess.DEVNULL)
    env=dict(os.environ,SUPABASE_DB_URL='postgres://postgres:qa_local_only@127.0.0.1:'+port+'/postgres',WA_QA_WEEKLY_LOCAL_DB='1')
    subprocess.run([deno,'run','--no-config','--no-lock','--node-modules-dir=none','--allow-env','--allow-net=127.0.0.1:'+port,'--allow-read',str(root/'db.test.ts')],env=env,check=True)
finally:
    subprocess.run(['docker','rm','-f',name],check=True,stdout=subprocess.DEVNULL)
