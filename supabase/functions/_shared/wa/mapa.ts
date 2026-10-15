import { campoEnTexto, campoPorId, resolverCampo } from './resolver.ts'
import { norm } from './texto.ts'
import type { Campo, Contexto, Mensaje, Pendiente } from './tipos.ts'

export type PedidoMapa = { campoId?: string; nombre?: string; potrero?: string; potreroId?: string }
/** Consulta lateral: sólo comandos completos; no consume una carga que menciona un mapa. */
export function comandoMapa(texto: string, botonId?: string): PedidoMapa | null {
  if (botonId === 'ver_mapa') return {}
  if (botonId?.startsWith('ver_mapa@')) return { campoId: botonId.slice(9) }
  if (botonId?.startsWith('acercar@')) return { potreroId: botonId.slice(8) }
  if (botonId) return null
  const t = norm(texto).replace(/[¿?¡!.,]+$/g, '').trim()
  const detalle = t.match(/^(?:acerca|acercar|amplia|ampliar|mostrame el detalle de|detalle de)(?:\s+(?:el|del))?\s+(?:potrero\s+)?(.+)$/)
  if (detalle) return { potrero: detalle[1] }
  const m = t.match(/^(?:mapa|ver (?:el )?mapa|(?:mandame|enviame|mostrame|pasame|mostra|mostrar|quiero ver) (?:el |un )?mapa)(?:\s+(.*))?$/)
  if (!m) return null
  const nombre = (m[1] ?? '').replace(/^(?:del campo|de la estancia|del establecimiento|de|del)\s+/, '').trim()
  return nombre && !['campo', 'del campo', 'mi campo', 'el campo'].includes(nombre) ? { nombre } : {}
}

/** No interpreta la posición actual del teléfono como el campo que recorrió. */
export function campoParaMapa(pedido: PedidoMapa, ctx: Contexto, p: Pendiente | null, reciente: string | null = null): Campo | null {
  if (pedido.campoId) return campoPorId(ctx.campos, pedido.campoId)
  if (pedido.nombre) {
    const r = resolverCampo(pedido.nombre, ctx.campos)
    return 'ok' in r ? r.ok : campoEnTexto(pedido.nombre, ctx.campos)
  }
  if (p && p.tipo !== 'ubicado') {
    const b = p.borrador
    const obs = (p.tipo === 'potrero' || p.tipo === 'ubicacion') && p.obsIndex !== undefined ? b.observaciones?.[p.obsIndex] : null
    const id = obs?.campoId ?? b.campoId
    const byId = campoPorId(ctx.campos, id)
    if (byId) return byId
    const mention = obs?.campoMencion ?? b.campoMencion
    if (mention) { const r = resolverCampo(mention, ctx.campos); if ('ok' in r) return r.ok }
    const ids = [...new Set((b.observaciones ?? []).map(o => o.campoId).filter(Boolean))]
    if (ids.length === 1) { const c = campoPorId(ctx.campos, ids[0]); if (c) return c }
    // Varios campos en el mismo audio requieren una elección explícita.
    if (ids.length > 1) return null
  }
  const c = campoPorId(ctx.campos, reciente)
  if (c) return c
  return ctx.campos.length === 1 ? ctx.campos[0] : null
}

export function elegirMapa(ctx: Contexto, invalido = false): Mensaje {
  if (!ctx.campos.length) return { texto: 'No tenés campos disponibles para mostrar el mapa. Tu carga pendiente se conserva.' }
  return {
    texto: `${invalido ? 'No encontré ese campo entre los que tenés disponibles. ' : ''}¿De qué campo querés ver el mapa? Elegí en la lista o escribí «mapa» y el nombre. Tu carga pendiente se conserva.`,
    lista: { boton: 'Elegir campo', filas: ctx.campos.slice(0, 10).map(c => ({ id: `ver_mapa@${c.id}`, titulo: c.nombre, detalle: `${c.potreros.length} potreros` })) },
  }
}

export function noRecuerdaPotrero(texto: string, p: Pendiente | null): boolean {
  return Boolean(p && ['potrero', 'ubicacion'].includes(p.tipo) && /^(?:no (?:me acuerdo|recuerdo|se)|no estoy seguro|no estoy segura)(?: (?:el|del|que|en que)?\s*potrero)?[.!?\s]*$/.test(norm(texto)))
}

export type MapaCampo = { id: string; nombre: string; potreros: { id: string; nombre: string; poligono: unknown }[]; alertas?: string[]; equipos?: {id:string;lat:number;lng:number}[] }

export type MapaIO = {
  datos: (campoId: string) => Promise<MapaCampo | null>
  render: (datos: MapaCampo) => Promise<{ bytes: Uint8Array; dibujados: number; faltantes: string[]; satelital?: boolean } | null>
  enviarImagen: (bytes: Uint8Array, caption: string, campoId: string, mime?: 'image/png' | 'image/jpeg') => Promise<void>
  responder: (mensaje: Mensaje) => Promise<void>
}
/** Sin setters de pendiente/captura: incluso un fallo de render/envío conserva el borrador. */
export async function atenderMapa(campo: Campo, io: MapaIO, pregunta?: string): Promise<boolean> {
  const datos = await io.datos(campo.id)
  if (!datos || datos.id !== campo.id) {
    await io.responder({ texto: 'Ese campo no está disponible para tu cuenta. Conservé tu carga pendiente.' }); return false
  }
  const imagen = await io.render(datos)
  if (!imagen) {
    await io.responder({ texto: `Todavía no hay potreros dibujados en ${datos.nombre}. Potreros registrados: ${datos.potreros.map(p => p.nombre).join(', ') || 'ninguno'}. Podés escribir el nombre del potrero; tu carga pendiente se conserva.` }); return false
  }
  const incompleto = imagen.faltantes.length ? ` Sin dibujo: ${imagen.faltantes.join(', ')}.` : ''
  const respaldo = imagen.satelital ? '' : 'Croquis: el satélite no está disponible ahora. '
  const problemas = datos.alertas?.length ? '\nEl borde rojo indica potreros con problemas abiertos. Para verlos, escribí «problemas».' : ''
  const caption = `${respaldo}${pregunta ?? `${datos.nombre}. Para ver un detalle, escribí «acercá» y el nombre del potrero.`}${incompleto}${problemas}`
  await io.enviarImagen(imagen.bytes, [...caption].slice(0, 1024).join(''), campo.id, imagen.bytes[0] === 255 ? 'image/jpeg' : 'image/png')
  return true
}
