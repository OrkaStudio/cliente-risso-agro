import { useNavigate } from 'react-router-dom'
import { BotonChico, BotonPrincipal } from '@/components/tropero/boton'
import { AccesoLayout, Pregunta } from './acceso-layout'

/** WhatsApp de una PERSONA de Orka (no el del bot). Sin la variable no se ofrece. */
const SOPORTE = (import.meta.env.VITE_WHATSAPP_SOPORTE as string | undefined)?.replace(/\D/g, '')

const MENSAJE = 'Hola, cambié de número y no puedo entrar a Tropero. Soy el dueño de la cuenta.'

/**
 * A5 · ¿Cambiaste de número? (decisión de Lau, 05/10: sin CUIT, que es público).
 * El número se cambia desde ADENTRO, con una sesión abierta y un código al
 * número nuevo (Configuración → Mi cuenta). Esta pantalla, que está afuera,
 * sólo explica los tres casos y, para el dueño sin ninguna sesión, abre el
 * WhatsApp de soporte de Orka, que lo verifica por fuera.
 */
export function CambieDeNumeroPage() {
  const navigate = useNavigate()
  return (
    <AccesoLayout
      tituloCompu="Tu campo no se pierde."
      tituloCelu="Cambiaste de número."
      encabezado={{
        titulo: 'Cambiaste de número',
        bajada: 'La cuenta es de la empresa, no del teléfono. Hay tres caminos, según tu caso.',
      }}
    >
      <ol className="flex flex-col gap-3">
        <Caso
          paso="1"
          titulo="¿Seguís adentro en la compu o en otro celular?"
          texto="Cambialo desde ahí: Configuración → Mi cuenta → Cambiar mi número. Te mandamos un código al número nuevo y listo."
        />
        <Caso
          paso="2"
          titulo="¿Te invitaron?"
          texto="Pedile al dueño que cambie tu número desde Personas. Después entrás con el nuevo."
        />
        <Caso
          paso="3"
          titulo="¿Sos el dueño y no entrás desde ningún lado?"
          texto="Escribinos y lo verificamos con vos. Por seguridad, eso no se hace solo."
        />
      </ol>
      {SOPORTE && (
        <BotonPrincipal
          icono="Celular"
          onClick={() =>
            window.open(`https://wa.me/${SOPORTE}?text=${encodeURIComponent(MENSAJE)}`, '_blank', 'noopener')
          }
        >
          Escribirle a Tropero
        </BotonPrincipal>
      )}
      <Pregunta texto="¿Tenés el número de siempre?">
        <BotonChico type="button" onClick={() => navigate('/login')}>
          Entrá
        </BotonChico>
      </Pregunta>
    </AccesoLayout>
  )
}

function Caso({ paso, titulo, texto }: { paso: string; titulo: string; texto: string }) {
  return (
    <li className="flex gap-3 rounded-[18px] border border-borde bg-superficie px-[18px] py-4">
      <span className="cifra grid size-7 shrink-0 place-items-center rounded-full bg-principal-suave text-[15px] font-bold text-acento-texto">
        {paso}
      </span>
      <div className="flex flex-col gap-1">
        <p className="text-[14.5px] font-semibold text-texto">{titulo}</p>
        <p className="text-[13.5px] text-texto-suave">{texto}</p>
      </div>
    </li>
  )
}
