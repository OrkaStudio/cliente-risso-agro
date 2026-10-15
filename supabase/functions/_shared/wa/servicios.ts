/** Reintentar sólo lecturas de IA; nunca reintentar aquí escrituras de campo ni envíos. */
export async function leerServicio<T>(d: {
  pedir: () => Promise<Response>
  esperar?: (ms: number) => Promise<void>
}): Promise<T> {
  const esperar = d.esperar ?? (ms => new Promise(resolve => setTimeout(resolve, ms)))
  for (let intento = 0; ; intento++) {
    let r: Response
    try { r = await d.pedir() } catch (e) {
      if (intento >= 1) throw e
      await esperar(500); continue
    }
    if ((r.status === 429 || r.status >= 500) && intento < 1) {
      await r.body?.cancel().catch(() => {})
      await esperar(750); continue
    }
    if (!r.ok) { await r.body?.cancel().catch(() => {}); throw new Error(`Servicio de interpretación no disponible (${r.status})`) }
    return await r.json() as T
  }
}

/** Orden local; la cola persistente agrega exclusión entre instancias del servidor. */
export class Turnos {
  private finales = new Map<string, Promise<unknown>>()
  ejecutar<T>(clave: string, trabajo: () => Promise<T>): Promise<T> {
    const anterior = this.finales.get(clave) ?? Promise.resolve()
    const actual = anterior.catch(() => {}).then(trabajo)
    this.finales.set(clave, actual)
    void actual.finally(() => { if (this.finales.get(clave) === actual) this.finales.delete(clave) }).catch(() => {})
    return actual
  }
}

export function secretoValido(esperado: string | undefined, recibido: string | null): boolean {
  if (!esperado || esperado.length<32 || !recibido || esperado.length!==recibido.length) return false
  let diff=0
  for(let i=0;i<esperado.length;i++) diff|=esperado.charCodeAt(i)^recibido.charCodeAt(i)
  return diff===0
}
export const empresaEnPiloto=(lista:string|undefined,empresaId:string)=>Boolean(lista?.split(',').map(s=>s.trim()).includes(empresaId))
