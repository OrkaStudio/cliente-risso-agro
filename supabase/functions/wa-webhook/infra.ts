// Inventario por WhatsApp: ubicación + qué es → foto de dónde queda → Guardar.
// Eléctricos por borde («entre el 8 y el 9») y bajas con confirmación. Nada se escribe sin el «Guardar».
import * as db from './db.ts'
import { imagenMapa } from './mapa-imagen.ts'
import { NO, SI } from '../_shared/wa/conversacion.ts'
import { bordeCompartido, comandoInfra, contorno, elementoDeTexto, largo, medio, metros, NOMBRE_TIPO, nombreElemento, pegarAlBorde, potreroCercano, potrerosDeElemento, potrerosEnPunto, TIPOS_PUNTO, type ComandoInfra, type LatLng, type TipoInfra } from '../_shared/wa/infraestructura.ts'
import { resolverPotrero, type PotreroDibujado } from '../_shared/wa/resolver.ts'
import { norm } from '../_shared/wa/texto.ts'
import type { Contexto, InfraNueva, Mensaje, Pendiente, PendienteInfra } from '../_shared/wa/tipos.ts'

export type EntradaInfra = { v: db.Vinculo; ctx: Contexto; mensajeId: string; texto: string; botonId?: string; pendiente: Pendiente | PendienteInfra | null; entrada: 'texto' | 'audio' | 'boton' }
export type IOInfra = {
  responder: (m: Mensaje) => Promise<void>
  enviarImagen: (bytes: Uint8Array, caption: string, campoId: string) => Promise<void>
}

const articulo = (t: TipoInfra) => t === 'tranquera' ? 'la' : 'el'

// El panel del potrero de la app rompe con un tipo que no conoce (FEATURE_MAP[fid].Icon, 15/10).
// Hasta que la app muestre los nuevos, el bot sólo carga lo que ella ya dibuja.
const APP_CONOCE: TipoInfra[] = ['molino', 'tranquera']
const nuevosHabilitados = () => Deno.env.get('WA_INFRA_TIPOS_NUEVOS') === 'true'
export const tiposCargables = (): TipoInfra[] => nuevosHabilitados() ? TIPOS_PUNTO : TIPOS_PUNTO.filter(t => APP_CONOCE.includes(t))
const TODAVIA_NO = 'Por ahora puedo cargar molinos y tranqueras. Tanques, bebederos, energizadores y eléctricos llegan cuando la app los pueda mostrar.'

/** Lo que el bot ofrece al recibir una ubicación: la recorrida sigue igual, cargar es opcional. */
export function ofrecerCarga(texto: string): Mensaje {
  return { texto, lista: { boton: 'Cargar acá', filas: tiposCargables().map(t => ({ id: `inf:tipo=${t}`, titulo: NOMBRE_TIPO[t] })) } }
}

/** true si el mensaje era del inventario y ya se contestó. */
export async function atenderInfra(e: EntradaInfra, io: IOInfra): Promise<boolean> {
  const p = e.pendiente
  const t = norm(e.texto).replace(/[.!¡]+$/g, '')
  if (e.botonId?.startsWith('inf:')) {
    const [accion, valor] = e.botonId.slice(4).split('=')
    if (accion === 'tipo') {
      const lugar = lugarPendiente(p)
      if (!lugar || !tiposCargables().includes(valor as TipoInfra)) { await io.responder({ texto: 'Esa opción era de una ubicación anterior. Mandame la ubicación de nuevo.' }); return true }
      await proponerPunto(e, io, valor as TipoInfra, null, lugar.punto, lugar.campoId)
      return true
    }
    if (accion === 'no') { await cancelar(e, io); return true }
    if (p?.tipo !== 'infra' || p.paso === 'tipo' || p.capturaId !== valor) {
      // Un botón viejo sólo consulta el resultado; nunca ejecuta otra propuesta.
      const resultado = valor && (accion === 'si' || accion === 'borrar')
        ? await db.resultadoInfra(e.v, valor, accion === 'si' ? 'guardar' : 'borrar') : 'vieja'
      await io.responder({ texto: respuestaInfra(resultado || 'vieja') }); return true
    }
    if (accion === 'si' && p.paso === 'confirmar') { await guardar(e, io, p.capturaId, p.elemento); return true }
    if (accion === 'borrar' && p.paso === 'borrar') { await borrar(e, io, p.capturaId, p.nombre); return true }
    await io.responder({ texto: 'Ese botón es de una propuesta anterior. No cambié nada.' }); return true
  }
  if (e.botonId) return false
  if (p?.tipo === 'infra' && (p.paso === 'confirmar' || p.paso === 'borrar')) {
    if (SI.test(t)) { if (p.paso === 'confirmar') await guardar(e, io, p.capturaId, p.elemento); else await borrar(e, io, p.capturaId, p.nombre); return true }
    if (NO.test(t)) { await cancelar(e, io); return true }
  }
  if (p?.tipo === 'infra' && p.paso === 'ubicacion' && NO.test(t)) { await cancelar(e, io); return true }
  const lugar = lugarPendiente(p)
  if (lugar) {
    const el = elementoDeTexto(e.texto)
    if (el) { await proponerPunto(e, io, el.tipo, el.apodo, lugar.punto, lugar.campoId); return true }
    if (p?.tipo === 'infra' && NO.test(t)) { await cancelar(e, io); return true }
  }
  // Sin ubicación todavía: sin señal, la palabra y la ubicación salen juntas y pueden llegar en
  // cualquier orden. Se espera la ubicación (hasta que venza el pendiente) en vez de no entenderla.
  if ((!p || (p.tipo === 'infra' && p.paso === 'ubicacion')) && e.entrada !== 'boton') {
    const el = elementoDeTexto(e.texto)
    if (el && !tiposCargables().includes(el.tipo)) { await io.responder({ texto: TODAVIA_NO }); return true }
    if (el) {
      await db.guardarPendiente(e.v.id, { tipo: 'infra', capturaId: null, paso: 'ubicacion', elemento: el, origen: { texto: e.texto, entrada: e.entrada } })
      const que = `${articulo(el.tipo) === 'la' ? 'de la' : 'del'} ${NOMBRE_TIPO[el.tipo].toLowerCase()}${el.apodo ? ` ${el.apodo}` : ''}`
      await io.responder({ texto: `Mandame la ubicación ${que}: clip → Ubicación. Si no estás ahí, mové el pin sobre el mapa. Si ya la mandaste sin señal, llega sola cuando vuelva.` })
      return true
    }
  }
  // Un comando no pisa una carga en curso de otro tipo (una lluvia o una recorrida sin terminar).
  if (!p || p.tipo === 'ubicado' || p.tipo === 'infra') {
    const c = comandoInfra(e.texto)
    if (c) { await comando(e, io, c); return true }
  }
  return false
}

/** Llegó la ubicación de algo ya nombrado: se propone directo, sin volver a preguntar qué es. */
export async function cargarEnUbicacion(e: EntradaInfra, io: IOInfra, p: Extract<PendienteInfra, { paso: 'ubicacion' }>, punto: LatLng): Promise<void> {
  const cerca = potreroCercano(punto, await db.potrerosDibujados(e.v))
  if (!cerca) { await io.responder({ texto: 'Esa ubicación no está cerca de ningún potrero dibujado. Mandala de nuevo desde el lugar o mové el pin sobre el campo.' }); return }
  await proponerPunto({ ...e, texto: p.origen.texto, entrada: p.origen.entrada }, io, p.elemento.tipo, p.elemento.apodo, punto, cerca.campoId)
}

function lugarPendiente(p: Pendiente | PendienteInfra | null): { punto: LatLng; campoId: string } | null {
  if (p?.tipo === 'ubicado' && p.ubicado.punto) return { punto: p.ubicado.punto, campoId: p.ubicado.campoId }
  if (p?.tipo === 'infra' && p.paso === 'tipo') return { punto: p.punto, campoId: p.campoId }
  return null
}

async function proponerPunto(e: EntradaInfra, io: IOInfra, tipo: TipoInfra, apodo: string | null, punto0: LatLng, campoId: string) {
  if (!tiposCargables().includes(tipo)) { await io.responder({ texto: TODAVIA_NO }); return }
  const dibujados = (await db.potrerosDibujados(e.v)).filter(x => x.campoId === campoId)
  const punto = tipo === 'tranquera' ? pegarAlBorde(punto0, dibujados) : punto0
  const ps = potrerosEnPunto(punto, dibujados)
  const elemento: InfraNueva = { campoId, tipo, apodo, lat: punto[0], lng: punto[1], linea: null, nombre: nombreElemento(tipo, apodo, ps.map(x => x.nombre)), focoId: ps[0]?.id ?? null }
  const cerca = (await db.infraDeEmpresa(e.v)).filter(x => x.tipo === tipo && metros([x.lat, x.lng], punto) < 30)
  const aviso = cerca.length ? `Ojo: ya hay ${cerca.length === 1 ? `${articulo(tipo) === 'la' ? 'una' : 'un'} ${NOMBRE_TIPO[tipo].toLowerCase()}` : `${cerca.length} iguales`} a menos de 30 m. ` : ''
  await proponer(e, io, elemento, `${aviso}¿Guardo ${articulo(tipo)} *${elemento.nombre}*?`)
}

async function proponer(e: EntradaInfra, io: IOInfra, elemento: InfraNueva, pregunta: string) {
  const capturaId = await db.crearCaptura({ vinculo: e.v, mensajeId: e.mensajeId, entrada: e.entrada, texto: e.texto || null })
  await db.actualizarCaptura(capturaId, { estado: 'propuesta', propuesta: { carga: 'infraestructura', ...elemento } })
  await db.guardarPendiente(e.v.id, { tipo: 'infra', capturaId, paso: 'confirmar', elemento })
  try {
    const datos = await db.datosMapa(e.v, elemento.campoId)
    if (datos) {
      datos.infraestructura = [...(datos.infraestructura ?? []), { id: 'nuevo', tipo: elemento.tipo, nombre: elemento.nombre, apodo: elemento.apodo, punto: [elemento.lat, elemento.lng], linea: elemento.linea ?? undefined, nuevo: true }]
      const img = await imagenMapa(datos, e.ctx.hoy, fetch, elemento.focoId ?? undefined)
      if (img) await io.enviarImagen(img.bytes, `En naranja, dónde queda ${articulo(elemento.tipo)} ${elemento.nombre}.`, elemento.campoId)
    }
  } catch (err) {
    // Sin foto igual se puede confirmar: el texto dice qué y dónde.
    console.warn('wa-webhook: no se pudo dibujar la propuesta de infraestructura', err instanceof Error ? err.message : String(err))
  }
  await io.responder({ texto: pregunta, botones: [{ id: `inf:si=${capturaId}`, titulo: 'Guardar' }, { id: 'inf:no', titulo: 'Cancelar' }] })
}

async function guardar(e: EntradaInfra, io: IOInfra, capturaId: string, elemento: InfraNueva) {
  const resultado = await db.confirmarInfra(e.v, capturaId, 'guardar')
  await io.responder({ texto: resultado === 'guardada'
    ? `Listo, guardé ${articulo(elemento.tipo)} *${elemento.nombre}*. Ya aparece en el mapa. Para cargar otra cosa, mandá su ubicación.`
    : respuestaInfra(resultado) })
}

async function borrar(e: EntradaInfra, io: IOInfra, capturaId: string, nombre: string) {
  const resultado = await db.confirmarInfra(e.v, capturaId, 'borrar')
  const art = /^tranquera/.test(nombre) ? 'la' : 'el'
  await io.responder({ texto: resultado === 'borrada' ? `Listo, borré ${art} *${nombre}*.` : resultado === 'no_existe'
    ? `No encontré ${art} *${nombre}* para borrarlo; puede que ya no esté.` : respuestaInfra(resultado) })
}

function respuestaInfra(resultado: db.ResultadoInfra): string {
  if (resultado === 'ya_guardada') return 'Eso ya está guardado. No lo cargué otra vez.'
  if (resultado === 'ya_borrada') return 'Eso ya se borró. No hice nada más.'
  if (resultado === 'incierta') return 'No pude comprobar el resultado de esa carga. No la repetí. Escribí «soporte» para que la revisemos.'
  return 'Ese botón es de una propuesta anterior. No cambié nada.'
}

async function cancelar(e: EntradaInfra, io: IOInfra) {
  if (e.pendiente?.tipo === 'infra' && e.pendiente.capturaId) await db.actualizarCaptura(e.pendiente.capturaId, { estado: 'descartada', notas: ['Cancelada por el productor.'] })
  if (e.pendiente?.tipo === 'infra') await db.guardarPendiente(e.v.id, null)
  await io.responder({ texto: 'Listo, no cambié nada.' })
}

/** «8B», «8» → el potrero dibujado, si es uno solo (el campo del otro desempata). */
function buscar(mencion: string, ctx: Contexto, dibujados: PotreroDibujado[], campoId: string | null): PotreroDibujado | null {
  const r = resolverPotrero(mencion, ctx.campos, campoId)
  return 'ok' in r ? dibujados.find(d => d.id === r.ok.potrero.id) ?? null : null
}

async function comando(e: EntradaInfra, io: IOInfra, c: ComandoInfra) {
  if (c.k !== 'borrar' && !nuevosHabilitados()) { await io.responder({ texto: TODAVIA_NO }); return }
  const dibujados = await db.potrerosDibujados(e.v)
  if (c.k === 'electrico_entre') {
    let a = buscar(c.a, e.ctx, dibujados, null)
    const b = a ? buscar(c.b, e.ctx, dibujados, a.campoId) : buscar(c.b, e.ctx, dibujados, null)
    if (!a && b) a = buscar(c.a, e.ctx, dibujados, b.campoId)
    if (!a || !b || a.id === b.id) { await io.responder({ texto: `No encontré los potreros «${c.a}» y «${c.b}» dibujados. Escribilos como figuran en el mapa.` }); return }
    const linea = a.campoId === b.campoId ? bordeCompartido(a, b) : null
    if (!linea) { await io.responder({ texto: `El ${a.nombre} y el ${b.nombre} no comparten alambrado en el mapa. Si el eléctrico da toda la vuelta a uno, decime «eléctrico alrededor del ${a.nombre}».` }); return }
    const nombre = nombreElemento('electrico', null, [a.nombre, b.nombre])
    await proponerLinea(e, io, a, linea, nombre)
    return
  }
  if (c.k === 'electrico_contorno') {
    const a = buscar(c.p, e.ctx, dibujados, null)
    if (!a) { await io.responder({ texto: `No encontré el potrero «${c.p}» dibujado. Escribilo como figura en el mapa.` }); return }
    await proponerLinea(e, io, a, contorno(a), `eléctrico alrededor del ${a.nombre}`)
    return
  }
  // Baja: por tipo, potreros mencionados y apodo.
  const ids = c.potreros.map(m => buscar(m, e.ctx, dibujados, null)?.id ?? null)
  if (ids.some(x => x === null)) { await io.responder({ texto: 'No encontré ese potrero dibujado. Escribilo como figura en el mapa.' }); return }
  const candidatos = (await db.infraDeEmpresa(e.v)).filter(x => x.tipo === c.tipo).map(x => {
    const ps = potrerosDeElemento(x, dibujados.filter(d => d.campoId === x.campo_id))
    return { x, ps, nombre: nombreElemento(x.tipo, x.apodo, ps.map(p => p.nombre)) }
  }).filter(({ x, ps }) => ids.every(id => ps.some(p => p.id === id)) && (!c.apodo || norm(x.apodo ?? '').includes(norm(c.apodo))))
  const como = `${articulo(c.tipo) === 'la' ? 'una' : 'un'} ${NOMBRE_TIPO[c.tipo].toLowerCase()}`
  if (!candidatos.length) { await io.responder({ texto: `No encontré ${como}${c.potreros.length ? ` en ${c.potreros.length === 2 ? `el borde ${c.potreros.join(' y ')}` : `el ${c.potreros[0].toUpperCase()}`}` : ''} para borrar.` }); return }
  if (candidatos.length > 1) { await io.responder({ texto: `Hay ${candidatos.length}: ${candidatos.slice(0, 5).map(k => k.nombre).join('; ')}. Decime cuál, por ejemplo con su apodo o el potrero.` }); return }
  const [k] = candidatos
  const capturaId = await db.crearCaptura({ vinculo: e.v, mensajeId: e.mensajeId, entrada: e.entrada, texto: e.texto || null })
  await db.actualizarCaptura(capturaId, { estado: 'propuesta', propuesta: { carga: 'infraestructura_baja', id: k.x.id, nombre: k.nombre } })
  await db.guardarPendiente(e.v.id, { tipo: 'infra', capturaId, paso: 'borrar', id: k.x.id, nombre: k.nombre })
  await io.responder({ texto: `¿Borro ${articulo(c.tipo)} *${k.nombre}*? Sale del mapa.`, botones: [{ id: `inf:borrar=${capturaId}`, titulo: 'Borrar' }, { id: 'inf:no', titulo: 'Cancelar' }] })
}

async function proponerLinea(e: EntradaInfra, io: IOInfra, foco: PotreroDibujado, linea: LatLng[], nombre: string) {
  const [lat, lng] = medio(linea)
  const elemento: InfraNueva = { campoId: foco.campoId, tipo: 'electrico', apodo: null, lat, lng, linea, nombre, focoId: foco.id }
  await proponer(e, io, elemento, `Marco el *${nombre}* (${Math.round(largo(linea))} m). ¿Lo guardo?`)
}
