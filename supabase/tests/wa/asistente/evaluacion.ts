/** Detecta preguntas por el identificador, sin confundir «busqué la caravana» con una pregunta. */
export function preguntaIdentificador(texto:string):boolean {
  return /(?:^|[¿\s])qu[eé]\s+(?:(?:es|era|tiene)\s+)?(?:el\s+)?(?:n[uú]mero|caravana)|(?:^|[¿\s])cu[aá]l\s+(?:es|era)\s+(?:la\s+caravana|el\s+n[uú]mero)/i.test(texto)
}

export function preguntaLugar(texto:string,opciones:string[]):boolean {
  const normal=(s:string)=>s.normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase()
  const t=normal(texto)
  return t.includes('?')&&(/\bpotrero\b/.test(t)||opciones.some(o=>t.includes(normal(o))))
}
