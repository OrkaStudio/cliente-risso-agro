import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '@/features/auth/auth-context'
import { sembrarOffline } from '@/features/campo/seed-offline'

/**
 * Prepara el teléfono para el campo: baja TODO el cache offline (recorrida +
 * manga + plata) apenas hay usuario + señal — al login y en cada apertura con
 * red. Persiste la última vez que quedó completo, para poder mostrar "listo
 * para usar sin señal" incluso ya offline. Vive en el CampoShell (una sola
 * instancia para todo el Modo Campo).
 */

const LS_KEY = 'campo.seed.lastOk.v1'

export type SeedEstado = 'idle' | 'sembrando' | 'listo' | 'error'

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

export function useSeedOffline() {
  const { user } = useAuth()
  const online = useOnline()
  const [estado, setEstado] = useState<SeedEstado>('idle')
  const [lastOk, setLastOk] = useState<number | null>(() => {
    const v = localStorage.getItem(LS_KEY)
    return v ? Number(v) : null
  })
  const [error, setError] = useState<string | null>(null)
  // Cerrojo síncrono: los disparadores (login, foreground, botón) pueden
  // solaparse y el setState es asíncrono.
  const corriendo = useRef(false)

  const sembrar = useCallback(async () => {
    if (!navigator.onLine || corriendo.current) return
    corriendo.current = true
    setEstado('sembrando')
    setError(null)
    try {
      const r = await sembrarOffline()
      if (r.ok) {
        const t = Date.now()
        try {
          localStorage.setItem(LS_KEY, String(t))
        } catch {
          /* storage lleno/bloqueado: no es fatal */
        }
        setLastOk(t)
        setEstado('listo')
      } else {
        setError(r.error ?? null)
        setEstado('error')
      }
    } finally {
      corriendo.current = false
    }
  }, [])

  // Login o apertura con señal → sembrar (diferido, fuera del cuerpo del effect).
  useEffect(() => {
    if (!user || !online) return
    const t = setTimeout(() => void sembrar(), 0)
    return () => clearTimeout(t)
  }, [user, online, sembrar])

  // Volver al frente con señal (tuvo la app minimizada) → refrescar.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && navigator.onLine && user) {
        void sembrar()
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [user, sembrar])

  return { estado, lastOk, error, online, sembrar }
}
