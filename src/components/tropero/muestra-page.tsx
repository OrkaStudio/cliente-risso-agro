// Página interna de desarrollo (/estilo): los componentes base de Tropero
// juntos, para compararlos con la página 34 del Figma. No existe en producción.
import { useState } from "react"

import { Aviso } from "./aviso"
import { Boton, BotonChico, BotonPrincipal } from "./boton"
import { CampoTexto } from "./campo-texto"
import { Chip } from "./chip"
import { Icono } from "./icono"
import { ICONOS_SVG, type NombreIcono } from "./iconos-svg"
import { Logo } from "./logo"

export function MuestraPage() {
  const [noche, setNoche] = useState(false)
  return (
    <div className={noche ? "dark h-full" : "h-full"}>
      <div className="h-full overflow-y-auto bg-fondo p-10 text-texto">
        <div className="mx-auto flex max-w-5xl flex-col gap-10">
          <header className="flex items-center justify-between">
            <Logo alto={32} />
            <BotonChico onClick={() => setNoche((n) => !n)}>{noche ? "Día" : "Noche"}</BotonChico>
          </header>

          <section className="flex flex-col gap-3">
            <h2 className="text-[22px]">Botón</h2>
            {(["normal", "grande"] as const).map((t) => (
              <div key={t} className="flex flex-wrap items-center gap-3">
                {(["principal", "destacado", "acento", "secundario", "fantasma"] as const).map((k) => (
                  <Boton key={k} tipo={k} tamano={t} icono="Guardar">
                    Guardar
                  </Boton>
                ))}
              </div>
            ))}
            <div className="flex max-w-sm flex-col gap-3">
              <BotonPrincipal icono="Celular">Mandame el código</BotonPrincipal>
              <BotonPrincipal icono="Celular" cargando>
                Mandando el código
              </BotonPrincipal>
              <div className="flex items-center justify-center gap-1.5 text-[14.5px] text-texto-suave">
                ¿Primera vez? <BotonChico>Creá tu cuenta</BotonChico>
              </div>
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-[22px]">Chip</h2>
            <div className="flex flex-wrap gap-2">
              {(["neutro", "bien", "atencion", "problema", "aviso", "marca"] as const).map((k) => (
                <Chip key={k} tipo={k}>
                  Preñada
                </Chip>
              ))}
              <Chip tipo="bien" icono="Vacuna">
                Vacunada
              </Chip>
            </div>
          </section>

          <section className="grid grid-cols-2 gap-3">
            <Aviso tipo="info" icono="Lluvia" titulo="Se esperan 30 mm el domingo">
              Revisá el boyero del 11B antes
            </Aviso>
            <Aviso tipo="atencion" icono="Agua" titulo="Se esperan 30 mm el domingo">
              Revisá el boyero del 11B antes
            </Aviso>
            <Aviso tipo="problema" icono="Eléctrico" titulo="Se esperan 30 mm el domingo">
              Revisá el boyero del 11B antes
            </Aviso>
            <Aviso tipo="bien" icono="Guardar" titulo="Se esperan 30 mm el domingo">
              Revisá el boyero del 11B antes
            </Aviso>
          </section>

          <section className="grid max-w-2xl grid-cols-2 gap-4">
            <CampoTexto etiqueta="Tu celular, el que tiene WhatsApp" defaultValue="+54 9 2241 55-8820" />
            <CampoTexto etiqueta="Lluvia" defaultValue="18" unidad="mm" ayuda="Opcional · se ve en la ficha" />
            <CampoTexto etiqueta="Lluvia" defaultValue="dieciocho" unidad="mm" error="Tiene que ser un número" />
            <CampoTexto etiqueta="Lluvia" defaultValue="18" unidad="mm" disabled />
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-[22px]">Íconos</h2>
            <div className="grid grid-cols-8 gap-4">
              {(Object.keys(ICONOS_SVG) as NombreIcono[]).map((n) => (
                <div key={n} className="flex flex-col items-center gap-1.5 text-[11px] text-texto-suave">
                  <div className="flex items-center gap-2 text-texto">
                    <Icono nombre={n} />
                    <Icono nombre={n} tamano={16} />
                  </div>
                  {n}
                </div>
              ))}
            </div>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-[22px]">Tipografía</h2>
            <p className="titulo-display text-[40px]">Entrá con tu celular.</p>
            <p className="font-heading text-[22px] font-extrabold">Tus campos están cargados.</p>
            <p className="text-[15px]">Inter 15 · el texto de todos los días.</p>
            <p className="cifra text-[20px] font-bold">533 ha · 15 potreros · 218 cabezas</p>
          </section>
        </div>
      </div>
    </div>
  )
}
