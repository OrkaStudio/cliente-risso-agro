import { useState } from "react";
import { cn } from "@/lib/utils";
import { Icono } from "./icono";

const DIAS = ["L", "M", "M", "J", "V", "S", "D"];
const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const desde = (s: string) => {
  const [a, m, d] = s.split("-").map(Number);
  return new Date(a!, m! - 1, d!);
};

/**
 * Calendario grande de Tropero, dentro de la pantalla (no un desplegable):
 * días de 44 px, el mes en grande y flechas grandes. Las fechas se manejan en
 * hora local ('YYYY-MM-DD'), nunca con toISOString.
 */
export function Calendario({
  valor,
  onCambio,
  max,
  etiqueta,
}: {
  valor: string;
  onCambio: (fecha: string) => void;
  /** 'YYYY-MM-DD': no deja elegir después de este día. */
  max?: string;
  etiqueta: string;
}) {
  const hoy = new Date();
  const base = valor ? desde(valor) : hoy;
  const [mes, setMes] = useState(
    () => new Date(base.getFullYear(), base.getMonth(), 1),
  );
  // Si eligen una fecha con los atajos, el calendario va a ese mes.
  const [visto, setVisto] = useState(valor);
  if (valor !== visto) {
    setVisto(valor);
    if (valor) {
      const d = desde(valor);
      setMes(new Date(d.getFullYear(), d.getMonth(), 1));
    }
  }

  const tope = max ? desde(max) : null;
  // «Mayo 2026» se toca y se elige mes y año de una: nadie pasa 14 meses con flechas.
  const [vista, setVista] = useState<"dias" | "meses">("dias");
  const inicio = (mes.getDay() + 6) % 7; // lunes primero
  const dias = new Date(mes.getFullYear(), mes.getMonth() + 1, 0).getDate();
  const anio = mes.getFullYear();
  const enMeses = vista === "meses";
  const siguienteBloqueado =
    tope !== null &&
    (enMeses
      ? anio + 1 > tope.getFullYear()
      : new Date(anio, mes.getMonth() + 1, 1) > tope);
  const mover = (n: number) =>
    setMes((m) =>
      enMeses
        ? new Date(m.getFullYear() + n, m.getMonth(), 1)
        : new Date(m.getFullYear(), m.getMonth() + n, 1),
    );

  return (
    <div
      className="rounded-[20px] border-[1.5px] border-borde bg-superficie p-3"
      role="group"
      aria-label={etiqueta}
    >
      <div className="mb-1 flex items-center justify-between">
        <button
          type="button"
          aria-label={enMeses ? "Año anterior" : "Mes anterior"}
          onClick={() => mover(-1)}
          className="grid size-11 place-items-center rounded-full text-texto hover:bg-superficie-hundida"
        >
          <Icono nombre="Atrás" />
        </button>
        <button
          type="button"
          aria-expanded={enMeses}
          aria-label={enMeses ? "Volver a los días" : "Elegir mes y año"}
          onClick={() => setVista(enMeses ? "dias" : "meses")}
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-heading text-[19px] font-extrabold text-texto hover:bg-superficie-hundida"
        >
          <span className="first-letter:uppercase">
            {enMeses ? anio : `${MESES[mes.getMonth()]} ${anio}`}
          </span>
          <span
            className={cn(
              "text-texto-suave transition-transform",
              enMeses ? "rotate-90" : "-rotate-90",
            )}
          >
            <Icono nombre="Atrás" tamano={16} />
          </span>
        </button>
        <button
          type="button"
          aria-label={enMeses ? "Año siguiente" : "Mes siguiente"}
          disabled={siguienteBloqueado}
          onClick={() => mover(1)}
          className="grid size-11 place-items-center rounded-full text-texto hover:bg-superficie-hundida disabled:opacity-25"
        >
          <Icono nombre="Siguiente" />
        </button>
      </div>
      {enMeses ? (
        <div className="grid grid-cols-3 gap-2 pt-1 pb-1">
          {MESES.map((m, i) => {
            const fuera = tope !== null && new Date(anio, i, 1) > tope;
            const actual = valor ? desde(valor) : null;
            const elegido =
              actual?.getFullYear() === anio && actual.getMonth() === i;
            return (
              <button
                key={m}
                type="button"
                disabled={fuera}
                aria-pressed={elegido}
                onClick={() => {
                  setMes(new Date(anio, i, 1));
                  setVista("dias");
                }}
                className={cn(
                  "h-12 rounded-[12px] text-[15px] font-bold capitalize transition-colors disabled:opacity-25",
                  elegido
                    ? "bg-principal text-principal-texto"
                    : "bg-superficie-hundida/60 text-texto hover:bg-principal-suave",
                )}
              >
                {m.slice(0, 3)}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-7 gap-1 text-center">
          {DIAS.map((d, i) => (
            <span
              key={i}
              className="py-1 text-[12.5px] font-bold text-texto-suave"
            >
              {d}
            </span>
          ))}
          {Array.from({ length: inicio }, (_, i) => (
            <span key={`v${i}`} />
          ))}
          {Array.from({ length: dias }, (_, i) => {
            const d = new Date(mes.getFullYear(), mes.getMonth(), i + 1);
            const f = ymd(d);
            const elegido = f === valor;
            const esHoy = f === ymd(hoy);
            const fuera = tope !== null && d > tope;
            return (
              <button
                key={f}
                type="button"
                disabled={fuera}
                aria-pressed={elegido}
                aria-label={`${i + 1} de ${MESES[mes.getMonth()]}`}
                onClick={() => onCambio(f)}
                className={cn(
                  "cifra grid h-11 place-items-center md:h-10 rounded-[12px] text-[18px] font-bold transition-colors disabled:opacity-25",
                  elegido
                    ? "bg-principal text-principal-texto"
                    : esHoy
                      ? "border-[1.5px] border-principal text-principal"
                      : "text-texto hover:bg-principal-suave",
                )}
              >
                {i + 1}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
