"""QA firmado del mapa publicado. Sólo Fran/Orka Pruebas; no confirma cargas de campo."""
import datetime,hashlib,json,runpy,sys,time,urllib.request,uuid
from pathlib import Path

assert '--qa-authorized' in sys.argv,'El QA envía respuestas reales sólo al número propio de Fran.'
assert '--expected-version' in sys.argv,'Falta indicar la publicación esperada.'
expected=int(sys.argv[sys.argv.index('--expected-version')+1])
h=runpy.run_path(str(Path(__file__).with_name('signed_qa.py')))
db=h['db'];ROOT=h['ROOT'];LINK=h['LINK'];PHONE=h['PHONE'];TENANT=h['TENANT'];USER=h['USER']
if '--output-dir' in sys.argv:
    ROOT=Path(sys.argv[sys.argv.index('--output-dir')+1]);ROOT.mkdir(parents=True,exist_ok=True)
assert h['function']()['version']==expected,'Publicación distinta a la esperada.'
h['assert_link']()
last=db(f"select max(created_at)::text as t from wa_mensaje where telefono='{PHONE}' and direccion='entrante' and wamid not like 'wamid.qa_%'")[0]['t']
assert last and datetime.datetime.now(datetime.timezone.utc)-datetime.datetime.fromisoformat(last)<datetime.timedelta(hours=23),'La ventana de QA necesita un mensaje genuino reciente.'
LP='1e17a3e2-8bb3-483b-ac7d-ab687e9b4333'
assert db(f"select id from campo where id='{LP}' and empresa_id='{TENANT}'"),'El campo de QA ya no existe.'
events=[];cases=[]
pending=lambda:db(f"select pendiente from wa_vinculo where id='{LINK}'")[0]['pendiente']
baseline=h['snapshot']()
def persist():
    (ROOT/'mapa-live.json').write_text(json.dumps({'version':expected,'cases':cases,'events':events,'entrada_meta':'simulada y firmada; respuestas/persistencia reales'},ensure_ascii=False,indent=2))
def send(text,expect_image=False):
    stamp=db('select clock_timestamp()::text as t')[0]['t']
    mid='wamid.qa_mapa_'+uuid.uuid4().hex
    msg={'id':mid,'from':PHONE,'timestamp':str(int(time.time())),'type':'text','text':{'body':text}}
    body={'object':'whatsapp_business_account','entry':[{'id':'4022350341234453','changes':[{'field':'messages','value':{'messaging_product':'whatsapp','metadata':{'phone_number_id':'1415816181604916'},'messages':[msg]}}]}]}
    event={'texto':text,'at':stamp,'wamid_entrante':mid,'http':h['signed'](body)};events.append(event);persist()
    assert event['http']['status']==200,'Webhook rechazó la entrada.'
    deadline=time.monotonic()+55
    while time.monotonic()<deadline:
        rows=db(f"select id,cuerpo,estado from wa_mensaje where vinculo_id='{LINK}' and direccion='saliente' and created_at>'{stamp}' order by created_at")
        good=[r for r in rows if r['cuerpo'].get('type')=='image'] if expect_image else rows
        if good:
            event['respuestas']=rows;event['pending']=pending();persist();return good[-1]
        time.sleep(1)
    event['pending']=pending();persist();raise AssertionError('No llegó la respuesta esperada; revisar logs del webhook antes de repetir.')
def case(name,fn):
    try: fn();cases.append({'case':name,'result':'PASS'});persist();print('PASA '+name,flush=True)
    except Exception as ex: cases.append({'case':name,'result':'FAIL','error':h['redact'](str(ex))});persist();raise
def business():
    s=h['snapshot']();return {k:s[k] for k in ['observations','rain','expenses']}
before=business();initial_pending=pending()
def image_case():
    row=send('mapa de La Porteña',True)
    if '--expect-satellite' in sys.argv:
        assert not row['cuerpo']['image']['caption'].startswith('Croquis'),'El proveedor no respondió: llegó el croquis de respaldo.'
    assert row['cuerpo']['tropero_mapa']['campo_id']==LP
    assert pending()==initial_pending,'Mapa cambió el pendiente.'
    assert business()==before,'Consulta de mapa modificó datos de campo.'
    media=row['cuerpo']['image']['id']
    token=next((h['env'][key] for key in ['WA_TOKEN','META_ACCESS_TOKEN','META_SYSTEM_USER_TOKEN','META_TOKEN','META_SYSTEM_TOKEN','META_WHATSAPP_TOKEN','WHATSAPP_TOKEN'] if h['env'].get(key)),None)
    assert token,'Falta token local para comprobar el PNG recibido por Meta.'
    req=urllib.request.Request('https://graph.facebook.com/v23.0/'+media,headers={'Authorization':'Bearer '+token})
    with urllib.request.urlopen(req,timeout=30) as response: info=json.load(response)
    assert info['mime_type'] in ['image/png','image/jpeg']
    req=urllib.request.Request(info['url'],headers={'Authorization':'Bearer '+token})
    with urllib.request.urlopen(req,timeout=30) as response: data=response.read(5*1024*1024+1)
    assert len(data)<5*1024*1024
    jpeg=info['mime_type']=='image/jpeg'
    assert (data[:2]==b'\xff\xd8' and data[-2:]==b'\xff\xd9') if jpeg else data[:8]==b'\x89PNG\r\n\x1a\n'
    (ROOT/('mapa-meta.jpg' if jpeg else 'mapa-meta.png')).write_bytes(data)
    event={'mime':info['mime_type'],'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}
    events.append(event);persist()
case('Mapa real renderizado en Edge, subido a Meta y conserva el pendiente',image_case)
def weekly_case():
    row=send('resumen semanal')
    text=row['cuerpo'].get('text',{}).get('body','')
    assert 'todavía no está activado' in text
    assert pending()==initial_pending and business()==before
case('Resumen semanal inactivo informa el estado y no modifica la carga',weekly_case)
if initial_pending is None:
    def draft_case():
        send('En La Porteña vi un eléctrico cortado, pero no recuerdo el potrero.')
        p=pending();assert p and p['tipo'] in ['potrero','ubicacion'],p
        send('no me acuerdo');assert pending()==p,'No recordar descartó la observación.'
        send('mapa de La Porteña',True);assert pending()==p,'La imagen reinició el borrador.'
    case('Novedad pendiente sobrevive a no recordar y pedir otra imagen',draft_case)
    def resolve_case():
        # Responder el potrero confirma ahora la observación única; se prueba sólo localmente.
        send('cancelar');assert pending() is None and business()==before,'Cancelar modificó datos de campo.'
    case('Cancelar la observación pendiente evita escrituras',resolve_case)
else:
    cases.append({'case':'Recorrida sintética nueva','result':'SKIP','reason':'Hay una carga genuina pendiente; no se reemplaza.'});persist()
if '--expect-satellite' in sys.argv:
    def no_location_case():
        for event in events:
            for row in event.get('respuestas',[]):
                assert row['cuerpo'].get('interactive',{}).get('type')!='location_request_message','La recorrida sigue solicitando GPS.'
    case('Recorrida y mapa se completan sin solicitud de ubicación',no_location_case)
print(json.dumps({'version':expected,'casos_aprobados':sum(c['result']=='PASS' for c in cases),'casos_omitidos':sum(c['result']=='SKIP' for c in cases),'resultado':str(ROOT),'datos_campo_modificados':False},ensure_ascii=False),flush=True)
