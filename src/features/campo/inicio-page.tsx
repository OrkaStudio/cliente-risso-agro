import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { BotonPrincipal } from '@/components/tropero/boton'
import { Icono } from '@/components/tropero/icono'
import { Logo } from '@/components/tropero/logo'
import { useAuth } from '@/features/auth/auth-context'
import { colorDeCampo } from '@/features/campos/use-campo-mapa'
import { useCampoClima } from '@/features/cotizaciones/campo-clima'
import { useClima } from '@/features/cotizaciones/hooks'
import { useEmpresa } from '@/features/empresa/use-empresa'
import { usePanoramaInicio } from '@/features/inicio/hooks'
import { useParaAtender } from '@/features/inicio/para-atender-api'
import { cosasParaHoy, fraseDelDia, franjasDelRodeo, saludo, type Cosa } from '@/features/inicio/tropero/dia'
import { useLluvia60 } from '@/features/inicio/tropero/use-dia'
import { useMapa } from '@/features/mapa/api'
import { useMapaPendiente } from '@/features/mapa/bloqueo'
import { setForceOficina } from '@/lib/campo-mode'
import { cn } from '@/lib/utils'
import textura from '@/assets/tropero/textura-campo.webp'
import { useRecorrida } from './recorrida/use-recorrida'

const CURVA = [0.22, 1, 0.36, 1] as const
const BARRA: Record<Cosa['tono'], string> = { problema: 'bg-[#b3372a]', atencion: 'bg-[#d38f1d]', aviso: 'bg-acento' }

/**
 * Hoy · El día en el celular (página 35): la foto con el campo elegido, lo
 * que hay para hacer hoy en ese campo y sus cabezas. Antes, lo que no puede
 * esperar del Modo Campo: sin señal, lo que falta subir y las recorridas
 * abiertas para retomar. Sin el mapa armado, «Hoy, sin campo».
 */
export function CampoInicioPage() {
  return useMapaPendiente() ? <HoySinCampo /> : <Hoy />
}

function Hoy() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { data: membresia } = useEmpresa()
  const r = useRecorrida()
  const panorama = usePanoramaInicio()
  const atender = useParaAtender()
  const { data: campos } = useMapa(membresia?.empresa_id)
  const clima = useCampoClima()
  // El campo de Hoy es el mismo que el del clima: se elige una vez para los dos.
  const campo = campos?.find((c) => c.id === clima.actual?.id) ?? campos?.[0]
  const tiempo = useClima(clima.actual?.ubicacion ?? null)
  // La ubicación del campo de Hoy (el mismo que el del clima, o su centro).
  const ubicacion = campo && clima.actual?.id === campo.id ? clima.actual.ubicacion : campo?.lat != null && campo.lon != null ? { lat: campo.lat, lon: campo.lon } : null
  const lluvia = useLluvia60(campo?.id ?? null, ubicacion)
  const reducir = useReducedMotion()
  const [eligiendo, setEligiendo] = useState(false)

  const potreros = (atender.data?.potreros ?? []).filter((p) => !campo || p.campo === campo.nombre)
  // En el celular, cada cosa va a su pantalla del Modo Campo.
  const cosas = cosasParaHoy(potreros, panorama.data?.vencimientos ?? [], (atender.data?.sinRecorrer ?? []).filter((c) => c.campo === campo?.nombre), 3).map(
    (c): Cosa => ({
      ...c,
      accion: c.key.startsWith('v-')
        ? { texto: 'Anotar', to: '/campo/plata' }
        : { texto: c.key.startsWith('r-') ? 'Recorrer' : 'Ver', to: '/campo/recorrida' },
    }),
  )
  const crudo = String(user?.user_metadata?.nombre ?? '').trim().split(/\s+/)[0] ?? ''
  const nombre = crudo.charAt(0).toLocaleUpperCase('es-AR') + crudo.slice(1)
  const frase = fraseDelDia({ temp: tiempo.data?.temp ?? null, lugar: null, lluvia60: lluvia.data ? { mm: lluvia.data.total, aprox: lluvia.data.diasEstimados > 0 } : null, cosas: cosas.length })
  const tempTexto = tiempo.data ? `${tiempo.data.temp} grados. ` : ''
  const cabezas = campo ? campo.potreros.reduce((s, p) => s + p.cabezas, 0) : (panorama.data?.totalCabezas ?? 0)
  const color = campo ? colorDeCampo(campo.colorIdx ?? 0) : null
  const franjas = franjasDelRodeo(panorama.data?.porCategoria ?? [])
  const entra = (i: number) =>
    reducir ? {} : { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.35, delay: i * 0.06, ease: CURVA } }

  return (
    <div className="h-full overflow-y-auto bg-fondo pb-8">
      {/* La foto con el saludo */}
      <section className="relative isolate flex min-h-[330px] flex-col px-[22px] pt-[max(16px,env(safe-area-inset-top))] pb-5 text-superficie">
        <img src="/inicio-bienvenida.png" alt="" className="absolute inset-0 -z-20 size-full object-cover object-[30%_50%]" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-black/30 via-black/10 to-black/70" />
        <div className="flex items-center gap-2.5">
          <Logo alto={26} soloIsotipo tono="hueso" />
          {campos && campos.length > 0 && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setEligiendo((v) => !v)}
                aria-expanded={eligiendo}
                className="flex h-9 items-center gap-2 rounded-full border border-white/40 bg-white/20 pr-3 pl-1.5 text-[14px] font-semibold backdrop-blur-sm"
              >
                {color && (
                  <span className="grid size-6 place-items-center rounded-[6px] text-[11px] font-extrabold text-white" style={{ background: color.hex }}>
                    {color.letra}
                  </span>
                )}
                {campo?.nombre}
                {campos.length > 1 && (
                  <Icono nombre="Desplegar" tamano={16} />
                )}
              </button>
              {eligiendo && campos.length > 1 && (
                <ul className="absolute top-11 left-0 z-20 min-w-[200px] overflow-hidden rounded-[14px] bg-superficie py-1.5 text-texto shadow-lg">
                  {campos.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => {
                          clima.elegir(c.id)
                          setEligiendo(false)
                        }}
                        className={cn('flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-[15px]', c.id === campo?.id && 'font-bold')}
                      >
                        <span className="grid size-6 place-items-center rounded-[6px] text-[11px] font-extrabold text-white" style={{ background: colorDeCampo(c.colorIdx ?? 0).hex }}>
                          {colorDeCampo(c.colorIdx ?? 0).letra}
                        </span>
                        {c.nombre}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <MenuCuenta inicial={(nombre || membresia?.empresa?.nombre || 'T').charAt(0)} />
        </div>
        <motion.div {...entra(0)} className="mt-auto pt-16">
          <h1 className="font-heading text-[42px] leading-[1.02] font-extrabold tracking-[-0.02em]">{saludo(new Date().getHours(), nombre)}</h1>
          <p className="mt-2 text-[15px] leading-snug text-superficie/90">
            {tempTexto}
            {frase}
          </p>
        </motion.div>
      </section>

      <div className="flex flex-col gap-5 px-[22px] pt-6">
        <Pendientes r={r} />

        {r.abiertas.map((a) => (
          <motion.button
            {...entra(1)}
            key={a.recorridaId}
            type="button"
            onClick={async () => {
              await r.activar(a.recorridaId)
              navigate('/campo/recorrida')
            }}
            className="flex items-center gap-3.5 rounded-[18px] border-2 bg-superficie px-4 py-4 text-left"
            style={{ borderColor: a.color.hex }}
          >
            <span className="grid size-12 shrink-0 place-items-center rounded-[14px] font-heading text-[20px] font-extrabold text-white" style={{ background: a.color.hex }}>
              {a.color.letra}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-heading text-[18px] font-extrabold text-texto">Seguí la recorrida de {a.campoNombre}</span>
              <span className="text-[13.5px] text-texto-suave">
                {a.hechos} de {a.total} potreros hechos
              </span>
            </span>
            <Icono nombre="Siguiente" />
          </motion.button>
        ))}

        <motion.section {...entra(2)} aria-labelledby="hoy-cosas">
          <h2 id="hoy-cosas" className="font-heading text-[21px] font-extrabold text-texto">
            {cosas.length === 0 ? 'Hoy no hay nada urgente' : `Hoy hay ${['', 'una cosa', 'dos cosas', 'tres cosas'][cosas.length]}`}
          </h2>
          {cosas.length === 0 ? (
            <p className="mt-2 text-[15px] text-texto-suave">Lo que deje la recorrida o venza en la agenda aparece acá.</p>
          ) : (
            <ul className="mt-1">
              {cosas.map((c) => (
                <li key={c.key} className="flex items-center gap-3 border-b border-borde py-3.5 last:border-b-0">
                  <span aria-hidden className={cn('w-1 self-stretch rounded-full', BARRA[c.tono])} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[16px] leading-snug font-semibold text-texto">{c.titulo}</p>
                    <p className="text-[13.5px] leading-snug text-texto-suave">{c.detalle}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate(c.accion.to)}
                    className="h-10 shrink-0 rounded-full bg-superficie-hundida px-4 text-[15px] font-bold text-principal"
                  >
                    {c.accion.texto}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </motion.section>

        <motion.section {...entra(3)} aria-label="Las cabezas" className="pt-2">
          <div className="flex items-end gap-3">
            <p className="titulo-display text-[110px] leading-[0.9] tracking-[-0.04em] text-texto">{cabezas}</p>
            <p className="pb-3 text-[16px] leading-tight font-semibold text-texto-suave">
              cabezas en
              <br />
              {campo?.nombre ?? 'tus campos'}
            </p>
          </div>
          {franjas.length > 0 && (
            <div className="mt-3 flex h-2 gap-1">
              {franjas.map((f) => (
                <span key={f.nombre} className={cn('rounded-full', f.clase)} style={{ flexGrow: f.cabezas }} />
              ))}
            </div>
          )}
        </motion.section>

        <button
          type="button"
          onClick={() => navigate('/campo/lector')}
          className="flex items-center gap-2 self-center py-2 text-[13.5px] font-semibold text-texto-suave"
        >
          <Icono nombre="Bastón lector" tamano={16} />
          Probar un lector de caravana
        </button>
      </div>
    </div>
  )
}

/** Lo que el Modo Campo no puede callar: sin señal, lo que falta subir y lo que se rechazó. */
function Pendientes({ r }: { r: ReturnType<typeof useRecorrida> }) {
  return (
    <>
      {!r.online && (
        <p className="flex items-center gap-2.5 rounded-[14px] bg-estado-atencion-suave px-4 py-3 text-[14px] font-semibold text-estado-atencion-texto">
          <Icono nombre="Sin señal" tamano={16} /> Sin señal: trabajás igual y se sube solo cuando vuelva.
        </p>
      )}
      {(r.sinSubir > 0 || r.lluviaPendiente) && (
        <p className="flex items-center gap-2.5 rounded-[14px] bg-superficie px-4 py-3 text-[14px] text-texto-suave">
          <span className={cn('inline-flex', r.sincronizando && 'animate-spin')}>
            <Icono nombre="Reintentar" tamano={16} />
          </span>
          <span>
            <b className="text-texto">
              {r.sinSubir > 0 ? (r.sinSubir === 1 ? '1 observación' : `${r.sinSubir} observaciones`) : 'La lluvia'}
            </b>{' '}
            sin subir: se sube sola.
          </span>
        </p>
      )}
      {r.errores.length > 0 && (
        <div className="flex flex-col gap-2 rounded-[14px] bg-estado-problema-suave px-4 py-3">
          <p className="text-[14px] font-bold text-estado-problema-texto">
            {r.errores.length === 1 ? 'Una observación no se pudo guardar' : `${r.errores.length} observaciones no se pudieron guardar`}
          </p>
          <ul className="text-[13px] text-estado-problema-texto">
            {r.errores.slice(0, 3).map((e) => (
              <li key={`${e.recorrida_id}-${e.potrero_id}`}>{e.error ?? 'Error al subir'}</li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => void r.descartarErrores()}
            className="h-10 self-start rounded-full border-[1.5px] border-estado-problema-texto/50 bg-superficie px-4 text-[14px] font-bold text-estado-problema-texto"
          >
            Descartarlas
          </button>
        </div>
      )}
    </>
  )
}

/** El avatar: el historial, la Oficina en el celular y salir (con confirmación de dos toques). */
function MenuCuenta({ inicial }: { inicial: string }) {
  const navigate = useNavigate()
  const { signOut } = useAuth()
  const [abierto, setAbierto] = useState(false)
  const [salir, setSalir] = useState(false)
  return (
    <div className="relative ml-auto">
      <button
        type="button"
        aria-label="Tu cuenta"
        aria-expanded={abierto}
        onClick={() => setAbierto((v) => !v)}
        className="grid size-10 place-items-center rounded-full bg-acento font-heading text-[16px] font-extrabold text-acento-texto"
      >
        {inicial.toUpperCase()}
      </button>
      {abierto && (
        <ul className="absolute top-12 right-0 z-20 min-w-[210px] overflow-hidden rounded-[14px] bg-superficie py-1.5 text-texto shadow-lg">
          <li>
            <button type="button" onClick={() => navigate('/campo/historial')} className="flex w-full items-center gap-2.5 px-4 py-3 text-left text-[15px]">
              <Icono nombre="Agenda" tamano={16} /> Historial
            </button>
          </li>
          <li>
            <button
              type="button"
              onClick={() => {
                setForceOficina(true)
                navigate('/')
              }}
              className="flex w-full items-center gap-2.5 px-4 py-3 text-left text-[15px]"
            >
              <Icono nombre="Oficina" tamano={16} /> Ir a la Oficina
            </button>
          </li>
          <li>
            <button
              type="button"
              onClick={() => (salir ? void signOut() : setSalir(true))}
              className={cn('flex w-full items-center gap-2.5 px-4 py-3 text-left text-[15px]', salir && 'bg-estado-problema-suave font-bold text-estado-problema-texto')}
            >
              <Icono nombre="Salir" tamano={16} /> {salir ? '¿Seguro? Tocá de nuevo' : 'Cerrar sesión'}
            </button>
          </li>
        </ul>
      )}
    </div>
  )
}

/** Celu · Hoy, sin campo (página 35): el campo se arma mejor en la compu. */
function HoySinCampo() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { data: membresia } = useEmpresa()
  const { data: campos } = useMapa(membresia?.empresa_id)
  const [mandado, setMandado] = useState(false)
  const crudo = String(user?.user_metadata?.nombre ?? '').trim().split(/\s+/)[0] ?? ''
  const nombre = crudo.charAt(0).toLocaleUpperCase('es-AR') + crudo.slice(1)
  const primero = campos?.find((c) => !c.contorno) ?? campos?.[0]
  return (
    <div className="flex h-full flex-col overflow-y-auto bg-fondo px-[18px] pt-[max(20px,env(safe-area-inset-top))] pb-6">
      <h1 className="titulo-display text-[34px] leading-tight text-texto">{saludo(new Date().getHours(), nombre).replace(/\.$/, '')}</h1>
      <div className="relative mt-4 grid h-[260px] place-items-center overflow-hidden rounded-[24px] bg-superficie-hundida">
        <img src={textura} alt="" className="absolute inset-0 size-full object-cover opacity-30" />
        <div className="relative grid h-[160px] w-[78%] place-items-center rounded-[18px] border-2 border-dashed border-texto-suave/50">
          <p className="font-heading text-[16px] font-extrabold text-texto-suave">Tu campo va a estar acá</p>
        </div>
      </div>
      <h2 className="mt-7 font-heading text-[22px] font-extrabold text-texto">Todavía no armaste tu campo</h2>
      <p className="mt-2 text-[15px] leading-snug text-texto-suave">
        Con el campo y sus potreros cargados, el celular te ubica en cada uno en la recorrida y en la manga.
      </p>
      <p className="mt-5 flex items-center gap-2.5 rounded-[14px] bg-estado-atencion-suave px-4 py-3 text-[14px] font-semibold text-estado-atencion-texto">
        <Icono nombre="Campos" tamano={16} /> Lo primero es armar el campo. Después se abre todo.
      </p>
      <div className="mt-auto flex flex-col gap-3 pt-6">
        {mandado ? (
          <p role="status" className="rounded-[18px] bg-estado-bien-suave px-4 py-3 text-center text-[15px] font-semibold text-estado-bien-texto">
            Listo: abrí el link en la compu.
          </p>
        ) : (
          <BotonPrincipal
            icono="Mail"
            onClick={() => {
              const link = `${window.location.origin}/mapa${primero ? `/${primero.id}` : ''}`
              const celular = (user?.phone ?? '').replace(/\D/g, '')
              window.open(`https://wa.me/${celular}?text=${encodeURIComponent(`Tropero: abrí este link en la compu para armar tu campo en el mapa ${link}`)}`, '_blank', 'noopener')
              setMandado(true)
            }}
          >
            Mandame el link a la compu
          </BotonPrincipal>
        )}
        <button
          type="button"
          onClick={() => navigate(primero ? `/mapa/${primero.id}` : '/mapa')}
          className="h-14 rounded-full border-[1.5px] border-principal text-[16.5px] font-bold text-principal"
        >
          Armarlo desde el celular
        </button>
      </div>
    </div>
  )
}
