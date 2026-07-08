import { useCallback, useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { platadb, type PlataItem } from './db'
import { fetchRefs, insertarMovimiento, subirFoto, type TipoMov } from './api'

// Campo por defecto (el último usado): sobrevive entre sesiones.
const CAMPO_KEY = 'plata-campo-default'

export type NuevoGasto = {
  tipo: TipoMov
  monto: number
  categoriaId: string
  categoriaNombre: string
  campoId: string
  empresaId: string
  descripcion?: string
  foto?: Blob | null
}

// Lock a nivel módulo (mismo patrón que la recorrida): un drenado a la vez.
let draining = false
let rerun = false
let drainPromise: Promise<void> | null = null

function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine)
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  return online
}

export function usePlata() {
  const online = useOnline()
  const refsArr = useLiveQuery(() => platadb.refs.toArray(), [])
  const outbox = useLiveQuery(
    () => platadb.outbox.orderBy('created_at').reverse().toArray(),
    [],
  )
  const refs = refsArr?.[0] ?? null
  const [error, setError] = useState<string | null>(null)

  /** Refresca categorías/campos (cache para operar sin señal). */
  const cargarRefs = useCallback(async () => {
    try {
      const { categorias, campos } = await fetchRefs()
      await platadb.refs.put({
        id: 'refs',
        categorias,
        campos,
        updated_at: Date.now(),
      })
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'No se pudieron cargar los datos',
      )
    }
  }, [])

  // Drena la cola: foto primero (idempotente), después el insert (id de
  // cliente → reintentar no duplica). Un ítem con error no frena el resto.
  const sincronizar = useCallback(async (): Promise<void> => {
    if (!navigator.onLine) return
    if (draining) {
      rerun = true
      await drainPromise
      return
    }
    const loop = async () => {
      try {
        do {
          rerun = false
          const pendientes = await platadb.outbox
            .where('estado')
            .equals('pendiente')
            .toArray()
          for (const item of pendientes) {
            try {
              if (item.foto && !item.foto_subida) {
                await subirFoto(item)
                await platadb.outbox.update(item.id, { foto_subida: 1 })
              }
              await insertarMovimiento(item)
              // Subido: soltamos el Blob para no acumular fotos en el teléfono.
              await platadb.outbox.update(item.id, {
                estado: 'sincronizada',
                error: null,
                foto: null,
              })
            } catch (e) {
              await platadb.outbox.update(item.id, {
                estado: 'error',
                error: e instanceof Error ? e.message : 'Error al subir',
              })
            }
          }
        } while (rerun)
      } finally {
        draining = false
        drainPromise = null
      }
    }
    draining = true
    drainPromise = loop()
    await drainPromise
  }, [])

  // Refresca refs al entrar con señal (diferido: lint react-hooks).
  useEffect(() => {
    if (!online) return
    const t = setTimeout(() => {
      void cargarRefs()
      void sincronizar()
    }, 0)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online])

  // Refresco por oportunidad: la app vuelve al frente con señal.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        void cargarRefs()
        void sincronizar()
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** Encola el movimiento (local) y dispara el sync. */
  const guardar = useCallback(
    async (n: NuevoGasto) => {
      await platadb.outbox.add({
        id: crypto.randomUUID(),
        empresa_id: n.empresaId,
        campo_id: n.campoId,
        tipo: n.tipo,
        monto: n.monto,
        categoria_id: n.categoriaId,
        categoria_nombre: n.categoriaNombre,
        fecha: new Date().toISOString().slice(0, 10),
        descripcion: n.descripcion?.trim() || null,
        foto: n.foto ?? null,
        foto_subida: 0,
        estado: 'pendiente',
        error: null,
        created_at: Date.now(),
      })
      localStorage.setItem(CAMPO_KEY, n.campoId)
      void sincronizar()
    },
    [sincronizar],
  )

  /** Deshace el último SOLO si todavía no subió (si ya subió, se corrige en
   *  Oficina — acá no borramos plata ya registrada). */
  const deshacer = useCallback(async (id: string) => {
    const item = await platadb.outbox.get(id)
    if (item && item.estado === 'pendiente') await platadb.outbox.delete(id)
  }, [])

  /** Reintenta los que fallaron (los vuelve a la cola). */
  const reintentarErrores = useCallback(async () => {
    const errs = await platadb.outbox.where('estado').equals('error').toArray()
    for (const e of errs) {
      await platadb.outbox.update(e.id, { estado: 'pendiente', error: null })
    }
    void sincronizar()
  }, [sincronizar])

  // Derivados
  const lista = outbox ?? []
  const cargando = refsArr === undefined || outbox === undefined
  const sinSubir = lista.filter((o) => o.estado === 'pendiente').length
  const errores = lista.filter((o) => o.estado === 'error')
  const ultimo: PlataItem | null = lista[0] ?? null

  // Resumen del día (lo cargado HOY desde este teléfono, sin errores):
  // gasto suma negativo, ingreso positivo — el productor ve cuánto lleva.
  const hoyISO = new Date().toISOString().slice(0, 10)
  const deHoy = lista.filter((o) => o.fecha === hoyISO && o.estado !== 'error')
  const hoyCantidad = deHoy.length
  const hoyGastos = deHoy
    .filter((o) => o.tipo === 'gasto')
    .reduce((s, o) => s + o.monto, 0)
  const hoyIngresos = deHoy
    .filter((o) => o.tipo === 'ingreso')
    .reduce((s, o) => s + o.monto, 0)

  const campoDefault =
    localStorage.getItem(CAMPO_KEY) ?? refs?.campos[0]?.id ?? ''

  return {
    online,
    cargando,
    error,
    categorias: refs?.categorias ?? [],
    campos: refs?.campos ?? [],
    campoDefault,
    sinSubir,
    errores,
    ultimo,
    hoyCantidad,
    hoyGastos,
    hoyIngresos,
    guardar,
    deshacer,
    reintentarErrores,
    sincronizar,
    cargarRefs,
  }
}
