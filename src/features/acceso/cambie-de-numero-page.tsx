import { useNavigate } from 'react-router-dom'
import { BotonChico } from '@/components/tropero/boton'
import { Icono } from '@/components/tropero/icono'
import type { NombreIcono } from '@/components/tropero/iconos-svg'
import { AccesoLayout, Preguntas } from './acceso-layout'
import { WHATSAPP_TROPERO } from './reglas'

/** WhatsApp de una PERSONA de Orka. [DEFINIR] Sin la variable, el de Troppero (A8). */
const SOPORTE = (import.meta.env.VITE_WHATSAPP_SOPORTE as string | undefined)?.replace(/\D/g, '') || WHATSAPP_TROPERO

const MENSAJE_SOPORTE = 'Hola, cambié de número y no puedo entrar a Troppero. Soy el dueño de la cuenta.'
const MENSAJE_DUENO = 'Hola, cambié de número. ¿Me lo cambiás en Troppero, en Personas? El nuevo es este desde el que te escribo.'

const whatsapp = (numero: string, texto: string) =>
  window.open(`https://wa.me/${numero}?text=${encodeURIComponent(texto)}`, '_blank', 'noopener')

/**
 * A5 · ¿Cambiaste de número? (decisión de Lau, 05/10: sin CUIT, que es público).
 * El número se cambia desde ADENTRO, con una sesión abierta y un código al
 * número nuevo (Configuración → Mi cuenta). Esta pantalla, que está afuera,
 * muestra los tres casos (no son pasos: QA 10/11, B5) y cada uno lleva a lo suyo.
 */
export function CambieDeNumeroPage() {
  const navigate = useNavigate()
  return (
    <AccesoLayout
      tituloCompu="Tu campo no se pierde."
      tituloCelu="Cambiaste de número."
      encabezado={{
        titulo: 'Cambiaste de número',
        bajada: 'La cuenta es de la empresa, no del teléfono.',
      }}
    >
      <p className="t-tarjeta text-texto">¿Cuál es tu caso?</p>
      <ul className="flex flex-col gap-3">
        <Caso
          titulo="¿Seguís adentro en la compu o en otro celular?"
          texto="Cambialo desde ahí. Te mandamos un código al número nuevo y listo."
          accion="Cambiar mi número"
          icono="Celular"
          onClick={() => navigate('/mi-cuenta/numero')}
        />
        <Caso
          titulo="¿Te invitaron?"
          texto="El dueño cambia tu número desde Personas. Después entrás con el nuevo."
          accion="Pedírselo al dueño"
          icono="Usuario"
          onClick={() => whatsapp('', MENSAJE_DUENO)}
        />
        <Caso
          titulo="¿Sos el dueño y no entrás desde ningún lado?"
          texto="Lo verificamos con vos. Por seguridad, eso no se hace solo."
          accion="Escribinos por WhatsApp"
          icono="Ayuda"
          onClick={() => whatsapp(SOPORTE, MENSAJE_SOPORTE)}
        />
      </ul>
      <Preguntas
        filas={[
          {
            texto: '¿Tenés el número de siempre?',
            boton: (
              <BotonChico type="button" onClick={() => navigate('/login')}>
                Entrá
              </BotonChico>
            ),
          },
        ]}
      />
    </AccesoLayout>
  )
}

/** Un caso: la tarjeta entera se toca y lleva a su acción. */
function Caso({ titulo, texto, accion, icono, onClick }: { titulo: string; texto: string; accion: string; icono: NombreIcono; onClick: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="group flex w-full flex-col gap-1 rounded-[18px] border border-borde bg-superficie px-[18px] py-4 text-left transition-colors hover:border-principal"
      >
        <span className="text-[14.5px] font-semibold text-texto">{titulo}</span>
        <span className="text-[13.5px] text-texto-suave">{texto}</span>
        <span className="mt-1.5 inline-flex items-center gap-1.5 text-[14.5px] font-bold text-principal">
          <Icono nombre={icono} tamano={16} />
          {accion}
        </span>
      </button>
    </li>
  )
}
