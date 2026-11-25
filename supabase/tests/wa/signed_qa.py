import tempfile
import datetime,hashlib,hmac,json,re,shlex,sys,time,urllib.request,urllib.error,uuid
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT=Path(tempfile.mkdtemp(prefix='tropero-wa-qa-'))
ROOT.mkdir(exist_ok=True)
REF='voippiczkxbxsreiqiqu'
PHONE='5492244426824'
USER='4a9d0aac-21d7-4457-89d6-9e57b8cd76bf'
TENANT='7e57e57e-0000-4000-8000-000000000001'
LINK='f66f2e77-7732-4811-b65a-69d98854000f'
pat=(Path.home()/'.supabase/access-token').read_text().strip()
env={}
for line in (Path.home()/'.config/orka/meta.env').read_text().splitlines():
    line=line.strip().removeprefix('export ')
    if '=' in line and not line.startswith('#'):
        key,value=line.split('=',1)
        try: env[key.strip()]=shlex.split(value)[0]
        except (ValueError,IndexError): pass
secret=env.get('WA_APP_SECRET','').strip()

def redact(value):
    for key in [pat,*env.values()]:
        if len(key)>12: value=value.replace(key,'[REDACTED]')
    return value

def request(path,body=None):
    req=urllib.request.Request('https://api.supabase.com/v1/projects/'+REF+path,
        data=None if body is None else json.dumps(body).encode(),headers={'Authorization':'Bearer '+pat,'Content-Type':'application/json'})
    try:
        with urllib.request.urlopen(req,timeout=35) as response: return json.load(response)
    except urllib.error.HTTPError as e:
        raise RuntimeError(redact('Management HTTP '+str(e.code)+': '+e.read().decode()[:250])) from None

def db(query):
    return request('/database/query',{'query':query,'read_only':True})

def function():
    return next(f for f in request('/functions') if f['slug']=='wa-webhook')

def signed(body):
    assert secret,'WA_APP_SECRET no disponible'
    data=json.dumps(body,separators=(',',':'),ensure_ascii=False).encode()
    signature='sha256='+hmac.new(secret.encode(),data,hashlib.sha256).hexdigest()
    req=urllib.request.Request('https://'+REF+'.supabase.co/functions/v1/wa-webhook',data=data,
        headers={'Content-Type':'application/json','X-Hub-Signature-256':signature},method='POST')
    try:
        with urllib.request.urlopen(req,timeout=35) as response: return {'status':response.status,'body':response.read().decode()[:200]}
    except urllib.error.HTTPError as e: return {'status':e.code,'body':redact(e.read().decode()[:200])}

def assert_link():
    rows=db(f"select v.id,v.user_id,v.empresa_id,v.activo,e.nombre from wa_vinculo v join empresa e on e.id=v.empresa_id where v.telefono='{PHONE}'")
    assert len(rows)==1 and rows[0]['id']==LINK and rows[0]['user_id']==USER and rows[0]['empresa_id']==TENANT and rows[0]['activo'] is True and rows[0]['nombre']=='Orka Pruebas','Vinculo de QA distinto al autorizado'
    return rows[0]

def snapshot():
    day=datetime.datetime.now(ZoneInfo('America/Argentina/Buenos_Aires')).date().isoformat()
    return {'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'date':day,
        'link':db(f"select pendiente,pendiente_at from wa_vinculo where id='{LINK}'")[0],
        'observations':db(f"select r.id as recorrida_id,r.campo_id,r.fecha,r.created_by,op.id,op.potrero_id,op.agua,op.pasto,op.electrico,op.conteo,op.novedad from recorrida r left join observacion_potrero op on op.recorrida_id=r.id where r.empresa_id='{TENANT}' and r.fecha='{day}' order by r.id,op.id"),
        'rain':db(f"select id,campo_id,fecha,mm from lluvia where empresa_id='{TENANT}' and fecha='{day}' order by id"),
        'expenses':db(f"select id,campo_id,monto,contraparte,descripcion from movimiento_financiero where empresa_id='{TENANT}' and created_by='{USER}' and (created_at at time zone 'America/Argentina/Buenos_Aires')::date='{day}' order by id")}

if __name__=='__main__':
    action=sys.argv[1]
    if action=='preflight':
        report={'secret_present':bool(secret),'expected_format':bool(re.fullmatch('[0-9a-fA-F]{32}',secret))}
        if not secret:
            print(json.dumps(report));sys.exit(2)
        secrets=request('/secrets')
        entry=next((s for s in secrets if s['name']=='WA_APP_SECRET'),None)
        report['function']={k:function()[k] for k in ('version','status','verify_jwt')}
        report['qa_link']=assert_link()
        report['signed_empty_request']=signed({'object':'whatsapp_business_account','entry':[]})
        (ROOT/'preflight.json').write_text(json.dumps(report,indent=2))
        print(json.dumps(report))
        # La firma aceptada por el runtime es la comprobación decisiva. El
        # digest administrativo no se usa como prueba del valor del secret.
        assert report['signed_empty_request']['status']==200,'El servidor rechazo la firma'
        baseline=snapshot()
        assert baseline['link']['pendiente'] is None,'Hay una conversacion pendiente: no interferir'
        (ROOT/'baseline.json').write_text(json.dumps(baseline,indent=2))
        print(json.dumps({'baseline_saved':True,'pending':None,'observations':len(baseline['observations'])}))
