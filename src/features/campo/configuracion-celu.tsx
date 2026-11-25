// Configuración del celular (Lau, 19/11): se abre con el engranaje del encabezado. Las
// mismas pantallas que en la compu (Tu cuenta, Personas y Plan), pensadas para el
// teléfono: listas agrupadas de filas que se tocan, no tarjetas sueltas una abajo de la
// otra, y tamaños de celular. Arranca en Tu cuenta y lo primero que se ve es cómo tener
// Troppero como app en el teléfono.
import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { toast } from 'sonner'

import { Boton } from '@/components/tropero/boton'
import { CampoTexto } from '@/components/tropero/campo-texto'
import { Icono, type NombreIcono } from '@/components/tropero/icono'
import { Logo } from '@/components/tropero/logo'
import { PanelLateral } from '@/components/tropero/panel-lateral'
import { useAccion } from '@/components/tropero/use-accion'
import { useAuth } from '@/features/auth/auth-context'
import { celularLindo, useCambiarNombre } from '@/features/configuracion/api'
import { Personas, Plan } from '@/features/configuracion/configuracion-page'
import { PESTANAS, type Pestana } from '@/features/configuracion/pestanas'
import { ListaCambiarCuenta } from '@/features/empresa/elegir-cuenta'
import { esDueno, nombreRol } from '@/features/empresa/secciones'
import { useCuentas, useEmpresa } from '@/features/empresa/use-empresa'
import { nombreDe } from '@/features/guia/nombre-usuario'
import { linkWhatsapp } from '@/features/guia/whatsapp'
import { instalar, useComoInstalar } from '@/lib/instalar'
import { nombrePropio } from '@/lib/texto'
import { cn } from '@/lib/utils'
import { AgregarIphone } from './agregar-iphone'
import { whatsappCambioDeNumero } from '@/features/acceso/cambio-de-numero'
import { LogoWhatsapp } from '@/components/tropero/audio-whatsapp'

export const VIDRIO =
  'bg-[rgb(255_253_249/.8)] backdrop-blur-[18px] backdrop-saturate-150 shadow-[inset_0_0_0_1.5px_rgb(255_255_255/.9),0_0_0_1px_rgb(58_26_13/.09),0_14px_34px_-16px_rgb(168_80_16/.55)]'
/** Un grupo de filas: una sola caja, las filas separadas por una línea. */
const GRUPO = 'overflow-hidden rounded-[18px] bg-superficie shadow-[inset_0_0_0_1px_var(--borde)] divide-y divide-borde/70'

function Rotulo({ children }: { children: React.ReactNode }) {
  return <p className="mb-1.5 px-1 text-[12px] font-bold tracking-[0.05em] text-texto-suave uppercase">{children}</p>
}

/** Una fila de la lista: ícono, qué es, su valor a la derecha y la flecha si se toca. */
function Fila({ icono, titulo, valor, onClick, tono = 'normal' }: { icono: NombreIcono; titulo: React.ReactNode; valor?: React.ReactNode; onClick?: () => void; tono?: 'normal' | 'aviso' }) {
  return (
    <button type="button" onClick={onClick} className="flex min-h-[52px] w-full items-center gap-3 px-3.5 py-2.5 text-left active:bg-superficie-hundida/60">
      <span className={cn('grid size-8 shrink-0 place-items-center rounded-full', tono === 'aviso' ? 'bg-[#fbe6dc] text-[#c8401a]' : 'bg-superficie-hundida text-texto')}>
        <Icono nombre={icono} tamano={16} />
      </span>
      <span className={cn('min-w-0 flex-1 text-[15px] font-semibold', tono === 'aviso' ? 'text-[#c8401a]' : 'text-texto')}>{titulo}</span>
      {valor && <span className="max-w-[48%] truncate text-[14px] text-texto-suave">{valor}</span>}
      {tono === 'normal' && <Icono nombre="Siguiente" tamano={16} className="shrink-0 text-texto-suave/60" />}
    </button>
  )
}

function TresPuntos({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <circle cx="12" cy="5" r="1.9" />
      <circle cx="12" cy="12" r="1.9" />
      <circle cx="12" cy="19" r="1.9" />
    </svg>
  )
}

/** El ícono de Troppero como queda en la pantalla de inicio. */
function IconoApp() {
  return (
    <span className="grid size-11 shrink-0 place-items-center rounded-[12px] shadow-[inset_0_1px_0_rgb(255_255_255/.25),0_6px_14px_-8px_rgb(152_75_37/.7)]" style={{ background: 'linear-gradient(180deg, #c46a3a 0%, #a9532a 100%)' }}>
      <Logo soloIsotipo tono="hueso" alto={20} />
    </span>
  )
}

/**
 * «Tené Troppero en tu celular», arriba de todo y en chico: el ícono, una línea y el
 * botón. Android lo instala de un toque; en el iPhone y en el resto el botón abre cómo
 * se hace (el iPhone, con el teléfono animado).
 */
function TenerEnTuCelular() {
  const como = useComoInstalar()
  const [ver, setVer] = useState(false)
  if (como === 'compu') return null
  if (como === 'instalada')
    return (
      <p className="flex items-center gap-2.5 rounded-[18px] bg-pasto-100 px-3.5 py-3 text-[14.5px] font-semibold text-pasto-800">
        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-pasto-600 text-white">
          <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="m5 12.5 4.5 4.5L19 7.5" />
          </svg>
        </span>
        Ya tenés Troppero en tu celular
      </p>
    )
  const directo = como === 'boton'
  return (
    <section aria-labelledby="tener-troppero" className="flex flex-col gap-3 rounded-[18px] bg-[linear-gradient(135deg,#fbf0e6_0%,#f7e6c6_100%)] p-3.5 shadow-[inset_0_0_0_1px_rgb(201_126_91/.25)]">
      <div className="flex items-center gap-3">
        <IconoApp />
        <span className="min-w-0 flex-1">
          <span id="tener-troppero" className="block text-[15.5px] leading-snug font-bold text-texto">
            Tené Troppero en tu celular
          </span>
          <span className="block text-[13px] leading-snug text-texto-suave">Se abre de un toque, como una app, y anda sin señal.</span>
        </span>
      </div>
      {como === 'otra-app' ? (
        <p className="rounded-[12px] bg-superficie/70 px-3 py-2.5 text-[13.5px] leading-snug text-texto">
          Lo abriste desde otra app. Tocá <b>⋮</b> arriba y elegí <b>Abrir en el navegador</b>: ahí te aparece cómo agregarlo.
        </p>
      ) : (
        <motion.button
          type="button"
          onClick={() => (directo ? void instalar() : setVer(true))}
          whileTap={{ scale: 0.98 }}
          className="flex h-11 items-center justify-center gap-2 rounded-full bg-principal text-[15px] font-bold text-principal-texto shadow-[0_8px_18px_-10px_rgb(152_75_37/.8)]"
        >
          <Icono nombre="Descargar" tamano={16} />
          {directo ? 'Agregar a tu celular' : 'Ver cómo agregarlo'}
        </motion.button>
      )}
      <PanelLateral
        abierto={ver}
        onCerrar={() => setVer(false)}
        titulo={como === 'iphone' ? 'Agregalo a tu iPhone' : 'Agregalo a tu celular'}
        bajada={como === 'iphone' ? 'Son cuatro toques en Safari. Mirá cómo se hace:' : 'Desde el menú del navegador:'}
      >
        {como === 'iphone' ? (
          <div className="flex flex-col gap-3">
            <AgregarIphone />
            {/* Desde WhatsApp el iPhone abre una ventanita de Safari que no tiene «Agregar a inicio». */}
            <p className="px-1 text-[13px] leading-snug text-texto-suave">¿No te aparece? Lo abriste desde otra app: tocá la brújula de abajo para pasarlo a Safari y probá de nuevo.</p>
          </div>
        ) : (
          <ol className="flex flex-col gap-3">
            {[
              { icono: <TresPuntos className="size-5 text-texto" />, texto: <>Tocá <b>⋮</b>, arriba a la derecha</> },
              { icono: <Icono nombre="Agregar" tamano={16} />, texto: <>Elegí <b>Agregar a la pantalla principal</b> o <b>Instalar app</b></> },
            ].map((p, i) => (
              <li key={i} className="flex items-center gap-3 rounded-[14px] bg-superficie px-3.5 py-3 shadow-[inset_0_0_0_1px_var(--borde)]">
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-principal text-[13px] font-bold text-principal-texto">{i + 1}</span>
                <span className="min-w-0 flex-1 text-[15px] leading-snug text-texto">{p.texto}</span>
                <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-fondo text-[#1a73e8]">{p.icono}</span>
              </li>
            ))}
          </ol>
        )}
      </PanelLateral>
    </section>
  )
}

/** Cambiar el nombre: un panel chico con el campo y el botón. */
function EditarNombre({ abierto, onCerrar, actual }: { abierto: boolean; onCerrar: () => void; actual: string }) {
  const cambiar = useCambiarNombre()
  const [nombre, setNombre] = useState(actual)
  const guardar = useAccion(async () => {
    if (!nombre.trim()) return 'falta'
    await cambiar.mutateAsync(nombre)
    return () => {
      onCerrar()
      toast.success('Listo: guardamos tu nombre', { description: 'Así te saluda el asistente.' })
    }
  })
  return (
    <PanelLateral
      chico
      abierto={abierto}
      onCerrar={onCerrar}
      titulo="Tu nombre"
      bajada="Con este te saluda el asistente y te ven las personas que invitás."
      pie={
        <Boton accion={guardar} disabled={guardar.estado === 'reposo' && (!nombre.trim() || nombre.trim() === actual)} className="h-12 w-full rounded-full text-[15.5px] font-bold disabled:opacity-40">
          Guardar el nombre
        </Boton>
      }
    >
      <CampoTexto etiqueta="Cómo te llamás" placeholder="Daniel" autoCapitalize="words" value={nombre} onChange={(e) => setNombre(nombrePropio(e.target.value))} />
    </PanelLateral>
  )
}

/** Tu cuenta, en el celular: tenerlo como app, quién sos, tus datos y salir. */
function TuCuentaCelu() {
  const { user, signOut } = useAuth()
  const { data: membresia } = useEmpresa()
  const varias = (useCuentas().data?.cuentas.length ?? 0) > 1
  const nombre = nombreDe(user?.user_metadata) ?? ''
  const empresa = membresia?.empresa?.nombre ?? ''
  const celular = user?.phone ? celularLindo(user.phone) : null
  const [panel, setPanel] = useState<'nombre' | 'cuentas' | 'numero' | null>(null)
  const [salir, setSalir] = useState(false)
  const cambioDeNumero = whatsappCambioDeNumero({ nombre: nombre || null, empresa: empresa || null, actual: celular })
  const soporte = linkWhatsapp({ nombre: nombre || null, empresa: empresa || null, seccion: 'Configuración', consulta: '' })

  return (
    <div className="flex flex-col gap-5">
      <TenerEnTuCelular />

      <div>
        <Rotulo>Vos</Rotulo>
        <div className={GRUPO}>
          {/* Quién sos para Troppero. */}
          <div aria-label="Tu cuenta" role="region" className="flex items-center gap-3 px-3.5 py-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-full bg-principal font-heading text-[18px] font-extrabold text-principal-texto">{(nombre || empresa || 'T').charAt(0).toUpperCase()}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[16.5px] font-bold text-texto">{nombre || 'Sin nombre'}</span>
              <span className="block truncate text-[13px] text-texto-suave">
                {nombreRol(membresia?.rol ?? '')} de {empresa}
              </span>
            </span>
          </div>
          <Fila icono="Usuario" titulo="Tu nombre" valor={nombre || 'Ponelo'} onClick={() => setPanel('nombre')} />
          <Fila icono="Celular" titulo="Tu número" valor={celular} onClick={() => setPanel('numero')} />
          {varias && <Fila icono="Campos" titulo="Cambiar de cuenta" valor={empresa} onClick={() => setPanel('cuentas')} />}
        </div>
        <p className="mt-2 px-1 text-[12.5px] leading-snug text-texto-suave">Entrás con tu número y un código por WhatsApp. Sin contraseña.</p>
      </div>

      {/* Una persona del equipo, siempre a mano (Lau, 19/11). */}
      {soporte && (
        <div>
          <Rotulo>Ayuda</Rotulo>
          <div className={GRUPO}>
            <Fila icono="Ayuda" titulo="Hablar con el equipo" valor="WhatsApp" onClick={() => window.open(soporte, '_blank', 'noopener')} />
          </div>
        </div>
      )}

      <div className={GRUPO}>
        <Fila icono="Salir" tono="aviso" titulo={salir ? 'Tocá de nuevo para salir' : 'Salir en este celular'} onClick={() => (salir ? void signOut() : setSalir(true))} />
      </div>

      {/* Tu número: lo cambia el equipo (Lau, 25/11). Se dice por qué y se escribe con un toque. */}
      <PanelLateral
        chico
        abierto={panel === 'numero'}
        onCerrar={() => setPanel(null)}
        titulo="¿Cambiaste de número?"
        bajada="Escribinos y lo cambiamos."
        pie={
          cambioDeNumero ? (
            <a href={cambioDeNumero} target="_blank" rel="noreferrer" onClick={() => setPanel(null)} className="inline-flex h-14 w-full items-center justify-between rounded-full bg-principal py-2 pr-2 pl-[26px] text-[16.5px] font-bold text-principal-texto">
              Escribinos por WhatsApp
              <span className="grid size-12 place-items-center rounded-full bg-[#dcf8c6] text-[#1fae55]">
                <LogoWhatsapp className="size-5" />
              </span>
            </a>
          ) : null
        }
      >
        <p className="text-[14px] text-texto-suave">
          Hoy entrás con el <b className="whitespace-nowrap text-texto">{celular}</b>.
        </p>
      </PanelLateral>
      <EditarNombre key={String(panel === 'nombre')} abierto={panel === 'nombre'} onCerrar={() => setPanel(null)} actual={nombre} />
      <PanelLateral chico abierto={panel === 'cuentas'} onCerrar={() => setPanel(null)} titulo="Tus cuentas" bajada="Elegí con cuál trabajar en este celular.">
        <ListaCambiarCuenta onElegido={() => setPanel(null)} />
      </PanelLateral>
    </div>
  )
}

const PESTANAS_CELU: Pestana[] = ['cuenta', 'personas', 'plan']

export function ConfiguracionCelu() {
  const navigate = useNavigate()
  const { data: membresia } = useEmpresa()
  const dueno = esDueno(membresia)
  const [params, setParams] = useSearchParams()
  const pedida = params.get('tab') as Pestana | null
  // En el celular arranca en Tu cuenta (Lau, 19/11): ahí está lo de tenerlo como app.
  const tab: Pestana = dueno && pedida && PESTANAS_CELU.includes(pedida) ? pedida : 'cuenta'
  // Volver a donde estaba; si entró directo por el link, a Hoy.
  const volver = () => ((window.history.state?.idx ?? 0) > 0 ? navigate(-1) : navigate('/campo'))

  return (
    <div className="h-full overflow-y-auto">
      <div className="flex flex-col gap-4 px-4 pt-[max(12px,env(safe-area-inset-top))] pb-[calc(var(--barra,0px)+24px)]">
        <div className="flex items-center gap-3">
          <motion.button type="button" onClick={volver} whileTap={{ scale: 0.92 }} aria-label="Volver" className={cn('grid size-10 shrink-0 place-items-center rounded-full text-texto', VIDRIO)}>
            <Icono nombre="Atrás" />
          </motion.button>
          <h1 className="t-seccion text-texto">Configuración</h1>
        </div>

        {/* Las mismas pestañas que en la compu, en una tira: lo elegido, en terracota. */}
        {dueno && (
          <div role="tablist" aria-label="Configuración" className={cn('flex gap-1 rounded-full p-1', VIDRIO)}>
            {PESTANAS_CELU.map((id) => {
              const p = PESTANAS.find((x) => x.id === id)!
              const si = tab === id
              return (
                <button key={id} type="button" role="tab" aria-selected={si} onClick={() => setParams({ tab: id }, { replace: true })} className="relative flex h-9 flex-1 items-center justify-center rounded-full text-[13.5px] font-bold">
                  {si && (
                    <motion.span
                      layoutId="pestana-config"
                      transition={{ type: 'spring', stiffness: 420, damping: 34, mass: 0.8 }}
                      className="absolute inset-0 rounded-full"
                      style={{ background: 'linear-gradient(180deg, #c46a3a 0%, #b85c2e 55%, #a9532a 100%)' }}
                    />
                  )}
                  <span className={cn('relative transition-colors', si ? 'text-white' : 'text-[#5c4e40]')}>{p.texto}</span>
                </button>
              )
            })}
          </div>
        )}

        <div role={dueno ? 'tabpanel' : undefined} aria-label={PESTANAS.find((p) => p.id === tab)!.texto}>
          {tab === 'cuenta' && <TuCuentaCelu />}
          {tab === 'personas' && <Personas empresa={membresia?.empresa?.nombre ?? ''} />}
          {tab === 'plan' && <Plan celular />}
        </div>
      </div>
    </div>
  )
}
