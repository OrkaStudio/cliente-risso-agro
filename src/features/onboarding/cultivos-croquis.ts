/**
 * Lo sembrado, dibujado: una marca por cultivo, en la misma caja y con el
 * mismo contorno oscuro que las siluetas de hacienda (`MarcaCategoria`), para
 * que un potrero sembrado se lea en el croquis igual que uno con vacas. A
 * mano porque lucide no tiene maíz ni girasol. Centradas en (0,0), caben en
 * el viewBox "-13 -12 26 21" de la leyenda. La marca (`MarcaCultivo`) vive
 * en `croquis-vivo`, al lado de `MarcaCategoria`.
 */

/** Lo que más se siembra; el resto va en "Otro", escrito. */
export const CULTIVOS = ['Soja', 'Maíz', 'Trigo', 'Girasol', 'Pastura', 'Verdeo'] as const
type Cultivo = (typeof CULTIVOS)[number]

/** Un círculo como subtrayecto, para sumar varios en un solo `d`. */
function circulo(cx: number, cy: number, r: number): string {
  return `M${cx - r} ${cy} a${r} ${r} 0 1 1 ${2 * r} 0 a${r} ${r} 0 1 1 ${-2 * r} 0 z`
}

/**
 * Una hoja: dos curvas entre la base y la punta, abiertas hacia los costados
 * (perpendicular al eje de la hoja, apunte para donde apunte).
 */
function hoja(x0: number, y0: number, x1: number, y1: number, ancho: number): string {
  const largo = Math.hypot(x1 - x0, y1 - y0) || 1
  const nx = (-(y1 - y0) / largo) * ancho
  const ny = ((x1 - x0) / largo) * ancho
  const mx = (x0 + x1) / 2
  const my = (y0 + y1) / 2
  return `M${x0} ${y0} Q${mx + nx} ${my + ny} ${x1} ${y1} Q${mx - nx} ${my - ny} ${x0} ${y0} z`
}

type Estilo = { color: string; d: string; centro?: { d: string; color: string } }

const ESTILO: Record<Cultivo | 'otro', Estilo> = {
  // Soja: la vaina, tres granos en diagonal.
  Soja: {
    color: '#b8c95a',
    d: [circulo(-5, 3, 3.1), circulo(0, 0, 3.3), circulo(5, -3, 3.1), 'M5.5 -6 l2.5 -3 l0.9 0.7 l-2.3 3 z'].join(' '),
  },
  // Maíz: la espiga con sus dos chalas abiertas.
  Maíz: {
    color: '#f0c43a',
    d: [
      'M0 -9.5 C3.2 -9.5 3.6 -4 3.2 1 C2.9 4.5 1.6 6 0 6 C-1.6 6 -2.9 4.5 -3.2 1 C-3.6 -4 -3.2 -9.5 0 -9.5 z',
      'M-1 7 C-5 5 -7 1 -7.5 -3.5 C-5 -1 -3.5 2 -2 4.5 z',
      'M1 7 C5 5 7 1 7.5 -3.5 C5 -1 3.5 2 2 4.5 z',
    ].join(' '),
  },
  // Trigo: la espiga, con granos GORDOS y tallo grueso. Con granos finos a
  // 14 px sólo se veía el contorno oscuro y el trigo no se reconocía.
  Trigo: {
    color: '#f0b94a',
    d: [
      'M-1 1 h2 v7.5 h-2 z',
      hoja(0, 3, -4.8, -0.6, 2.2),
      hoja(0, 3, 4.8, -0.6, 2.2),
      hoja(0, -1.2, -4.6, -4.8, 2.1),
      hoja(0, -1.2, 4.6, -4.8, 2.1),
      hoja(0, -5.2, -4, -8.6, 1.9),
      hoja(0, -5.2, 4, -8.6, 1.9),
      hoja(0, -7.5, 0, -11.5, 1.8),
    ].join(' '),
  },
  // Girasol: pétalos alrededor y el centro oscuro.
  Girasol: {
    color: '#f7c629',
    d: Array.from({ length: 8 }, (_, i) => {
      const a = (i * Math.PI) / 4
      return circulo(Math.cos(a) * 5, -1.5 + Math.sin(a) * 5, 2.4)
    }).join(' '),
    centro: { d: circulo(0, -1.5, 3.2), color: '#6b4420' },
  },
  // Pastura: una mata de pasto.
  Pastura: {
    color: '#6fbf5a',
    d: [
      'M-6 7 C-6 2 -7.5 -2 -9 -5 C-5.5 -2.5 -4 1.5 -3.8 7 z',
      'M-2.2 7 C-2.4 1 -1.8 -4 0 -9 C1.2 -4 1.4 1 1.4 7 z',
      'M3.4 7 C3.8 2 5.2 -1.5 8.5 -4 C7 -0.5 6 3 5.8 7 z',
    ].join(' '),
  },
  // Verdeo: el brote recién nacido, dos hojas sobre un tallo.
  Verdeo: {
    color: '#9fd66b',
    d: ['M-0.7 -1 h1.4 v8 h-1.4 z', hoja(0, -1, -7.5, -6, 2.4), hoja(0, -1, 7.5, -7.5, 2.4)].join(' '),
  },
  // Otro cultivo: una hoja sola, genérica.
  otro: {
    color: '#c7d98c',
    d: [hoja(-5, 6, 6, -8, 4), 'M-6 7.2 l0.9 -1 l1 0.8 l-0.9 1 z'].join(' '),
  },
}

export function estiloDeCultivo(cultivo: string | null | undefined): Estilo {
  const c = CULTIVOS.find((x) => x.toLowerCase() === cultivo?.trim().toLowerCase())
  return c ? ESTILO[c] : ESTILO.otro
}
