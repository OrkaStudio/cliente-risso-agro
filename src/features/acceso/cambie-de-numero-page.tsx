import { useNavigate } from 'react-router-dom'
import { LogoWhatsapp } from '@/components/tropero/audio-whatsapp'
import { BotonChico } from '@/components/tropero/boton'
import { AccesoLayout, Preguntas } from './acceso-layout'
import { whatsappCambioDeNumero } from './cambio-de-numero'

/**
 * A5 · ¿Cambiaste de número? (Lau, 25/11: el número lo cambia el equipo, no la
 * persona). Un solo camino, sea dueño o invitado: escribirnos desde el número
 * nuevo. Alguien del equipo confirma que es la persona y lo cambia en la cuenta
 * y en el bot juntos (interno.cambiar_numero).
 */
export function CambieDeNumeroPage() {
  const navigate = useNavigate()
  const link = whatsappCambioDeNumero()
  return (
    <AccesoLayout
      tituloCompu="Cambió el número, no tu campo."
      tituloCelu="¿Número nuevo?"
      encabezado={{
        // En un renglón (Lau, 25/11): título corto y lo justo para actuar.
        titulo: '¿Número nuevo?',
        bajada: 'Escribinos y lo cambiamos.',
      }}
    >
      {link && (
        <a href={link} target="_blank" rel="noreferrer" className="inline-flex h-14 w-full items-center justify-between rounded-full bg-principal py-2 pr-2 pl-[26px] text-[16.5px] font-bold text-principal-texto hover:bg-terracota-600">
          Escribinos por WhatsApp
          <span className="grid size-12 place-items-center rounded-full bg-[#dcf8c6] text-[#1fae55]">
            <LogoWhatsapp className="size-5" />
          </span>
        </a>
      )}
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
