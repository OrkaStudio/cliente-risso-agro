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
      tituloCompu="Cambió el número, no tu campo."
      tituloCelu="¿Cambiaste de número?"
      encabezado={{
        titulo: '¿Cambiaste de número?',
        bajada: 'Tranqui: tu campo sigue ahí. Elegí lo que te pasa.',
      }}
    >
      {/* Una sola lista, sin una caja por caso (Lau 12/11: breve y claro). */}
      <ul className="divide-y divide-borde overflow-hidden rounded-[18px] border border-borde bg-superficie">
        <Caso
          icono="Celular"
          titulo="Todavía tengo Troppero abierto"
          texto="Lo cambiás vos en un minuto."
          onClick={() => navigate('/mi-cuenta/numero')}
        />
        <Caso
          icono="Usuario"
          titulo="Me invitó el dueño"
          texto="Le avisás y lo cambia él."
          onClick={() => whatsapp('', MENSAJE_DUENO)}
        />
        <Caso
          icono="Ayuda"
          titulo="Soy el dueño y no puedo entrar"
          texto="Escribinos y lo resolvemos juntos."
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

/** Un caso: la fila entera se toca y lleva a lo suyo. */
function Caso({ icono, titulo, texto, onClick }: { icono: NombreIcono; titulo: string; texto: string; onClick: () => void }) {
  return (
    <li>
      <button type="button" onClick={onClick} className="flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition-colors hover:bg-principal-suave/50">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-principal-suave text-principal">
          <Icono nombre={icono} tamano={16} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-[15px] font-semibold text-texto">{titulo}</span>
          <span className="text-[13.5px] text-texto-suave">{texto}</span>
        </span>
        <Icono nombre="Siguiente" tamano={16} className="shrink-0 text-principal" />
      </button>
    </li>
  )
}
