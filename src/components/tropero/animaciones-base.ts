// Lo común a las opciones de /estilo/animaciones: la velocidad de la página y
// el ciclo de un botón que hace algo (reposo → cargando → listo / en el
// teléfono / error). Vive aparte de los componentes porque exportar constantes
// desde un archivo de componentes rompe el fast refresh de Vite.
import { createContext, useContext, useRef, useState } from "react"

/** 1 a velocidad normal; 4 en «Lenta». Las opciones multiplican sus duraciones por esto. */
export const Velocidad = createContext(1)
export const useVelocidad = () => useContext(Velocidad)

export const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms))
export const MONTO = "$ 45.000"

/** El cargando no se muestra si la respuesta llega antes: así no parpadea. */
export const DEMORA_CARGANDO = 300
/** Si se llegó a mostrar, queda al menos esto: así no aparece y desaparece de golpe. */
export const MINIMO_CARGANDO = 400
/** Cuánto se ve el «Listo» antes de volver a reposo. */
export const LISTO_MS = 1400
/** «En el teléfono» se ve un poco más: es la noticia distinta. */
export const TELEFONO_MS = 1800

export type Fase = "reposo" | "cargando" | "listo" | "telefono" | "error"
export type Resultado = "listo" | "telefono" | "error" | null

/** Un botón que hace algo: no acepta un segundo toque mientras trabaja. Un error
 *  queda a la vista hasta el próximo toque, que vuelve a intentar. */
export function useAccion() {
  const factor = useVelocidad()
  const [fase, setFase] = useState<Fase>("reposo")
  /** Sube con cada error: los botones lo usan para decir «no» otra vez. */
  const [fallos, setFallos] = useState(0)
  /** Verdadero desde el toque hasta que vuelve a reposo (el cargando, en cambio, espera 0,3 s). */
  const [trabajando, setTrabajando] = useState(false)
  const ocupado = useRef(false)
  /** Devuelve false si el botón estaba ocupado y el toque no hizo nada. */
  async function correr(ms: number, resultado: Resultado, alTerminar?: () => void): Promise<boolean> {
    if (ocupado.current) return false
    ocupado.current = true
    setTrabajando(true)
    setFase("reposo")
    if (ms > 0) {
      let mostrado = 0
      const aviso = setTimeout(() => {
        mostrado = Date.now()
        setFase("cargando")
      }, DEMORA_CARGANDO)
      await esperar(ms)
      clearTimeout(aviso)
      if (mostrado) {
        const falta = MINIMO_CARGANDO - (Date.now() - mostrado)
        if (falta > 0) await esperar(falta)
      }
    }
    if (resultado === "error") {
      setFase("error")
      setFallos((n) => n + 1)
      alTerminar?.()
      ocupado.current = false
      setTrabajando(false)
      return true
    }
    if (resultado) {
      setFase(resultado)
      alTerminar?.()
      await esperar((resultado === "telefono" ? TELEFONO_MS : LISTO_MS) * factor)
    }
    setFase("reposo")
    ocupado.current = false
    setTrabajando(false)
    return true
  }
  return { fase, fallos, trabajando, correr }
}
