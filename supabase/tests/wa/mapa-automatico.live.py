"""El reporte dispara el mapa sin que el productor tenga que pedirlo antes.
Entradas firmadas simuladas; respuestas reales sólo al número de QA de Fran.
No confirma ninguna carga ni modifica datos de campo.
"""
import datetime,json,runpy,sys,time,uuid
from pathlib import Path

assert '--qa-authorized' in sys.argv and '--expected-version' in sys.argv
expected=int(sys.argv[sys.argv.index('--expected-version')+1])
root=Path(sys.argv[sys.argv.index('--output-dir')+1]);root.mkdir(parents=True,exist_ok=True)
h=runpy.run_path(str(Path(__file__).with_name('signed_qa.py')))
db=h['db'];link=h['LINK'];phone=h['PHONE']
assert h['function']()['version']==expected
h['assert_link']()
last=db(f"select max(created_at)::text as t from wa_mensaje where telefono='{phone}' and direccion='entrante' and wamid not like 'wamid.qa_%'")[0]['t']
assert last and datetime.datetime.now(datetime.timezone.utc)-datetime.datetime.fromisoformat(last)<datetime.timedelta(hours=23)
baseline=h['snapshot']();assert baseline['link']['pendiente'] is None,'Hay una carga pendiente; no se reemplaza.'
events=[]
def persist():
    (root/'automatico.json').write_text(json.dumps({'version':expected,'events':events,'entrada':'simulada y firmada; respuestas reales sólo Fran'},ensure_ascii=False,indent=2))
def send(text,kind):
    stamp=db('select clock_timestamp()::text as t')[0]['t'];mid='wamid.qa_auto_'+uuid.uuid4().hex
    body={'object':'whatsapp_business_account','entry':[{'id':'4022350341234453','changes':[{'field':'messages','value':{'messaging_product':'whatsapp','metadata':{'phone_number_id':'1415816181604916'},'messages':[{'id':mid,'from':phone,'timestamp':str(int(time.time())),'type':'text','text':{'body':text}}]}}]}]}
    event={'texto':text,'http':h['signed'](body),'at':stamp};events.append(event);persist()
    assert event['http']['status']==200
    deadline=time.monotonic()+55
    while time.monotonic()<deadline:
        rows=db(f"select cuerpo from wa_mensaje where vinculo_id='{link}' and direccion='saliente' and created_at>'{stamp}' order by created_at")
        if any(row['cuerpo'].get('type')==kind for row in rows):
            event['respuestas']=[row['cuerpo'] for row in rows];persist();return event['respuestas']
        time.sleep(1)
    raise AssertionError('No llegó la respuesta '+kind)
rows=send('En La Porteña vi un eléctrico cortado, pero no me acuerdo en qué potrero.', 'image')
image=next(row for row in rows if row['type']=='image')
assert image['image']['caption'].startswith('Vista satelital de referencia')
assert not any(row.get('interactive',{}).get('type')=='location_request_message' for row in rows)
pending=lambda:db(f"select pendiente from wa_vinculo where id='{link}'")[0]['pendiente']
p=pending();assert p and p['tipo'] in ['ubicacion','potrero']
send('7B','interactive');assert pending()['tipo']=='propuesta'
send('cancelar','text');assert pending() is None
after=h['snapshot']()
assert all(after[key]==baseline[key] for key in ['observations','rain','expenses'])
report={'version':expected,'resultado':'PASS','mapa_automatico_sin_pedido_previo':True,
    'sin_solicitud_gps':True,'completa_por_nombre':True,'datos_campo_modificados':False}
(root/'resultado.json').write_text(json.dumps(report,indent=2));persist()
print(json.dumps(report))
