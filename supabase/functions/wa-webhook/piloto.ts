import { comandoPiloto, textoComparacion } from '../_shared/wa/piloto.ts'
import { esFecha, norm, numeroEn, pesos } from '../_shared/wa/texto.ts'
import { resolverCampo, resolverReferenciaPotrero, potreroPorId } from '../_shared/wa/resolver.ts'
import type { Borrador, Contexto, Mensaje, Pendiente } from '../_shared/wa/tipos.ts'
import type { Vinculo } from './db.ts'
import * as store from './piloto-store.ts'

type IO = { responder: (m: Mensaje) => Promise<void>; avanzar: (b: Borrador) => Promise<void>; limpiarPendiente: () => Promise<void> }
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
export async function atenderPiloto(d: { v: Vinculo; ctx: Contexto; mensajeId: string; texto: string; botonId?: string; pendiente: Pendiente | null }, io: IO): Promise<boolean> {
  const { v,ctx,mensajeId,texto,botonId,pendiente } = d
  const boton = botonId?.match(/^piloto_(si|no)@(.+)$/)
  const comando = comandoPiloto(texto, ctx.hoy)
  if (!ctx.pilotoHabilitado) {
    if (boton || comando) { await io.responder({ texto: 'Las funciones nuevas del piloto todavía no están activadas. Tu carga pendiente se conserva.' }); return true }
    return false
  }
  if (boton) {
    if (!UUID.test(boton[2])) { await io.responder({ texto:'Ese botón no está disponible.' }); return true }
    if (boton[1] === 'no') { await store.cancelar(v,boton[2]); await io.responder({ texto:'Acción cancelada. Conservé tu otra carga pendiente.' }) }
    else await io.responder({ texto:await store.confirmar(v,boton[2]) })
    return true
  }
  // La propuesta lateral no captura un «sí» destinado a la recorrida anterior.
  const lateral = !comando && !botonId ? await store.pendiente(v) : null
  if (lateral && !pendiente && /^(si|confirmar|confirmo|dale|no|cancelar)[.!?\s]*$/.test(norm(texto))) {
    if (/^(no|cancelar)/.test(norm(texto))) { await store.cancelar(v,lateral.id); await io.responder({ texto:'Acción cancelada.' }) }
    else if (lateral.accion.k === 'ajustar' && !lateral.accion.anular && lateral.accion.valor === undefined) await io.responder({ texto:'Decime primero el monto o los milímetros correctos.' })
    else await io.responder({ texto:await store.confirmar(v,lateral.id) })
    return true
  }
  async function propuesta(accion: store.Accion, resumen: string) {
    const p = await store.proponer(v,mensajeId,accion)
    if (p.estado !== 'pendiente') { await io.responder({ texto:'Ese mensaje ya tiene una acción procesada o en revisión. No la repetí.' }); return }
    await io.responder({ texto:resumen, botones:[{id:`piloto_si@${p.id}`,titulo:'Confirmar'},{id:`piloto_no@${p.id}`,titulo:'Cancelar'}] })
  }
  if (lateral?.accion.k === 'ajustar' && !lateral.accion.anular && lateral.accion.valor === undefined && !pendiente && texto.length < 60) {
    const valor = numeroEn(texto)
    if (valor !== null) {
      await propuesta({...lateral.accion,valor},`¿Confirmás corregir esa carga a ${lateral.accion.tabla==='lluvia' ? `${valor} mm` : pesos(valor)}?`)
      return true
    }
  }
  if (!comando) return false
  switch(comando.k) {
    case 'ajustar': {
      const carga = await store.ultimaCarga(v)
      if (!carga) { await io.responder({ texto:'No encontré una última carga propia de lluvia o gasto que pueda cambiar por acá. Las recorridas y comprobantes se corrigen en la app.' }); break }
      const { datos,tabla } = carga
      if (tabla==='movimiento_financiero' && (datos.comprobante_url || datos.neto_total != null || datos.iva_total != null)) {
        await io.responder({ texto:'Ese gasto tiene comprobante o IVA. Revisalo desde la app para conservar sus importes consistentes.' }); break
      }
      const a: store.Accion = { k:'ajustar',id:String(datos.id),tabla,antes:datos,valor:comando.valor,anular:comando.anular }
      const anterior = tabla==='lluvia' ? `${datos.mm} mm` : pesos(Number(datos.monto))
      if (!comando.anular && comando.valor===undefined) {
        const p=await store.proponer(v,mensajeId,a)
        await io.responder({ texto:`Tu última carga es ${anterior}, del ${datos.fecha ?? datos.fecha_devengo}. ¿Cuál es el valor correcto?${pendiente ? ' Como tenés otra carga pendiente, escribí «corregir última carga a» y el valor en un solo mensaje.' : ''}`,botones:[{id:`piloto_no@${p.id}`,titulo:'Cancelar'}] }); break
      }
      if (!comando.anular && (comando.valor!<0 || (tabla==='movimiento_financiero' && comando.valor!<=0))) { await io.responder({texto:'El gasto debe ser mayor que cero; la lluvia admite cero o más.'}); break }
      await propuesta(a,comando.anular ? `¿Confirmás anular tu carga de ${anterior}, del ${datos.fecha ?? datos.fecha_devengo}? Saldrá de los totales; conservaré sus datos en el historial.` : `¿Confirmás corregir ${anterior} a ${tabla==='lluvia' ? `${comando.valor} mm` : pesos(comando.valor!)}? Mantengo campo y fecha.`)
      break
    }
    case 'problemas': {
      const rows=await store.incidencias(v,comando.pagina)
      await io.responder({texto:rows.length ? rows.slice(0,10).map(r=>`INC-${r.id.slice(0,8)} · ${potreroPorId(ctx.campos,r.potrero_id)?.potrero.nombre ?? 'Potrero'}: ${r.descripcion}`).join('\n')+(rows.length>10?`\nPara seguir: «problemas página ${(comando.pagina ?? 1)+1}».`:'') : 'No hay problemas abiertos en esta página. Eso no confirma que todos los equipos estén funcionando.'}); break
    }
    case 'tareas': {
      const rows=await store.tareas(v,comando.pagina), miembros=await store.miembros(v)
      await io.responder({texto:rows.length ? rows.slice(0,10).map(r=>`TAR-${r.id.slice(0,8)} · ${r.vence} · ${miembros.find(m=>m.id===r.responsable_id)?.nombre ?? 'Responsable'}: ${r.descripcion} (${r.estado})`).join('\n')+(rows.length>10?`\nPara seguir: «tareas página ${(comando.pagina ?? 1)+1}».`:'') : 'No hay tareas pendientes en esta página.'}); break
    }
    case 'comparar': await io.responder({texto:textoComparacion(await store.comparar(v))}); break
    case 'incidencia':
    case 'tarea': {
      const p=resolverReferenciaPotrero(comando.potrero,ctx.campos,null)
      const c=comando.k==='tarea' ? comando.potrero ? resolverCampo(comando.potrero,ctx.campos) : ctx.campos.length===1 ? {ok:ctx.campos[0]} : null : null
      if (!('ok' in p) && !(comando.k==='tarea' && c && 'ok' in c)) { await io.responder({texto:'No pude identificar un solo lugar. Incluí también el campo: «reportar problema en 7B de La Porteña: molino roto». Para tareas podés indicar el campo. No guardé el problema o tarea.'}); break }
      if (!comando.descripcion.trim() || comando.descripcion.length>1000) { await io.responder({texto:'La descripción debe tener entre 1 y 1000 caracteres.'}); break }
      if (comando.k==='incidencia') {
        if(!('ok' in p))break
        const equipoId=await store.equipoParaProblema(v,p.ok.campo.id,p.ok.potrero.id,comando.descripcion)
        await propuesta({k:'incidencia',campoId:p.ok.campo.id,potreroId:p.ok.potrero.id,descripcion:comando.descripcion,equipoId},`¿Registro un problema abierto en ${p.ok.campo.nombre} · ${p.ok.potrero.nombre}?
${comando.descripcion}
${equipoId ? 'Lo vinculé al único equipo de ese tipo registrado dentro del potrero.' : 'Queda localizado por potrero; el equipo exacto todavía no está identificado.'}`)
      } else {
        const lugar='ok' in p ? {campoId:p.ok.campo.id,potreroId:p.ok.potrero.id,nombre:p.ok.potrero.nombre} : c && 'ok' in c ? {campoId:c.ok.id,potreroId:null,nombre:c.ok.nombre} : null
        if(!lugar)break
        if (!esFecha(comando.fecha) || comando.fecha<ctx.hoy) { await io.responder({texto:'Decime un vencimiento válido de hoy en adelante.'}); break }
        const miembros=await store.miembros(v), propios=['yo','mi','para mi'].includes(norm(comando.responsable))
        const candidatos=miembros.filter(m=>propios ? m.id===v.user_id : norm(m.nombre)===norm(comando.responsable) || m.id===comando.responsable)
        if (candidatos.length!==1) { await io.responder({texto:`No pude identificar un responsable único de tu empresa. Disponibles: ${miembros.map(m=>m.nombre).join(', ')}. Podés usar «para mí».`}); break }
        await propuesta({k:'tarea',campoId:lugar.campoId,potreroId:lugar.potreroId,descripcion:comando.descripcion,responsableId:candidatos[0].id,fecha:comando.fecha},`¿Creo esta tarea para ${candidatos[0].nombre}, con vencimiento ${comando.fecha}, en ${lugar.nombre}?
${comando.descripcion}
Queda en la lista de tareas. No envío avisos automáticos a otras personas.`)
      }
      break
    }
    case 'resolver': {
      const rows=await store.buscarIncidencia(v,comando.codigo)
      if (rows.length!==1) { await io.responder({texto:'No encontré un problema abierto único con ese código. Consultá «problemas» o usá su ID completo.'}); break }
      await propuesta({k:'resolver',id:rows[0].id,version:rows[0].version},`¿Marco resuelto INC-${rows[0].id.slice(0,8)}: ${rows[0].descripcion}?`); break
    }
    case 'resolver_lugar': {
      const p=resolverReferenciaPotrero(comando.potrero,ctx.campos,null)
      if(!('ok' in p)){await io.responder({texto:'Decime el potrero y campo exactos, o el código que aparece en «problemas».'});break}
      const rows=(await store.incidenciasEnPotrero(v,p.ok.potrero.id)).filter(r=>norm(r.descripcion).includes(comando.equipo))
      if(rows.length!==1){await io.responder({texto:'No encontré un único problema abierto de ese equipo. Consultá «problemas» y usá su código para no cerrar otro.'});break}
      await propuesta({k:'resolver',id:rows[0].id,version:rows[0].version},`¿Marco resuelto este problema de ${p.ok.potrero.nombre}: ${rows[0].descripcion}?`);break
    }
    case 'tarea_estado': {
      const rows=await store.buscarTarea(v,comando.codigo)
      if (rows.length!==1) { await io.responder({texto:'No encontré una tarea pendiente única con ese código.'}); break }
      if (comando.estado==='aceptada' && rows[0].responsable_id!==v.user_id) { await io.responder({texto:'Sólo el responsable asignado puede aceptar esa tarea.'}); break }
      await propuesta({k:'tarea_estado',id:rows[0].id,version:rows[0].version,estado:comando.estado},`¿Marco ${comando.estado} TAR-${rows[0].id.slice(0,8)}: ${rows[0].descripcion}?`); break
    }
    case 'sesion': {
      let s=await store.sesionActiva(v)
      if (comando.accion==='empezar') {
        if (s) { await io.responder({texto:'Ya tenés una recorrida abierta. Podés sumar un audio, «cerrar recorrida» o «pausar recorrida».'}); break }
        if (pendiente?.capturaId) { await io.responder({texto:'Primero completá o cancelá la carga pendiente. No la reemplacé por una sesión.'}); break }
        const c=comando.campo ? resolverCampo(comando.campo,ctx.campos) : ctx.campos.length===1 ? {ok:ctx.campos[0]} : null
        if (!c || !('ok' in c)) { await io.responder({texto:'Decime «empezar recorrida en» y el nombre del campo.'}); break }
        const fecha=comando.fecha ?? ctx.hoy
        if (!esFecha(fecha)||fecha>ctx.hoy) { await io.responder({texto:'La recorrida necesita una fecha de hoy o anterior.'}); break }
        await store.abrirSesion(v,c.ok.id,fecha)
        await io.responder({texto:`Recorrida abierta en ${c.ok.nombre} · ${fecha}. Mandame los audios por partes. Los reúno en un borrador; no registro la recorrida hasta «cerrar recorrida» y confirmar.`}); break
      }
      if (comando.accion==='retomar') {
        if (pendiente?.capturaId && !pendiente.borrador.sesionId) { await io.responder({texto:'Conservé tu carga pendiente. Completala o cancelala antes de retomar la sesión.'}); break }
        s=s ?? await store.retomarSesion(v)
        if (s) { await io.responder({texto:`Retomamos la recorrida del ${s.fecha}. Conservé ${s.borrador.observaciones?.length ?? 0} observaciones. Podés seguir o «cerrar recorrida».`}); if(s.borrador.observaciones?.length) await io.avanzar({...s.borrador,sesionId:s.id}) }
        else await io.responder({texto:'No tenés una recorrida pausada para retomar.'}); break
      }
      if (!s) { await io.responder({texto:'No tenés una sesión de recorrida abierta.'}); break }
      if (comando.accion==='pausar') { await store.estadoSesion(v,s.id,'pausada'); if(pendiente && pendiente.tipo!=='ubicado' && pendiente.borrador.sesionId===s.id) await io.limpiarPendiente(); await io.responder({texto:'Recorrida pausada. Conservé el borrador; escribí «retomar recorrida» para seguir.'}); break }
      if (!s.borrador.observaciones?.length) { await io.responder({texto:'La recorrida está vacía. Mandame lo que viste antes de cerrarla.'}); break }
      const previo=await store.cierrePrevio(v,s.id)
      if(previo){
        if(previo.estado==='confirmada'){await store.estadoSesion(v,s.id,'cerrada');await io.responder({texto:'La recorrida ya quedó confirmada. Cerré la sesión sin volver a cargarla.'})}
        else await io.responder({texto:'El cierre anterior necesita revisión del equipo antes de volver a guardar. Conservé el borrador.'})
        break
      }
      await io.avanzar({...s.borrador,sesionId:s.id,cerrarSesion:true}); break
    }
  }
  return true
}
