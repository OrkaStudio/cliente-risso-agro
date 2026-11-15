import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import { Check } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Icono } from '@/components/tropero/icono'
import { Logo } from '@/components/tropero/logo'
import { AccesoLayout } from '@/features/acceso/acceso-layout'
import { useAuth } from '@/features/auth/auth-context'
import { cn } from '@/lib/utils'
import { guardarCuentaElegida } from './cuenta-activa'
import { puedeSumarSuCampo, queEsEnLaCuenta, textoSinSubir, useCambiarCuenta } from './cuentas'
import { resumenNiveles } from './secciones'
import { useCuentas, type Membresia } from './use-empresa'

/**
 * Elegir y cambiar de cuenta (Lau, 14/11; spec del cerebro
 * clientes/risso-agro/especificaciones/2026-11-13-permisos-por-persona,
 * «Una persona en varios campos»). Sólo aparece para quien está en más de una:
 * un veterinario o un ingeniero que atiende varios campos. Nunca se elige sola
 * ni viene marcada: lo que se ve y se carga es de la cuenta que elige.
 */

/** Al entrar con varias cuentas y ninguna elegida en este equipo. */
export function ElegirCuentaPage() {
  const { user, signOut } = useAuth()
  const { data } = useCuentas()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [eligiendo, setEligiendo] = useState<string | null>(null)
  const cuentas = data?.cuentas ?? []

  const elegir = (c: Membresia) => {
    if (!user || eligiendo) return
    setEligiendo(c.empresa_id)
    guardarCuentaElegida(user.id, c.empresa_id)
    void qc.invalidateQueries({ queryKey: ['empresa'] })
  }

  return (
    <AccesoLayout
      tituloCompu="Un mismo Troppero para todos los campos que atendés."
      tituloCelu="¿Con qué cuenta entrás?"
      encabezado={{
        titulo: '¿Con qué cuenta entrás?',
        bajada: `Estás en ${cuentas.length} cuentas. Lo que veas y cargues va a ser de la que elijas. La cambiás cuando quieras.`,
      }}
    >
      <ul className="flex flex-col gap-2.5" aria-label="Tus cuentas">
        {cuentas.map((c) => (
          <li key={c.empresa_id}>
            <button
              type="button"
              onClick={() => elegir(c)}
              disabled={eligiendo !== null}
              className={cn(
                'flex w-full items-center gap-3.5 rounded-[18px] border-[1.5px] border-borde bg-superficie px-4 py-3.5 text-left transition-[border-color,background-color,opacity]',
                'hover:border-principal focus-visible:border-principal focus-visible:outline-none disabled:opacity-60',
                eligiendo === c.empresa_id && 'border-principal bg-principal-suave opacity-100',
              )}
            >
              <Inicial nombre={c.empresa?.nombre ?? '?'} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[17px] font-bold text-texto">{c.empresa?.nombre}</span>
                <span className="block truncate text-[14px] text-texto-suave">{queEsEnLaCuenta(c)}</span>
                {c.rol !== 'dueno' && c.niveles && (
                  <span className="mt-1 block text-[13px] leading-snug text-texto-suave">{resumenNiveles(c.niveles)}</span>
                )}
              </span>
              <Icono nombre="Siguiente" tamano={16} className="shrink-0 text-principal" />
            </button>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        {puedeSumarSuCampo(cuentas) && (
          <button type="button" onClick={() => navigate('/onboarding?propio=1')} className="inline-flex h-11 items-center gap-2 rounded-full px-1 text-[15px] font-bold text-principal">
            <Icono nombre="Agregar" tamano={16} /> Sumar mi campo
          </button>
        )}
        <button type="button" onClick={() => void signOut()} className="ml-auto inline-flex h-11 items-center gap-2 rounded-full px-1 text-[15px] font-semibold text-texto-suave">
          <Icono nombre="Salir" tamano={16} /> Salir
        </button>
      </div>
    </AccesoLayout>
  )
}

function Inicial({ nombre, chica = false }: { nombre: string; chica?: boolean }) {
  return (
    <span className={cn('grid shrink-0 place-items-center rounded-full bg-principal-suave font-heading font-extrabold text-acento-texto', chica ? 'size-8 text-[13px]' : 'size-11 text-[17px]')}>
      {nombre.charAt(0).toUpperCase()}
    </span>
  )
}

/**
 * La lista para cambiar: la actual marcada (es donde estás, no una sugerencia)
 * y las otras para tocar.
 */
export function ListaCambiarCuenta({ onElegido }: { onElegido?: () => void }) {
  const { cuentas, activa, cambio, cambiar } = useCambiarCuenta()
  const navigate = useNavigate()
  return (
    <div className="flex flex-col">
      <p className="px-4 pt-3 pb-1.5 text-[12px] font-semibold tracking-[0.04em] text-texto-suave">Tus cuentas</p>
      <ul role="radiogroup" aria-label="Tus cuentas">
        {cuentas.map((c) => {
          const actual = c.empresa_id === activa?.empresa_id
          return (
            <li key={c.empresa_id}>
              <button
                type="button"
                role="radio"
                aria-checked={actual}
                onClick={() => {
                  if (actual) return onElegido?.()
                  void cambiar(c)
                }}
                className={cn('flex w-full items-center gap-3 px-4 py-2.5 text-left', actual ? 'cursor-default' : 'hover:bg-superficie-hundida/70')}
              >
                <Inicial nombre={c.empresa?.nombre ?? '?'} chica />
                <span className="min-w-0 flex-1 leading-tight">
                  <span className={cn('block truncate text-[15px] text-texto', actual && 'font-bold')}>{c.empresa?.nombre}</span>
                  <span className="block truncate text-[12.5px] text-texto-suave">{actual ? 'Estás acá' : queEsEnLaCuenta(c)}</span>
                </span>
                {actual && <Check className="size-[18px] shrink-0 text-principal" strokeWidth={2.5} />}
              </button>
            </li>
          )
        })}
      </ul>
      {puedeSumarSuCampo(cuentas) && (
        <button type="button" onClick={() => navigate('/onboarding?propio=1')} className="flex items-center gap-3 border-t border-borde px-4 py-3 text-left text-[15px] font-bold text-principal hover:bg-superficie-hundida/70">
          <span className="grid size-8 place-items-center rounded-full border-[1.5px] border-dashed border-principal/60">
            <Icono nombre="Agregar" tamano={16} />
          </span>
          Sumar mi campo
        </button>
      )}
      {cambio.tipo === 'sin_subir' && (
        <p role="alert" className="mx-3 mb-3 rounded-[12px] bg-estado-atencion-suave px-3 py-2.5 text-[13.5px] leading-snug text-texto">
          {textoSinSubir(cambio.cuantas)}
        </p>
      )}
      <EntrandoACuenta nombre={cambio.tipo === 'entrando' ? cambio.nombre : null} />
    </div>
  )
}

/** El pase entre cuentas: la marca y a dónde entra, sobre toda la pantalla. */
export function EntrandoACuenta({ nombre }: { nombre: string | null }) {
  return (
    <AnimatePresence>
      {nombre && (
        <motion.div
          key="entrando"
          role="status"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          className="fixed inset-0 z-[200] grid place-items-center bg-fondo"
        >
          <motion.div initial={{ y: 8, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.08, duration: 0.36, ease: [0.22, 1, 0.36, 1] }} className="flex flex-col items-center gap-4 px-6 text-center">
            <Logo alto={30} />
            <p className="text-[17px] text-texto-suave">
              Entrando a <span className="font-bold text-texto">{nombre}</span>
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
