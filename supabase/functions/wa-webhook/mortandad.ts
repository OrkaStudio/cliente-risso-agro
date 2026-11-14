import { campoExacto, resolverPotrero } from '../_shared/wa/resolver.ts'
import { norm, plural } from '../_shared/wa/texto.ts'
import type { Contexto, GrupoMortandad, ReporteMortandad } from '../_shared/wa/tipos.ts'
import * as db from './db.ts'
import { veSeccion } from '../_shared/wa/permisos.ts'

function animales(cantidad: number, categoria: GrupoMortandad['categoria']): string {
  return `${cantidad} ${plural(categoria, cantidad)}`
}

export function resumenMortandad(reporte: ReporteMortandad): string {
  const grupos = reporte.grupos.map(g => animales(g.cantidad, g.categoria))
  return grupos.length === 1 ? grupos[0] : `${grupos.slice(0, -1).join(', ')} y ${grupos.at(-1)}`
}

export function corregirMortandad(reporte: ReporteMortandad, texto: string): ReporteMortandad | null {
  const entrada = norm(texto).replace(/[¿?¡!.,]+$/g, '').trim()
  const lugar = entrada.match(/^(?:(?:fue|era) )?(?:en (?:el )?)?(?:potrero )?(\d+\s*[a-z])(?: (?:de|del)(?: campo)? (.+))?$/)
  if (lugar) return { ...reporte, potrero: lugar[1], campo: lugar[2] ?? reporte.campo }

  const correccion = entrada.match(/^(?:fue|fueron|era|eran) (un|una|\d+) ([a-z]+)$/)
  if (!correccion) return null
  const cantidad = /^\d+$/.test(correccion[1]) ? Number(correccion[1]) : 1
  if (!Number.isSafeInteger(cantidad) || cantidad < 1) return null
  const grupo = reporte.grupos.find(g => [g.categoria, plural(g.categoria, 2)].includes(correccion[2]))
  if (!grupo) return null
  return { ...reporte, grupos: reporte.grupos.map(g => g === grupo ? { ...g, cantidad } : g) }
}

export async function textoRevisionMortandad(v: db.Vinculo, ctx: Contexto, reporte: ReporteMortandad): Promise<string> {
  if (!veSeccion(ctx.niveles ?? null, 'hacienda'))
    return 'Anoté el aviso, pero el stock de hacienda lo ve el dueño del campo: avisale para que revise y dé la baja en Hacienda.'
  const campo = campoExacto(reporte.campo, ctx.campos)
  if (reporte.campo && !campo) {
    return `No encontré el campo «${reporte.campo}». ¿Me pasás el potrero y el campo como figuran en la app?`
  }
  if (!reporte.potrero) return '¿En qué potrero fue la mortandad? Pasame el nombre para revisar cuántos figuran en Hacienda.'
  const lugar = resolverPotrero(reporte.potrero, ctx.campos, campo?.id, true)
  if ('varios' in lugar) return `Hay más de un potrero «${reporte.potrero}». ¿De qué campo es?`
  if ('ninguno' in lugar) {
    const numero = norm(reporte.potrero).match(/^(\d+)\s*[a-z]$/)?.[1]
    const similares = campo?.potreros.filter(p => norm(p.nombre).match(/^(\d+)\s*[a-z]$/)?.[1] === numero) ?? []
    const donde = campo ? ` en ${campo.nombre}` : ''
    return `No encontré el «${reporte.potrero}»${donde}.` + (numero && similares.length === 1
      ? ` ¿Era el ${similares[0].nombre}? Si es ese, escribime «${similares[0].nombre}».`
      : ' ¿Me pasás el nombre como figura en la app?')
  }

  const { potrero, campo: encontrado } = lugar.ok
  const filas = await db.hacienda(v, { tipo: 'consulta_hacienda', campoId: encontrado.id, potreroId: potrero.id })
  const donde = `el ${potrero.nombre} de ${encontrado.nombre}`
  const diferencias = reporte.grupos.flatMap(({ categoria, cantidad }) => {
    const activas = filas.filter(f => f.categoria === categoria).reduce((total, f) => total + f.cabezas, 0)
    return cantidad > activas ? [`En ${donde} hoy ${activas === 1 ? 'figura' : 'figuran'} *${animales(activas, categoria)}*. Me dijiste que murieron *${animales(cantidad, categoria)}*.`] : []
  })
  if (diferencias.length) return diferencias.join('\n') + ' ¿Fueron menos o fue en otro potrero?'
  return `Revisé ${donde}. El stock de hoy alcanza para las cantidades que me pasaste (*${resumenMortandad(reporte)}*). Para dar de baja los animales, falta identificarlos en Hacienda.`
}
