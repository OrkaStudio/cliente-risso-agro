import datetime,json,runpy,sys,time,uuid,urllib.request
from pathlib import Path
base=Path(__file__).parent
h=runpy.run_path(str(base/'signed_qa.py'))
db=h['db']; signed=h['signed']; snapshot=h['snapshot']; ROOT=h['ROOT']
PHONE=h['PHONE']; USER=h['USER']; TENANT=h['TENANT']; LINK=h['LINK']
DG='3e8071fe-0049-4057-8ff9-1e60665e6d2b'; LP='1e17a3e2-8bb3-483b-ac7d-ab687e9b4333'
assert '--qa-authorized' in sys.argv,'Se requiere --qa-authorized: envía respuestas al número de Fran y escribe sólo en Orka Pruebas'
assert '--expected-version' in sys.argv,'Indicá --expected-version para no probar una publicación ajena'
expected=int(sys.argv[sys.argv.index('--expected-version')+1])
assert h['function']()['version']==expected,'La version publicada cambió'
print('Resultados sin credenciales: '+str(ROOT),flush=True)
h['assert_link']()
last=db(f"select max(created_at)::text as t from wa_mensaje where telefono='{PHONE}' and direccion='entrante' and wamid not like 'wamid.qa_%'")[0]['t']
assert last and datetime.datetime.now(datetime.timezone.utc)-datetime.datetime.fromisoformat(last)<datetime.timedelta(hours=23),'Se necesita un mensaje real reciente de Fran: las entradas simuladas no abren la ventana de respuesta de Meta'
events=[]; cases=[]

def save():
    (ROOT/('events-'+sys.argv[1]+'.json')).write_text(json.dumps({'cases':cases,'events':events},indent=2,ensure_ascii=False))

def pending():
    return db(f"select pendiente from wa_vinculo where id='{LINK}'")[0]['pendiente']

def business(s):
    return {key:s[key] for key in ('observations','rain','expenses')}

def send(kind,value,label):
    before=db('select clock_timestamp()::text as t')[0]['t']
    message={'id':'wamid.qa_codex_'+uuid.uuid4().hex,'from':PHONE,'timestamp':str(int(time.time())),'type':kind}
    if kind=='text': message['text']={'body':value}
    elif kind=='interactive': message['interactive']={'button_reply':value}
    elif kind=='location': message['location']=value
    elif kind=='audio': message['audio']={'id':value}
    elif kind=='image': message['image']=value
    else: raise ValueError('Tipo no previsto')
    body={'object':'whatsapp_business_account','entry':[{'id':'4022350341234453','changes':[{'field':'messages','value':{'messaging_product':'whatsapp','metadata':{'phone_number_id':'1415816181604916'},'messages':[message]}}]}]}
    event={'label':label,'synthetic_input':message,'before':before}
    events.append(event);save()
    event['http']=signed(body);save()
    assert event['http']['status']==200,'Webhook rechazo peticion'
    deadline=time.monotonic()+55
    while time.monotonic()<deadline:
        rows=db(f"select id,cuerpo,estado,created_at from wa_mensaje where telefono='{PHONE}' and direccion='saliente' and created_at>'{before}' order by created_at")
        if rows:
            # Si el mensaje se fragmenta, la ultima parte lleva los botones.
            last=rows[-1]
            content=last['cuerpo']
            text=content.get('text',{}).get('body') or content.get('interactive',{}).get('body',{}).get('text','')
            event.update({'outgoing':rows,'text':text,'pending':pending()});save()
            print(json.dumps({'step':label,'reply':text,'pending':event['pending']['tipo'] if event['pending'] else None},ensure_ascii=False),flush=True)
            return event
        time.sleep(1.5)
    event['timeout']=True;save();raise AssertionError('Sin respuesta antes del plazo: '+label)

def text(value,label): return send('text',value,label)

def button(event,title,label):
    interactive=event['outgoing'][-1]['cuerpo'].get('interactive',{})
    options=[b['reply'] for b in interactive.get('action',{}).get('buttons',[])]
    options.extend({'id':r['id'],'title':r['title']} for section in interactive.get('action',{}).get('sections',[]) for r in section.get('rows',[]))
    selected=next((b for b in options if title.casefold() in b['title'].casefold()),None)
    assert selected,'No aparece la opcion '+title
    return send('interactive',selected,label)

def check(label,fn):
    before=snapshot()
    try:
        fn(before)
        cases.append({'case':label,'result':'PASS','before':before,'after':snapshot()})
        save();print('PASA '+label,flush=True)
    except Exception as e:
        cases.append({'case':label,'result':'FAIL','error':h['redact'](str(e)),'before':before,'after':snapshot()})
        save();print('FALLA '+label+': '+h['redact'](str(e)),flush=True);raise

def point(field,pot):
    rows=db(f"select p.id,p.poligono from potrero p where p.campo_id='{field}' and p.nombre='{pot}' and p.empresa_id='{TENANT}'")
    assert len(rows)==1 and rows[0]['poligono']
    polygon=rows[0]['poligono']
    # Se comprobara la resolucion con el mismo poligono, sin inventar geografia.
    lat=sum(float(p[0]) for p in polygon)/len(polygon);lng=sum(float(p[1]) for p in polygon)/len(polygon)
    return {'latitude':lat,'longitude':lng},rows[0]['id']

if sys.argv[1]=='queries':
    assert pending() is None,'Hay conversacion pendiente'
    queries=[('consulta_recorrida','¿Qué me falta recorrer hoy en La Porteña?'),('consulta_observacion','¿Qué anotamos por última vez en el 7B de La Porteña?'),('consulta_novedades','Mostrame las novedades de esta semana en La Porteña'),('consulta_gastos','¿Cuánto gasté este mes en combustible en Don Gilberto?'),('consulta_cargas','¿Qué cargué por WhatsApp últimamente?')]
    for intent,question in queries:
        def run(before,intent=intent,question=question):
            event=text(question,intent)
            mid=event['synthetic_input']['id']
            rows=db(f"select c.estado,c.interpretacion from captura c join wa_mensaje m on m.id=c.mensaje_id where m.wamid='{mid}' and c.empresa_id='{TENANT}' and c.user_id='{USER}'")
            assert len(rows)==1 and rows[0]['estado']=='respondida',rows
            assert rows[0]['interpretacion']['intent']==intent,rows
            assert business(before)==business(snapshot()),'Una consulta escribio datos de campo'
        check(intent,run)
elif sys.argv[1]=='flows':
    assert pending() is None
    def help_pending(before):
        event=text('Llovieron 2 mm','ayuda: lluvia pendiente')
        p=event['pending'];assert p and p['tipo']=='campo'
        answer=text('ayuda','ayuda: no perder pendiente')
        assert answer['pending']==p and 'Sigue pendiente la lluvia' in answer['text']
        text('cancelar','ayuda: cancelar')
        assert pending() is None and business(before)==business(snapshot())
    check('ayuda conserva carga y cancelar no escribe',help_pending)
    def negative(before):
        first=text('Gasté 0 pesos en combustible para Don Gilberto','monto cero')
        assert first['pending']['tipo']=='dato' and 'mayor que cero' in first['text']
        second=text('-5','monto negativo')
        assert second['pending']['tipo']=='dato' and 'mayor que cero' in second['text']
        text('cancelar','monto: cancelar')
        assert business(before)==business(snapshot())
    check('cero y negativo no se guardan',negative)
    def dates(before):
        first=text('Llovieron 7 mm mañana en Toimil','fecha futura')
        assert first['pending']['tipo']=='corregir' and 'fecha' in first['text']
        corrected=text('Fue ayer','fecha: corregir a ayer')
        assert corrected['pending']['tipo']=='propuesta'
        assert corrected['pending']['borrador']['fecha']!=before['date']
        button(corrected,'Cancelar','fecha: cancelar')
        assert business(before)==business(snapshot())
    check('fecha futura exige correccion',dates)
    def gasto(before):
        proposal=text('Gasté 1200 pesos en gasoil para Don Gilberto','gasto con campo')
        p=proposal['pending'];assert p['tipo']=='propuesta' and p['borrador']['campoId']==DG
        assert p['borrador'].get('contraparte')!='Don Gilberto'
        result=button(proposal,'Sí','gasto: confirmar')
        after=snapshot();new=[r for r in after['expenses'] if r['id'] not in {o['id'] for o in before['expenses']}]
        assert len(new)==1 and float(new[0]['monto'])==1200 and new[0]['campo_id']==DG,new
        button(proposal,'Sí','gasto: repetir confirmacion')
        assert snapshot()['expenses']==after['expenses']
        assert 'ya está guardada' in events[-1]['text']
    check('gasto toma el campo y boton repetido no duplica',gasto)
    def rain(before):
        event=text('Llovieron 3 mm','lluvia: campo confirma')
        assert event['pending']['tipo']=='campo' and 'Al elegirlo queda guardado' in event['text']
        result=button(event,'Don Gilberto','lluvia: seleccionar')
        assert result['pending'] is None and 'anoté *3 mm*' in result['text']
        after=snapshot();new=[r for r in after['rain'] if r['id'] not in {o['id'] for o in before['rain']}]
        assert len(new)==1 and float(new[0]['mm'])==3
    check('lluvia se guarda al elegir una vez',rain)
elif sys.argv[1]=='recorrida':
    assert pending() is None
    def context(before):
        campos={r['campo_id'] for r in before['observations'] if r['created_by']==USER}
        proposal=text('En el 3 hay poco pasto','recorrida: campo de hoy')
        if len(campos)!=1 and proposal['pending']['tipo']=='potrero': proposal=button(proposal,'3B','recorrida: elegir 3B')
        assert proposal['pending']['tipo']=='propuesta'
        observations=proposal['pending']['borrador']['observaciones']
        assert len(observations)==1 and observations[0]['campoId']==LP
        button(proposal,'Sí','recorrida: confirmar 3B')
        existed=any(r['potrero_id']==observations[0]['potreroId'] for r in before['observations'])
        assert len(snapshot()['observations'])==len(before['observations'])+(0 if existed else 1)
    check('campo actual o elección explícita resuelve el potrero',context)
    def location(before):
        ask=text('Acá el molino no anda','recorrida: pedir ubicacion')
        assert ask['pending']['tipo']=='ubicacion'
        loc,pot=point(DG,'1A')
        proposal=send('location',loc,'recorrida: ubicacion 1A')
        assert proposal['pending']['tipo']=='propuesta' and proposal['pending']['borrador']['observaciones'][0]['potreroId']==pot
        button(proposal,'Sí','recorrida: guardar molino')
        assert any(r['potrero_id']==pot and 'molino' in (r['novedad'] or '') for r in snapshot()['observations'])
    check('aca pide ubicacion y guarda en el potrero real',location)
    def ambiguity(before):
        ask=text('En el 2 se cortó el alambrado','recorrida: ambiguedad')
        assert ask['pending']['tipo']=='potrero',ask['pending']
        proposal=button(ask,'2B','recorrida: elegir 2B')
        assert proposal['pending']['tipo']=='propuesta'
        button(proposal,'Sí','recorrida: guardar alambrado')
        assert len(snapshot()['observations'])==len(before['observations'])
    check('dos campos recorridos obliga a preguntar potrero ambiguo',ambiguity)
    def location_first(before):
        loc,pot=point(LP,'5B')
        reply=send('location',loc,'ubicacion antes del texto')
        assert reply['pending']['tipo']=='ubicado'
        proposal=text('Acá la aguada está baja','ubicacion: texto posterior')
        assert proposal['pending']['borrador']['observaciones'][0]['potreroId']==pot
        button(proposal,'Sí','ubicacion: confirmar aguada')
        assert any(r['potrero_id']==pot and r['agua']=='baja' for r in snapshot()['observations'])
    check('ubicacion previa sirve al siguiente mensaje',location_first)
    def nonexistent(before):
        reply=text('En el 40 hay mucha agua','potrero inexistente')
        assert reply['pending'] is None and 'No encontré' in reply['text']
        assert business(before)==business(snapshot())
    check('potrero inexistente no se guarda',nonexistent)
    def correction(before):
        initial=text('En el 1A de Don Gilberto el pasto está escaso','recorrida: propuesta para corregir')
        assert initial['pending']['tipo']=='propuesta' and initial['pending']['borrador']['tipo']=='recorrida'
        button(initial,'Corregir','recorrida: pedir correccion')
        new=text('En el 1A de Don Gilberto el pasto está abundante','recorrida: reemplazar')
        assert new['pending']['borrador']['observaciones'][0]['pasto']=='abundante'
        button(new,'Sí','recorrida: guardar correccion')
        assert len(snapshot()['observations'])==len(before['observations'])
    check('corregir reemplaza propuesta y completa fila existente',correction)
    def death(before):
        stock=db(f"select count(*) as cantidad,md5(string_agg(to_jsonb(a)::text,'|' order by id)) as huella from animal a where empresa_id='{TENANT}'")
        proposal=text('En el 3B de La Porteña encontré una vaca muerta, caravana 4521','muerte como novedad')
        assert 'Hacienda' in proposal['text'] and 'baja' in proposal['text']
        button(proposal,'Sí','muerte: confirmar novedad')
        assert db(f"select count(*) as cantidad,md5(string_agg(to_jsonb(a)::text,'|' order by id)) as huella from animal a where empresa_id='{TENANT}'")==stock,'Cambio el stock al anotar una novedad'
        assert len(snapshot()['observations'])==len(before['observations'])
    check('vaca muerta queda como novedad sin cambiar animales',death)
    def audio_expense(before):
        audio=db(f"select m.cuerpo,c.interpretacion from wa_mensaje m join captura c on c.mensaje_id=m.id where m.telefono='{PHONE}' and m.direccion='entrante' and m.tipo='audio' and m.wamid not like 'wamid.qa_%' and c.empresa_id='{TENANT}' and c.user_id='{USER}' and c.propuesta->>'tipo'='gasto' order by m.created_at desc limit 1")
        assert audio and audio[0]['cuerpo'].get('audio',{}).get('id')
        initial=send('audio',audio[0]['cuerpo']['audio']['id'],'audio propio: gasto y correccion')
        assert initial['pending']['tipo']=='propuesta' and initial['pending']['borrador']['tipo']=='gasto'
        assert float(initial['pending']['borrador']['monto'])==float(audio[0]['interpretacion']['monto'])
        button(initial,'Corregir','audio: pedir correccion')
        corrected=text('Eran 12500 pesos','audio: corregir monto')
        assert float(corrected['pending']['borrador']['monto'])==12500
        button(corrected,'Cancelar','audio: cancelar sin guardar')
        assert business(before)==business(snapshot())
    check('audio real propio se transcribe y permite corregir sin guardar',audio_expense)
elif sys.argv[1]=='photo':
    assert pending() is None
    def photo(before):
        from PIL import Image,ImageDraw,ImageFont
        image=Image.new('RGB',(1000,1000),'white')
        draw=ImageDraw.Draw(image)
        font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',32)
        lines=['COMPROBANTE DE PRUEBA','SIN VALOR FISCAL','Estacion de servicio QA',f'Fecha: {before["date"]}','GASOIL - 1 unidad','$ 1.590,00','TOTAL PAGADO: $ 1.590,00','Pago: efectivo','Documento sintetico para Orka Pruebas']
        for i,line in enumerate(lines): draw.text((45,55+i*95),line,fill='black',font=font)
        fixture=ROOT/'ticket-sintetico.png';image.save(fixture)
        boundary='qa_'+uuid.uuid4().hex
        body=(f'--{boundary}\r\nContent-Disposition: form-data; name="messaging_product"\r\n\r\nwhatsapp\r\n--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="ticket-qa.png"\r\nContent-Type: image/png\r\n\r\n').encode()+fixture.read_bytes()+f'\r\n--{boundary}--\r\n'.encode()
        token=h['env'].get('META_TOKEN')
        assert token,'No hay token local de Meta'
        req=urllib.request.Request('https://graph.facebook.com/v23.0/1415816181604916/media',data=body,headers={'Authorization':'Bearer '+token,'Content-Type':'multipart/form-data; boundary='+boundary})
        with urllib.request.urlopen(req,timeout=35) as response: media=json.load(response)
        events.append({'label':'foto: fixture sintetico subido a Meta','media_id':media['id'],'fixture':'ticket-sintetico.png'});save()
        proposal=send('image',{'id':media['id'],'mime_type':'image/png','caption':'gasoil para Don Gilberto'},'foto: leer comprobante sintetico')
        while proposal['pending'] and proposal['pending']['tipo']!='propuesta':
            if proposal['pending']['tipo']=='campo': proposal=button(proposal,'Don Gilberto','foto: elegir campo')
            elif proposal['pending']['tipo']=='categoria': proposal=button(proposal,'Combustible','foto: elegir categoria')
            else: raise AssertionError('OCR no produjo un gasto completo: '+str(proposal['pending']['tipo']))
        assert proposal['pending'] and float(proposal['pending']['borrador']['monto'])==1590
        result=button(proposal,'Sí','foto: guardar gasto y comprobante')
        assert 'No pude guardar la foto' not in result['text']
        after=snapshot();new=[r for r in after['expenses'] if r['id'] not in {o['id'] for o in before['expenses']}]
        assert len(new)==1 and float(new[0]['monto'])==1590
        saved=db(f"select comprobante_url from movimiento_financiero where id='{new[0]['id']}' and empresa_id='{TENANT}'")[0]
        assert saved['comprobante_url'],'El gasto no referencia la foto guardada'
    check('foto sintetica lee total y guarda gasto con comprobante',photo)
else: raise ValueError('Accion desconocida')
print(json.dumps({'cases':len(cases),'passed':sum(c['result']=='PASS' for c in cases)},ensure_ascii=False),flush=True)
