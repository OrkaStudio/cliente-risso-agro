// Una persona en varias cuentas (Lau, 14/11; spec del cerebro
// clientes/risso-agro/especificaciones/2026-11-13-permisos-por-persona, «Una
// persona en varios campos»). Un veterinario o un ingeniero que atiende varios
// campos le escribe al mismo bot. Si se confunde de cuenta, carga en el campo de
// otro cliente: por eso el bot nunca la elige solo, ni la deduce del potrero que
// nombra, ni la arrastra de un mensaje a otro. Pregunta, con botones, y todo lo
// que contesta en esa cuenta lleva su nombre arriba.

import { norm } from './texto.ts'
import type { Cuenta, Mensaje } from './tipos.ts'

const BOTON = /^cta:([0-9a-f-]{36})@([0-9a-f-]{36})$/i

export function botonCuenta(empresaId: string, revision: string): string {
  return `cta:${empresaId}@${revision}`
}

/** El botón de una cuenta: cuál y de qué pregunta. */
export function leerBotonCuenta(id: string | undefined): { empresaId: string; revision: string } | null {
  const m = id ? BOTON.exec(id) : null
  return m ? { empresaId: m[1]!.toLowerCase(), revision: m[2]!.toLowerCase() } : null
}

// Lo que se dice alrededor del nombre: «la de Risso», «es para Pérez», «en lo de Gómez».
const RELLENO = new Set(['la', 'el', 'lo', 'los', 'las', 'de', 'del', 'es', 'era', 'para', 'en', 'cuenta', 'campo', 'estancia', 'a', 'al', 'que', 'esto', 'eso', 'va'])
const palabras = (s: string) => norm(s).replace(/[^a-z0-9ñ ]+/g, ' ').split(' ').filter(Boolean)

/**
 * La cuenta que nombró por texto o audio, si nombró una sola sin dudas.
 * Sólo un mensaje corto que es el nombre (o parte clara de él): «Risso»,
 * «la de Pérez». Un mensaje con más cosas es otra carga, no una respuesta.
 */
export function cuentaPorTexto(texto: string, cuentas: Cuenta[]): Cuenta | null {
  const dichas = palabras(texto)
  if (!dichas.length || dichas.length > 6) return null
  const clave = dichas.filter((p) => !RELLENO.has(p))
  if (!clave.length) return null
  const coinciden = cuentas.filter((c) => {
    const nombre = palabras(c.nombre)
    // Todas las palabras dichas (fuera del relleno) están en el nombre, y alguna no es una sola letra.
    return clave.every((p) => nombre.includes(p)) && clave.some((p) => p.length >= 3)
  })
  return coinciden.length === 1 ? coinciden[0]! : null
}

/** Para recordar qué mandó, en una línea. */
export function deQueSeTrata(m: { tipo: string; texto: string | null }): string {
  if (m.tipo === 'image') return m.texto ? `la foto «${corto(m.texto)}»` : 'la foto que mandaste'
  if (m.tipo === 'location') return 'la ubicación que mandaste'
  if (m.texto) return `«${corto(m.texto)}»`
  return 'lo que mandaste'
}

function corto(s: string, max = 110): string {
  const t = s.replace(/\s+/g, ' ').trim()
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t
}

/**
 * La pregunta. Las cuentas en orden alfabético y ninguna marcada: no hay una
 * sugerida. Con hasta 3 y nombres que entran, botones; si no, una lista.
 */
export function preguntaCuenta(cuentas: Cuenta[], deQue: string, revision: string, aviso = ''): Mensaje {
  const orden = [...cuentas].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  const texto = `${aviso}¿De qué cuenta es ${deQue}?\n\nTocá la cuenta o escribime su nombre. Hasta que me digas, no cargo nada.`
  const opciones = orden.map((c) => ({ id: botonCuenta(c.id, revision), titulo: c.nombre }))
  if (orden.length <= 3 && orden.every((c) => c.nombre.length <= 20)) return { texto, botones: opciones }
  return {
    texto: orden.length > 10 ? `${texto}\n\nSi no está en la lista, escribime el nombre.` : texto,
    lista: { boton: 'Elegir la cuenta', filas: opciones.slice(0, 10).map((o) => ({ ...o, titulo: o.titulo.slice(0, 24), detalle: o.titulo.length > 24 ? o.titulo : undefined })) },
  }
}

/** Todo lo que contesta en una cuenta lleva su nombre arriba. */
export function enLaCuenta(m: Mensaje, cuenta: string | null | undefined): Mensaje {
  return cuenta ? { ...m, texto: `*${cuenta}*\n${m.texto}` } : m
}

/** La ayuda cuando todavía no hay cuenta elegida. */
export function ayudaVariasCuentas(nombre: string | null, cuentas: Cuenta[]): string {
  const lista = [...cuentas].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')).map((c) => `· ${c.nombre}`).join('\n')
  return `Hola${nombre ? `, ${nombre}` : ''}. Trabajás con ${cuentas.length} cuentas en Troppero:\n${lista}\n\nMandame lo que quieras cargar o consultar —un audio, un texto o una foto— y te pregunto de qué cuenta es antes de hacer nada.`
}

/** La bienvenida a otra cuenta (aceptó una invitación). */
export function ahoraEnVarias(empresa: string, cuentas: Cuenta[]): string {
  const nombres = [...cuentas].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')).map((c) => c.nombre)
  const y = nombres.length > 1 ? `${nombres.slice(0, -1).join(', ')} y ${nombres.at(-1)}` : (nombres[0] ?? '')
  return `Listo: ya estás en ${empresa}.\n\nAhora trabajás con ${nombres.length} cuentas: ${y}. Cada vez que me mandes algo, te pregunto de qué cuenta es antes de cargarlo.`
}

/** Otra cuenta lo invitó «Sólo por WhatsApp» y ya usa el bot. */
export function preguntaInvitacion(empresa: string, invita: string | null, token: string, queHace: string): Mensaje {
  return {
    texto: `${invita ? `${invita}, de ${empresa},` : empresa} te sumó a su campo en Troppero. ${queHace}\n\n¿Aceptás? Lo de tus otras cuentas no cambia.`,
    botones: [
      { id: `inv:si@${token}`, titulo: 'Aceptar' },
      { id: `inv:no@${token}`, titulo: 'No, gracias' },
    ],
  }
}

export function leerBotonInvitacion(id: string | undefined): { acepta: boolean; token: string } | null {
  const m = id ? /^inv:(si|no)@([A-Za-z0-9_-]{8,128})$/.exec(id) : null
  return m ? { acepta: m[1] === 'si', token: m[2]! } : null
}
