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
 * Calendario grande de Troppero, dentro de la pantalla (no un desplegable):
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
          className="inline-flex h-10 items-center gap-1.5 rounded-full bg-superficie-hundida py-1 pr-2 pl-3.5 font-heading text-[17px] font-extrabold text-texto shadow-[inset_0_0_0_1px_var(--borde)] transition-colors hover:bg-principal-suave"
        >
          <span className="first-letter:uppercase">
            {enMeses ? anio : `${MESES[mes.getMonth()]} ${anio}`}
          </span>
          <span className={cn("grid size-6 place-items-center rounded-full bg-superficie text-principal transition-transform", enMeses && "rotate-180")}>
            <Icono nombre="Desplegar" tamano={16} />
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

/**
 * Calendario para elegir un rango (Plata, Lau 24/11): el primer toque marca desde,
 * el segundo hasta (si es antes, se dan vuelta). Lo del medio se pinta suave, las
 * puntas en terracota. Mismo estilo que `Calendario`: días grandes, el mes se toca
 * para saltar de mes y año.
 */
export function CalendarioRango({
  desde: d0,
  hasta: h0,
  onCambio,
  max,
  etiqueta,
}: {
  desde: string;
  hasta: string;
  onCambio: (desde: string, hasta: string) => void;
  max?: string;
  etiqueta: string;
}) {
  const hoy = new Date();
  const base = h0 ? desde(h0) : d0 ? desde(d0) : hoy;
  const [mes, setMes] = useState(() => new Date(base.getFullYear(), base.getMonth(), 1));
  const [vista, setVista] = useState<"dias" | "meses">("dias");
  // Visto el último rango que llegó de afuera (un atajo): el calendario va a ese mes.
  const [visto, setVisto] = useState(`${d0}|${h0}`);
  if (`${d0}|${h0}` !== visto) {
    setVisto(`${d0}|${h0}`);
    const v = h0 || d0;
    if (v) {
      const d = desde(v);
      setMes(new Date(d.getFullYear(), d.getMonth(), 1));
    }
  }
  const tope = max ? desde(max) : null;
  const inicio = (mes.getDay() + 6) % 7;
  const dias = new Date(mes.getFullYear(), mes.getMonth() + 1, 0).getDate();
  const anio = mes.getFullYear();
  const enMeses = vista === "meses";
  const siguienteBloqueado =
    tope !== null &&
    (enMeses ? anio + 1 > tope.getFullYear() : new Date(anio, mes.getMonth() + 1, 1) > tope);
  const mover = (n: number) =>
    setMes((m) => (enMeses ? new Date(m.getFullYear() + n, m.getMonth(), 1) : new Date(m.getFullYear(), m.getMonth() + n, 1)));
  const tocar = (f: string) => {
    // Sin desde, o con el rango ya completo: empieza uno nuevo.
    if (!d0 || h0) return onCambio(f, "");
    if (f < d0) return onCambio(f, d0);
    onCambio(d0, f);
  };

  return (
    <div className="rounded-[20px] border-[1.5px] border-borde bg-superficie p-3" role="group" aria-label={etiqueta}>
      <div className="mb-1 flex items-center justify-between">
        <button type="button" aria-label={enMeses ? "Año anterior" : "Mes anterior"} onClick={() => mover(-1)} className="grid size-11 place-items-center rounded-full text-texto hover:bg-superficie-hundida">
          <Icono nombre="Atrás" />
        </button>
        <button
          type="button"
          aria-expanded={enMeses}
          aria-label={enMeses ? "Volver a los días" : "Elegir mes y año"}
          onClick={() => setVista(enMeses ? "dias" : "meses")}
          // Que se note que se toca (Lau, 24/11): una pastilla con fondo y la flecha de desplegar.
          className="inline-flex h-10 items-center gap-1.5 rounded-full bg-superficie-hundida py-1 pr-2 pl-3.5 font-heading text-[17px] font-extrabold text-texto shadow-[inset_0_0_0_1px_var(--borde)] transition-colors hover:bg-principal-suave"
        >
          <span className="first-letter:uppercase">{enMeses ? anio : `${MESES[mes.getMonth()]} ${anio}`}</span>
          <span className={cn("grid size-6 place-items-center rounded-full bg-superficie text-principal transition-transform", enMeses && "rotate-180")}>
            <Icono nombre="Desplegar" tamano={16} />
          </span>
        </button>
        <button type="button" aria-label={enMeses ? "Año siguiente" : "Mes siguiente"} disabled={siguienteBloqueado} onClick={() => mover(1)} className="grid size-11 place-items-center rounded-full text-texto hover:bg-superficie-hundida disabled:opacity-25">
          <Icono nombre="Siguiente" />
        </button>
      </div>
      {enMeses ? (
        <div className="grid grid-cols-3 gap-2 pt-1 pb-1">
          {MESES.map((m, i) => {
            const fuera = tope !== null && new Date(anio, i, 1) > tope;
            return (
              <button
                key={m}
                type="button"
                disabled={fuera}
                onClick={() => {
                  setMes(new Date(anio, i, 1));
                  setVista("dias");
                }}
                className="h-12 rounded-[12px] bg-superficie-hundida/60 text-[15px] font-bold text-texto capitalize transition-colors hover:bg-principal-suave disabled:opacity-25"
              >
                {m.slice(0, 3)}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-7 gap-y-1 text-center">
          {DIAS.map((d, i) => (
            <span key={i} className="py-1 text-[12px] font-bold text-texto-suave">
              {d}
            </span>
          ))}
          {Array.from({ length: inicio }, (_, i) => (
            <span key={`v${i}`} />
          ))}
          {Array.from({ length: dias }, (_, i) => {
            const d = new Date(mes.getFullYear(), mes.getMonth(), i + 1);
            const f = ymd(d);
            const completo = !!d0 && !!h0 && d0 !== h0;
            const punta = f === d0 || f === h0;
            const medio = completo && f > d0 && f < h0;
            const fuera = tope !== null && d > tope;
            const esHoy = f === ymd(hoy);
            // Una banda fina detrás de los días del rango; las puntas, círculos llenos
            // que se unen a la banda por el lado de adentro (Lau, 24/11: «mejorá esta visual»).
            const banda = medio
              ? "bg-principal-suave"
              : completo && f === d0
                ? "bg-[linear-gradient(to_right,transparent_50%,var(--color-principal-suave)_50%)]"
                : completo && f === h0
                  ? "bg-[linear-gradient(to_left,transparent_50%,var(--color-principal-suave)_50%)]"
                  : "";
            return (
              <span key={f} className="grid place-items-center">
                <span className={cn("grid h-9 w-full place-items-center", banda)}>
                  <button
                    type="button"
                    disabled={fuera}
                    aria-pressed={punta}
                    aria-label={`${i + 1} de ${MESES[mes.getMonth()]}`}
                    onClick={() => tocar(f)}
                    className={cn(
                      "cifra grid size-9 place-items-center rounded-full text-[16px] font-bold transition-colors disabled:text-texto-suave/30",
                      punta
                        ? "bg-principal text-principal-texto shadow-[0_4px_10px_-4px_rgb(152_75_37/.7)]"
                        : medio
                          ? "text-acento-texto"
                          : esHoy
                            ? "text-principal ring-[1.5px] ring-principal/60"
                            : "text-texto enabled:hover:bg-superficie-hundida",
                    )}
                  >
                    {i + 1}
                  </button>
                </span>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
