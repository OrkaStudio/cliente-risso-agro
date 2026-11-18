// Lo que pasa cuando se toca un botón que hace algo (decisiones de Lau, 18/11):
//   · cargando: el giro aparece casi enseguida (DEMORA_CARGANDO_MS: lo justo para que «falta un
//     dato» no lo haga parpadear) y queda al menos MINIMO_CARGANDO_MS, como en la muestra;
//   · salió → «Listo» en pasto LISTO_MS, y recién después `alTerminar` (cerrar el panel, etc.);
//     con `sinListo` (guarda y pasa a otra pantalla, o sólo actualiza) va directo a `alTerminar`:
//     lo que confirma es ver la pantalla nueva;
//   · quedó en la cola del teléfono (la función devuelve "telefono") → «Guardado en el teléfono»;
//   · la función puede devolver otra función: es el aviso de qué cambió y dónde verlo (un toast),
//     que sale después del «Listo», junto con `alTerminar`;
//   · falta un dato (la función devuelve "falta") → se sacude y vuelve; el texto que dice qué
//     llenar lo pone la pantalla junto al campo: es guía, no un «no salió»;
//   · no salió → se sacude, dice el motivo un momento y pasa a «Probar de nuevo».
// El motivo es siempre el real: «Sin señal» si el teléfono sabe que no hay; el texto de un
// `Motivo` si la pantalla lo conoce; si no, sólo «No salió». Nunca uno inventado.
import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { DEMORA_CARGANDO_MS, LISTO_MS, MINIMO_CARGANDO_MS, TELEFONO_MS } from "@/lib/animacion"

export type EstadoAccion = "reposo" | "cargando" | "listo" | "telefono" | "motivo" | "fallo"

/** Un error que se le puede mostrar al productor tal cual (ej.: «Ya hay un potrero 4»).
 *  Con `reintentar: false` el botón no ofrece «Probar de nuevo» (ej.: lo que el servidor
 *  rechazó de la cola del teléfono ya está guardado: reintentar desde el botón lo duplicaría). */
export class Motivo extends Error {
  reintentar: boolean
  constructor(texto: string, opciones: { reintentar?: boolean } = {}) {
    super(texto)
    this.reintentar = opciones.reintentar ?? true
  }
}

/** El motivo que se le puede mostrar al productor, si lo hay:
 *  · un `Motivo` de la pantalla;
 *  · un error de la base: sólo si lo tiró a propósito con RAISE (código P0001, escrito en
 *    castellano para él). Los demás códigos son técnicos (permisos, claves repetidas…);
 *  · un error que escribió la propia app (`new Error('No encontramos esa partida…')`, sin
 *    código): son textos nuestros, para él;
 *  · nunca un error de red ni el de una función del servidor (técnicos, en inglés).
 *  Si no hay motivo para mostrar, el botón dice sólo «No salió». */
export function motivoDe(e: unknown): string | null {
  if (e instanceof Motivo) return e.message
  if (!(e instanceof Error) && !(e && typeof e === "object" && "message" in e)) return null
  const err = e as { message?: unknown; code?: unknown; name?: unknown }
  const m = typeof err.message === "string" ? err.message.trim() : ""
  if (!m) return null
  if (err.code !== undefined && err.code !== null && err.code !== "") return err.code === "P0001" ? m : null
  if (e instanceof TypeError) return null
  if (typeof err.name === "string" && /^Functions(Http|Fetch|Relay)Error$|^AuthRetryableFetchError$|^AbortError$/.test(err.name)) return null
  if (/failed to fetch|networkerror|load failed|network request failed|fetch failed/i.test(m)) return null
  return m
}

/** El texto que dice el botón cuando algo no sale: «Sin señal», el motivo real, o «No salió». */
export function textoDelMotivo(e: unknown): string {
  if (typeof navigator !== "undefined" && !navigator.onLine) return "Sin señal"
  return motivoDe(e) ?? "No salió"
}

/** Cuántas letras entran en el botón. Un motivo más largo (una oración de la base) quedaba
 *  cortado: el botón dice «No salió» y la oración entera va en un aviso, para leerla. */
export const MOTIVO_MAX = 40

/** Lo que dice el botón y, si el motivo no entra, el aviso con la oración completa. */
export function repartirMotivo(texto: string): { boton: string; aviso: string | null } {
  return texto.length > MOTIVO_MAX ? { boton: "No salió", aviso: texto } : { boton: texto, aviso: null }
}

/** Cuánto se ve el motivo antes de pasar a «Probar de nuevo». */
export const MOTIVO_MS = 1800

export type Accion = {
  estado: EstadoAccion
  /** El texto del motivo, mientras estado === "motivo". */
  motivo: string
  /** Sube cada vez que falla: el botón se sacude al cambiar. */
  sacudidas: number
  /** Corre la acción. Devuelve true si salió (incluido «en el teléfono»). */
  correr: () => Promise<boolean>
  /** Ocupado: no aceptar otro toque (cargando, mostrando «Listo» o el motivo). */
  ocupado: boolean
}

type Opciones = {
  /** Guarda y pasa a otra pantalla, o sólo actualiza: sin «Listo». */
  sinListo?: boolean
  /** Lo que pasa cuando terminó de verse el «Listo» (o enseguida, con `sinListo`). */
  alTerminar?: () => void
}

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Lo que puede devolver la acción: nada (salió), "telefono", "falta", o el aviso para después. */
export type ResultadoAccion = void | "telefono" | "falta" | (() => void)

export function useAccion(fn: () => Promise<ResultadoAccion>, opciones: Opciones = {}): Accion {
  const [estado, setEstado] = useState<EstadoAccion>("reposo")
  const [motivo, setMotivo] = useState("")
  const [sacudidas, setSacudidas] = useState(0)
  const corriendo = useRef(false)
  const montado = useRef(true)
  // La última función y opciones, sin recrear `correr` en cada render.
  const ultima = useRef({ fn, opciones })
  useEffect(() => {
    ultima.current = { fn, opciones }
  })
  useEffect(() => {
    montado.current = true
    return () => {
      montado.current = false
    }
  }, [])

  const poner = useCallback((e: EstadoAccion) => {
    if (montado.current) setEstado(e)
  }, [])

  const correr = useCallback(async () => {
    if (corriendo.current) return false
    corriendo.current = true
    const { fn: hacer, opciones: op } = ultima.current
    // El giro arranca casi enseguida: si «falta un dato» se resuelve antes y no parpadea.
    let aparecio = 0
    const reloj = setTimeout(() => {
      aparecio = Date.now()
      poner("cargando")
    }, DEMORA_CARGANDO_MS)
    // Cuando de verdad se guardó (o falló), el giro se ve siempre su mínimo, aunque la base
    // conteste en milisegundos: sin eso el «Listo» llegaba de golpe (Lau, 18/11: «va muy rápido»).
    const girarSuMinimo = async () => {
      clearTimeout(reloj)
      if (!aparecio) {
        aparecio = Date.now()
        poner("cargando")
      }
      await espera(Math.max(0, MINIMO_CARGANDO_MS - (Date.now() - aparecio)))
    }
    try {
      const r = await hacer()
      clearTimeout(reloj)
      if (r === "falta") {
        if (montado.current) setSacudidas((n) => n + 1)
        poner("reposo")
        return false
      }
      await girarSuMinimo()
      const avisar = typeof r === "function" ? r : undefined
      if (op.sinListo && r !== "telefono") {
        avisar?.()
        op.alTerminar?.()
        poner("reposo")
        return true
      }
      poner(r === "telefono" ? "telefono" : "listo")
      await espera(r === "telefono" ? TELEFONO_MS : LISTO_MS)
      avisar?.()
      op.alTerminar?.()
      poner("reposo")
      return true
    } catch (e) {
      await girarSuMinimo()
      console.error(e)
      const { boton, aviso } = repartirMotivo(textoDelMotivo(e))
      if (aviso) toast.error(aviso)
      if (montado.current) {
        setMotivo(boton)
        setSacudidas((n) => n + 1)
      }
      poner("motivo")
      await espera(MOTIVO_MS)
      poner(e instanceof Motivo && !e.reintentar ? "reposo" : "fallo")
      return false
    } finally {
      corriendo.current = false
    }
  }, [poner])

  return { estado, motivo, sacudidas, correr, ocupado: estado === "cargando" || estado === "listo" || estado === "telefono" || estado === "motivo" }
}
