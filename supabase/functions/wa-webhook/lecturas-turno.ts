import { puedeVer } from '../_shared/wa/permisos.ts'
import { resolverCampo, resolverReferenciaPotrero, type PotreroDe } from '../_shared/wa/resolver.ts'
import type { FilaHacienda } from '../_shared/wa/respuestas.ts'
import type { Borrador, Contexto } from '../_shared/wa/tipos.ts'

export const RESOLVER_POTRERO = {
  name: 'resolver_potrero',
  description: 'Busca el potrero al que se refiere el productor. Devuelve un número de referencia para consultar stock sólo si el lugar es inequívoco.',
  input_schema: {
    type: 'object',
    properties: { potrero: { type: 'string' }, campo: { type: 'string' } },
    required: ['potrero'], additionalProperties: false,
  },
}

export const CONSULTAR_STOCK = {
  name: 'consultar_stock',
  description: 'Lee cabezas activas por categoría en un potrero resuelto durante este turno. Usá la referencia numérica devuelta por resolver_potrero.',
  input_schema: {
    type: 'object',
    properties: { referencia: { type: 'integer' } },
    required: ['referencia'], additionalProperties: false,
  },
}

export type LecturasTurno = ReturnType<typeof lecturasDelTurno>

export function lecturasDelTurno(ctx: Contexto, leerStock: (b: Borrador) => Promise<FilaHacienda[]>) {
  const lugares: PotreroDe[] = []
  const lecturas = new Map<string, Promise<FilaHacienda[]>>()
  const ubicacion = ({ campo, potrero }: PotreroDe) => ({ campo: campo.nombre, potrero: potrero.nombre })
  const hacienda = puedeVer(ctx.permisos, 'hacienda')
  const resolver = puedeVer(ctx.permisos, 'campos') || hacienda
  const entradaValida = (x: unknown): x is string => typeof x === 'string' && x.trim().length > 0 && x.length <= 120
  return {
    herramientas: [...(resolver ? [RESOLVER_POTRERO] : []), ...(hacienda ? [CONSULTAR_STOCK] : [])],
    resolverPotrero(input: { potrero?: unknown; campo?: unknown } | null) {
      if (!resolver) return { estado: 'sin_permiso' }
      if (!entradaValida(input?.potrero) || (input.campo !== undefined && !entradaValida(input.campo)))
        return { estado: 'referencia_invalida' }
      const campo = input.campo ? resolverCampo(input.campo, ctx.campos) : null
      if (campo && 'varios' in campo) return { estado: 'ambiguo', campos: campo.varios.slice(0, 10).map(c => c.nombre) }
      if (campo && 'ninguno' in campo) return { estado: 'no_encontrado' }

      const lugar = resolverReferenciaPotrero(input.potrero, ctx.campos, campo?.ok.id)
      if ('varios' in lugar) return { estado: 'ambiguo', opciones: lugar.varios.slice(0, 10).map(ubicacion) }
      if ('ninguno' in lugar || (campo && lugar.ok.campo.id !== campo.ok.id)) return { estado: 'no_encontrado' }
      const existente = lugares.findIndex(p => p.potrero.id === lugar.ok.potrero.id)
      const referencia = existente < 0 ? lugares.push(lugar.ok) : existente + 1
      return { estado: 'resuelto', referencia, ...ubicacion(lugar.ok) }
    },
    async consultarStock(input: { referencia?: unknown } | null) {
      if (!hacienda) return { estado: 'sin_permiso' }
      const referencia = input?.referencia
      const lugar = typeof referencia === 'number' && Number.isInteger(referencia) && referencia > 0 ? lugares[referencia - 1] : undefined
      if (!lugar) return { estado: 'referencia_invalida' }

      const { campo, potrero } = lugar
      let filas = lecturas.get(potrero.id)
      if (!filas) {
        filas = leerStock({ tipo: 'consulta_hacienda', campoId: campo.id, potreroId: potrero.id })
        lecturas.set(potrero.id, filas)
      }
      try {
        const stock = await filas
        return {
          estado: 'verificado', ...ubicacion(lugar),
          total: stock.reduce((total, f) => total + f.cabezas, 0),
          categorias: stock.map(({ categoria, cabezas }) => ({ categoria, cabezas })),
        }
      } catch {
        lecturas.delete(potrero.id)
        return { estado: 'no_disponible' }
      }
    },
    stockVerificado(b: Borrador) {
      if (!hacienda || b.tipo !== 'consulta_hacienda' || !b.potreroId) return
      const lugar = lugares.find(p => p.potrero.id === b.potreroId && p.campo.id === b.campoId)
      return lugar ? lecturas.get(lugar.potrero.id) : undefined
    },
  }
}
