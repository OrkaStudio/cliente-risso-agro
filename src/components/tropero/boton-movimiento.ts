// El movimiento compartido de los botones de Troppero (B · Con cuerpo, 18/11):
// la velocidad (1 normal; 4 en la muestra «Lenta») y el asentir del «Listo».
// En un .ts aparte porque exportar hooks desde un archivo de componentes rompe el fast refresh.
import { useAnimate, useReducedMotion } from "framer-motion"
import { createContext, useContext, useEffect, useState } from "react"

import { HUNDIR, HUNDIR_CHICO, LISTO_ASENTIR, SACUDIDA } from "@/lib/animacion"

import { MOTIVO_MS, repartirMotivo, type Accion, type EstadoAccion } from "./use-accion"
import { toast } from "sonner"

/** 1 a velocidad normal; 4 en «Lenta». */
export const Velocidad = createContext(1)
export const useF = () => useContext(Velocidad)

/** Que el botón asienta una vez al llegar al «Listo». */
export function useAsentir(listo: boolean, quieto?: boolean) {
  const [ref, animar] = useAnimate<HTMLButtonElement>()
  const reducir = useReducedMotion()
  const f = useF()
  useEffect(() => {
    if (!listo || quieto || reducir || !ref.current) return
    void animar(ref.current, { scale: LISTO_ASENTIR.escala as unknown as number[] }, { duration: LISTO_ASENTIR.duracion * f, times: LISTO_ASENTIR.tiempos as unknown as number[], delay: LISTO_ASENTIR.demora * f })
  }, [listo, quieto, reducir, ref, animar, f])
  return ref
}

/** Lo que hace el botón al apretarlo: se hunde (un poco más si es chico) y rebota. */
export const tap = (f: number, chico?: boolean) => ({ scale: (chico ? HUNDIR_CHICO : HUNDIR).escala, transition: { ...HUNDIR.resorte, visualDuration: HUNDIR.resorte.visualDuration * f } })

/** Lo que hace un botón con `accion`: se sacude cuando falla (o falta un dato) y asiente
 *  una vez al llegar al «Listo». Devuelve la ref para el botón. */
export function useMovimiento(accion: Accion | undefined) {
  const [scope, animar] = useAnimate<HTMLButtonElement>()
  const reducir = useReducedMotion()
  const sacudidas = accion?.sacudidas ?? 0
  const listo = accion?.estado === "listo"
  useEffect(() => {
    if (!sacudidas || reducir || !scope.current) return
    void animar(scope.current, { x: [...SACUDIDA.recorrido] }, { duration: SACUDIDA.duracion })
  }, [sacudidas, reducir, scope, animar])
  useEffect(() => {
    if (!listo || reducir || !scope.current) return
    void animar(scope.current, { scale: [...LISTO_ASENTIR.escala] }, { duration: LISTO_ASENTIR.duracion, times: [...LISTO_ASENTIR.tiempos], delay: LISTO_ASENTIR.demora })
  }, [listo, reducir, scope, animar])
  return scope
}

/** Para los flujos que guardan con su propio `correr` (editor del mapa, tutorial, onboarding):
 *  con el motivo del último fallo y si está cargando, arma lo mismo que da useAccion para que
 *  el botón se sacuda, diga el motivo un momento y pase a «Probar de nuevo». */
export function useFallo(fallo: string | null | undefined, cargando: boolean): Accion | undefined {
  const [previo, setPrevio] = useState(fallo)
  const [fase, setFase] = useState<"motivo" | "fallo" | null>(null)
  const [sacudidas, setSacudidas] = useState(0)
  // Cambió el fallo: se ajusta el estado en el render (sin efecto que lo copie).
  if (fallo !== previo) {
    setPrevio(fallo)
    setFase(fallo ? "motivo" : null)
    if (fallo) setSacudidas((n) => n + 1)
  }
  useEffect(() => {
    if (fase !== "motivo") return
    const t = setTimeout(() => setFase("fallo"), MOTIVO_MS)
    return () => clearTimeout(t)
  }, [fase, sacudidas])
  // Un motivo que no entra en el botón va entero en un aviso (una vez por fallo).
  const { boton, aviso } = repartirMotivo(fallo ?? "")
  useEffect(() => {
    if (aviso && sacudidas) toast.error(aviso)
  }, [aviso, sacudidas])
  if (!fallo && !cargando && !sacudidas) return undefined
  const estado: EstadoAccion = cargando ? "cargando" : fallo && fase ? fase : "reposo"
  return { estado, motivo: boton, sacudidas, correr: async () => false, ocupado: cargando }
}
