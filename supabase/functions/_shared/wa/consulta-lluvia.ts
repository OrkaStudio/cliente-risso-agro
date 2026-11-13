import { campoExacto } from './resolver.ts'
import { norm, sumarDias } from './texto.ts'
import type { Borrador, Campo } from './tipos.ts'

export function preguntaLluvia(texto: string, campos: Campo[], hoy: string): { borrador: Borrador } | { texto: string } | null {
  const t = norm(texto)
  const pregunta = /\bcuantos?\s+(?:(?:habia|ha)\s+llovido|llovio)\b([^?!.;,¿¡]*)/.exec(t)
  if (!pregunta || /\bno (?:te )?(?:pregunte|quise saber|dije)\s*$/.test(t.slice(0, pregunta.index))) return null
  const antes = t.slice(0, pregunta.index).replace(/[¿¡,;\s]+$/, '').trim()
  const despues = t.slice(pregunta.index + pregunta[0].length).replace(/^[?!.;,¿¡\s]+/, '').trim()
  const prefijoSimple = /^(?:che|hola|buenas|decime|sabes|me decis)(?:[, ]+(?:y|sabes|decime))?$/.test(antes)
    || /^no (?:es|era|estoy haciendo) (?:una |la )?recorrida(?:[., ]+(?:quiero saber|te estoy preguntando si sabes))?$/.test(antes)
  if ((antes && !prefijoSimple)
    || (despues && !/^(?:tenes idea|por favor)[?!.\s]*$/.test(despues))
    || /\b(?:y|ademas|tambien|aparte)\b/.test(pregunta[1])) return null
  const resto = pregunta[1].trim().replace(/\s+por favor$/, '')
  const tiempo = /(?:^|\s)((?:la )?semana pasada|esta semana|antes de ayer|anteayer|ayer|hoy|este mes)(?=\s|$)/g
  const fechas = [...resto.matchAll(tiempo)]
  if (fechas.length > 1) return null
  const donde = resto.replace(tiempo, ' ').trim()
  let campoId: string | null = null
  let potreroMencion: string | null = null
  if (donde && !/^en (?:todos los campos|total)$/.test(donde)) {
    if (!/^en\s+\S/.test(donde)) return { texto: 'Decime si querés la lluvia de hoy, de ayer o de este mes, y el campo si corresponde.' }
    const nombre = donde.slice(3)
    const campo = campoExacto(nombre, campos)
    if (campo) campoId = campo.id
    else if (/^(?:(?:el )?(?:potrero )?)\d+[a-z]?$/i.test(nombre)) potreroMencion = nombre.replace(/^(?:el )?(?:potrero )?/, '')
    else return { texto: 'No encontré un campo único con ese nombre. Decímelo como figura en la app.' }
  }
  const periodo = fechas[0]?.[1]
  const fecha = periodo === 'hoy' ? hoy : periodo === 'ayer' ? sumarDias(hoy, -1)
    : periodo === 'anteayer' || periodo === 'antes de ayer' ? sumarDias(hoy, -2) : null
  const semanaPasada = Boolean(periodo?.endsWith('semana pasada'))
  return { borrador: { tipo: 'consulta_lluvia', campoId, potreroMencion, fecha, semanaPasada,
    periodo: semanaPasada || periodo === 'esta semana' ? 'semana' : null } }
}

export function periodoRepreguntaLluvia(texto: string, hoy: string): { fecha: string | null } | null {
  const periodo = /^(?:[¿¡]\s*)?y (anteayer|ayer|hoy|este mes)[?!.\s]*$/.exec(norm(texto))?.[1]
  if (!periodo) return null
  const fecha = periodo === 'hoy' ? hoy : periodo === 'ayer' ? sumarDias(hoy, -1) : periodo === 'anteayer' ? sumarDias(hoy, -2) : null
  return { fecha }
}

export function niegaRecorrida(texto: string): boolean {
  return /\bno (?:es|era|estoy haciendo) (?:una |la )?recorrida\b/.test(norm(texto))
}

export function nombraHacienda(texto: string): boolean {
  return /\b(?:hacienda|rodeo|stock|animal(?:es)?|capones|cap[oó]n|cabezas?|vacas?|vaquillonas?|terner[oa]s?|novill(?:os?|itos?)|toros?|ovejas?|corder[oa]s?|bovinos?|ovinos?|equinos?|caballos?)\b/.test(norm(texto))
}
