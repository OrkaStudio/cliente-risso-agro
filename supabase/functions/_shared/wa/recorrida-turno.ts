import { campoExacto, campoEnTexto, resolverPotrero, type PotreroDe } from './resolver.ts'
import { norm } from './texto.ts'
import type { Contexto, PedidoInterpretado } from './tipos.ts'

export function refiereAlPotrero(texto: string): boolean {
  return /\b(?:ahi|alli|adentro|en (?:ese|este|aquel) (?:potrero|lote))\b/.test(norm(texto))
}

function nombra(texto: string, nombre: string): boolean {
  const palabras = (valor: string) => norm(valor).replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
  return (' ' + palabras(texto) + ' ').includes(' ' + palabras(nombre) + ' ')
}

/** Una consulta deíctica y una carga sin campo pueden referirse a la recorrida del mismo mensaje. */
export function conContextoRecorrida(pedidos: PedidoInterpretado[], ctx: Contexto): PedidoInterpretado[] {
  const lugares = new Map<string, PotreroDe>()
  let dudoso = false
  return pedidos.map(pedido => {
    const it = pedido.interpretacion
    if (it.intent === 'novedad') {
      for (const obs of it.observaciones) {
        const campoMencionado = obs.campo ?? it.campo
        const campo = campoMencionado ? campoExacto(campoMencionado, ctx.campos) : campoEnTexto(pedido.fragmento, ctx.campos)
        const lugar = resolverPotrero(obs.potrero, ctx.campos, campo?.id, true)
        if ('ok' in lugar && obs.potrero && nombra(pedido.fragmento, obs.potrero) && (!campoMencionado || campo)) {
          lugares.set(lugar.ok.potrero.id, lugar.ok)
        } else dudoso = true
      }
    }
    if (it.intent === 'consulta_hacienda' && refiereAlPotrero(pedido.fragmento)
      && (!it.potrero || !nombra(pedido.fragmento, it.potrero))) {
      const lugar = !dudoso && lugares.size === 1 ? lugares.values().next().value : null
      const coincide = lugar && (!it.campo || campoExacto(it.campo, ctx.campos)?.id === lugar.campo.id)
      return { ...pedido, interpretacion: { ...it,
        campo: coincide ? lugar.campo.nombre : null, potrero: coincide ? lugar.potrero.nombre : null,
      } }
    }
    const frase = norm(pedido.fragmento)
    const puedeHeredarCampo = !/\b(?:en|para)\s+\S/.test(frase) || /\ben (?:ese|el mismo) campo\b/.test(frase)
    if (it.intent === 'lluvia' && !it.campo && !it.potrero && !dudoso && puedeHeredarCampo) {
      const campos = new Map([...lugares.values()].map(({ campo }) => [campo.id, campo.nombre]))
      if (campos.size === 1) return { ...pedido, interpretacion: { ...it, campo: campos.values().next().value ?? null } }
    }
    return pedido
  })
}