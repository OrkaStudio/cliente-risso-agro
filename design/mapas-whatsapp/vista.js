import { simbolos } from './simbolos.js'

const controls = Object.fromEntries(
  ['symbol', 'state', 'background', 'field', 'zoom', 'size'].map(id => [id, document.getElementById(id)])
)
const mapElement = document.getElementById('map')
const status = document.getElementById('status')
const stocks = { '1B': 16, '2B': 0, '3B': 16, '4B': 0, '5B': 0, '6B': 15, '7B': 15, '8B': 0, '9B': 15, '10B': 30, '11B': 16, '12B': 15 }
const source = await fetch('../../output/wa-mapa/referencia-figma.json').then(response => {
  if (!response.ok) throw Error('Falta la referencia local del campo')
  return response.json()
})
const photo = '../../output/wa-mapa/referencia-figma.jpg'
const stories = [
  {
    "role": "Productor",
    "title": "Nacimientos en el 11B",
    "pot": "11B",
    "icon": "Ternero",
    "input": "Audio · 0:06\nParieron 3 vaquillonas en el 11B, 2 machos y una hembra.",
    "output": "Anoté los 3 nacimientos del 11B, 2 machos y una hembra. El potrero queda con 135 cabezas.",
    "stock": "11B · 132 → 135 cabezas",
    "record": "3 nacimientos",
    "ref": "11B · 2 machos y 1 hembra"
  },
  {
    "role": "Veterinario",
    "title": "Análisis y factura vinculados",
    "pot": "9B",
    "icon": "Análisis",
    "input": "Analisis_brucelosis_9B.pdf\n2 páginas · documento enviado por el veterinario",
    "output": "Las 30 vacas del 9B dieron negativo a brucelosis. El resultado quedó en sus fichas y la factura del laboratorio, de $127.050, en los gastos de septiembre.",
    "stock": "9B · 30 vacas analizadas de 270 cabezas",
    "record": "Brucelosis · 30 negativos",
    "ref": "9B · PDF y factura asociados"
  },
  {
    "role": "Encargado",
    "title": "Bebedero roto y traslado",
    "pot": "7B",
    "icon": "Bebedero roto",
    "input": "Se rompió el bebedero del 7B. Pasé las vacas al 8B.",
    "output": "Dejé marcado el bebedero roto del 7B y las 37 vacas en el 8B. Ya le avisé al dueño. Mañana te pregunto si quedó arreglado.",
    "stock": "7B · 37 → 0 cabezas     8B · 0 → 37 cabezas",
    "record": "Bebedero roto",
    "ref": "7B · aviso del encargado"
  },
  {
    "role": "Ingeniero",
    "title": "Malezas y fecha de aplicación",
    "pot": "2B",
    "icon": "Malezas",
    "input": "Hay malezas en la soja del 2B. Hay que fumigar antes del jueves.",
    "output": "Dejé la fumigación del 2B para antes del jueves. El miércoles se lo recuerdo al dueño y le pregunto si ya confirmó al aplicador.",
    "stock": "2B · soja · aplicación antes del jueves",
    "record": "Fumigar antes del jueves",
    "ref": "2B · recordar el miércoles"
  }
]
const examples = {
  'Molino': ['7B', 'Molino sin agua'], 'Tanque': ['7B', 'Nivel del tanque'],
  'Bebedero': ['7B', 'Bebedero revisado'], 'Bebedero roto': ['7B', 'Bebedero roto'],
  'Eléctrico': ['7B', 'Eléctrico cortado'], 'Vaca': ['11B', 'Vaca lastimada'],
  'Ternero': ['11B', 'Tres nacimientos'], 'Vacunación': ['9B', 'Vacunación registrada'],
  'Análisis': ['9B', 'Resultados de brucelosis'], 'Comprobante': ['9B', 'Factura del laboratorio'],
  'Movimiento': ['8B', 'Traslado desde el 7B'], 'Malezas': ['2B', 'Malezas en la soja'],
  'Aplicación': ['2B', 'Fumigar antes del jueves'], 'Lluvia': ['10B', 'Lluvia informada'],
  'Nota': ['6B', 'Una novedad de la recorrida']
}
const colors = { revisar: '#c4442f', registrado: '#6e675c', resuelto: '#2f7d6b' }
const stateNames = { revisar: 'Por revisar', registrado: 'Registrado', resuelto: 'Resuelto' }

function escape(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;'
  })[character])
}

function inside([x, y], polygon) {
  let result = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i]
    const [xj, yj] = polygon[j]
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) result = !result
  }
  return result
}

function bounds(points) {
  return {
    left: Math.min(...points.map(point => point[0])),
    right: Math.max(...points.map(point => point[0])),
    top: Math.min(...points.map(point => point[1])),
    bottom: Math.max(...points.map(point => point[1]))
  }
}

function interior(points) {
  const box = bounds(points)
  let best = points[0]
  let distance = -1
  for (let x = 0; x < 16; x++) {
    for (let y = 0; y < 16; y++) {
      const candidate = [box.left + (box.right - box.left) * (x + .5) / 16, box.top + (box.bottom - box.top) * (y + .5) / 16]
      if (!inside(candidate, points)) continue
      const nearest = Math.min(...points.map((point, index) => {
        const next = points[(index + 1) % points.length]
        const dx = next[0] - point[0], dy = next[1] - point[1]
        const t = Math.max(0, Math.min(1, ((candidate[0] - point[0]) * dx + (candidate[1] - point[1]) * dy) / (dx * dx + dy * dy || 1)))
        return Math.hypot(candidate[0] - point[0] - t * dx, candidate[1] - point[1] - t * dy)
      }))
      if (nearest > distance) {
        distance = nearest
        best = candidate
      }
    }
  }
  return best
}

function fieldPolygons() {
  if (controls.field.value === 'original') return source.polygons
  const columns = controls.field.value === 'denso' ? 6 : 9
  const rows = controls.field.value === 'denso' ? 4 : 1
  const width = 1080 / columns, height = (rows === 1 ? 350 : 980) / rows
  return Array.from({ length: columns * rows }, (_, index) => {
    const left = 40 + (index % columns) * width
    const top = 60 + Math.floor(index / columns) * height
    return {
      name: (index + 1) + 'A',
      points: [[left, top], [left + width, top], [left + width, top + height], [left, top + height]]
    }
  })
}

function overlaps(a, b, gap) {
  return a.left < b.right + gap && a.right + gap > b.left && a.top < b.bottom + gap && a.bottom + gap > b.top
}

function labelFits(point, labelWidth, labelHeight, polygon) {
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].every(([x, y]) =>
    inside([point[0] + x * labelWidth / 2, point[1] + y * labelHeight / 2], polygon)
  )
}

function render() {
  const polygons = fieldPolygons().toSorted((a, b) => parseInt(a.name) - parseInt(b.name))
  const original = controls.field.value === 'original'
  const [potrero, description] = examples[controls.symbol.value]
  const selected = polygons.find(polygon => polygon.name === potrero) ?? polygons[Math.floor(polygons.length / 2)]
  const fieldBox = bounds(polygons.flatMap(polygon => polygon.points))
  const focus = controls.zoom.value === 'detalle'
  const box = focus ? bounds(selected.points) : original ? { left: 0, top: 0, right: source.width, bottom: source.height } : fieldBox
  const padding = focus ? 70 : original ? 0 : 60
  const left = box.left - padding, top = box.top - padding
  const width = box.right - box.left + padding * 2, height = box.bottom - box.top + padding * 2
  const fontSize = width / 28
  const satellite = controls.background.value === 'satelite' && original
  const color = colors[controls.state.value]
  const scale = Number(controls.size.value) / 375 * width
  const names = focus ? polygons.filter(polygon => polygon === selected) : polygons
  const lineColor = satellite ? '#fffaf2' : '#6e675c'
  const lines = polygons.map(polygon => '<polygon points="' + polygon.points.map(point => point.join(',')).join(' ') + '" fill="' + (satellite ? 'none' : '#fffaf2') + '" stroke="' + lineColor + '" stroke-width="' + width / 520 + '"/>').join('')
  const position = interior(selected.points)
  const markerWidth = scale * 1.25
  const occupied = []
  let marker = [position[0], position[1] + fontSize * 1.8]
  const roomForMarker = labelFits(marker, markerWidth, markerWidth, selected.points)
  if (!roomForMarker) {
    const side = position[0] < (fieldBox.left + fieldBox.right) / 2 ? -1 : 1
    marker = [side < 0 ? left + markerWidth * .6 : left + width - markerWidth * .6, position[1]]
  }
  occupied.push({ left: marker[0] - markerWidth / 2, right: marker[0] + markerWidth / 2, top: marker[1] - markerWidth / 2, bottom: marker[1] + markerWidth / 2 })
  const labels = names.map(polygon => {
    const point = interior(polygon.points)
    const labelWidth = polygon.name.length * fontSize * .7
    const labelHeight = fontSize * 1.15
    const shape = bounds(polygon.points)
    const candidates = [point]
    for (let y = 1; y <= 5; y++) {
      for (let x = 1; x <= 5; x++) {
        candidates.push([shape.left + (shape.right - shape.left) * x / 6, shape.top + (shape.bottom - shape.top) * y / 6])
      }
    }
    const boxAt = ([x, y]) => ({ left: x - labelWidth / 2, right: x + labelWidth / 2, top: y - labelHeight / 2, bottom: y + labelHeight / 2 })
    const free = candidate => !occupied.some(box => overlaps(boxAt(candidate), box, fontSize * .35))
    let chosen = candidates.find(candidate => labelFits(candidate, labelWidth, labelHeight, polygon.points) && free(candidate))
    if (!chosen) {
      const gutterX = point[0] < (fieldBox.left + fieldBox.right) / 2 ? left + labelWidth / 2 + fontSize * .2 : left + width - labelWidth / 2 - fontSize * .2
      const gutter = Array.from({ length: 50 }, (_, index) => [gutterX, top + labelHeight + index * labelHeight * 1.5])
      chosen = gutter.filter(free).sort((a, b) => Math.abs(a[1] - point[1]) - Math.abs(b[1] - point[1]))[0] ?? point
    }
    occupied.push(boxAt(chosen))
    const moved = Math.hypot(chosen[0] - point[0], chosen[1] - point[1]) > fontSize
    const connector = moved ? '<path d="M' + point.join(' ') + 'L' + chosen.join(' ') + '" stroke="#33261a" stroke-width="' + width / 400 + '"/><path d="M' + point.join(' ') + 'L' + chosen.join(' ') + '" stroke="' + lineColor + '" stroke-width="' + width / 850 + '"/>' : ''
    return connector + '<text x="' + chosen[0] + '" y="' + chosen[1] + '" text-anchor="middle" dominant-baseline="middle" font-family="Geist,Arial,sans-serif" font-size="' + fontSize + '" font-weight="650" fill="' + (satellite ? '#fffaf2' : '#33261a') + '" stroke="' + (satellite ? '#33261a' : '#fffaf2') + '" stroke-opacity=".8" stroke-width="' + fontSize / 8 + '" paint-order="stroke">' + escape(polygon.name) + '</text>'
  }).join('')
  const iconX = marker[0] - scale / 2, iconY = marker[1] - scale / 2
  const symbol = simbolos[controls.symbol.value].svg.replace('<svg ', '<svg x="' + iconX + '" y="' + iconY + '" ').replace('width="64" height="64"', 'width="' + scale + '" height="' + scale + '"')
  const connector = roomForMarker ? '' : '<path d="M' + position.join(' ') + 'L' + marker.join(' ') + '" stroke="#fffaf2" stroke-width="' + width / 300 + '"/><path d="M' + position.join(' ') + 'L' + marker.join(' ') + '" stroke="' + color + '" stroke-width="' + width / 600 + '"/><circle cx="' + position[0] + '" cy="' + position[1] + '" r="' + width / 140 + '" fill="' + color + '" stroke="#fffaf2" stroke-width="' + width / 600 + '"/>'
  const base = satellite ? '<rect x="' + (iconX - scale * .12) + '" y="' + (iconY - scale * .1) + '" width="' + scale * 1.24 + '" height="' + scale * 1.2 + '" rx="' + scale * .23 + '" fill="#fffaf2" fill-opacity=".96"/>' : ''
  const stateMark = controls.state.value === 'registrado' ? '' : '<circle cx="' + (iconX + scale) + '" cy="' + iconY + '" r="' + scale * .17 + '" fill="' + color + '" stroke="#fffaf2" stroke-width="' + scale * .03 + '"/><path d="' + (controls.state.value === 'resuelto' ? 'M' + (iconX + scale * .91) + ' ' + iconY + 'l' + scale * .06 + ' ' + scale * .06 + ' ' + scale * .12 + ' -' + scale * .13 : 'M' + (iconX + scale) + ' ' + (iconY - scale * .07) + 'v' + scale * .07 + 'm0 ' + scale * .05 + 'v' + scale * .01) + '" fill="none" stroke="#fffaf2" stroke-width="' + scale * .045 + '" stroke-linecap="round"/>'
  const image = satellite ? '<image href="' + photo + '" width="' + source.width + '" height="' + source.height + '" preserveAspectRatio="xMidYMid slice"/>' : ''
  mapElement.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + [left, top, width, height].join(' ') + '" role="img" aria-label="' + escape(description + ', en el potrero ' + selected.name) + '"><title>' + escape(description + ' · ' + selected.name) + '</title><rect x="' + left + '" y="' + top + '" width="' + width + '" height="' + height + '" fill="#f4f1e9"/>' + image + lines + labels + connector + base + symbol + stateMark + '</svg>'
  document.getElementById('field-name').textContent = original ? 'La Porteña' : controls.field.value === 'denso' ? 'Campo dividido' : 'Campo alargado'
  document.getElementById('field-caption').textContent = focus ? 'Potrero ' + selected.name : 'Campo completo · ' + polygons.length + ' potreros'
  document.getElementById('size-value').value = controls.size.value + ' px'
  document.getElementById('notice').innerHTML = '<div class="notice-row"><div class="notice-icon">' + simbolos[controls.symbol.value].svg + '</div><div><strong>' + escape(description) + '</strong><span>' + escape(selected.name) + ' · observación de ejemplo</span><em style="color:' + color + '">' + stateNames[controls.state.value] + '</em></div></div>'
  document.getElementById('stock').innerHTML = (focus ? [selected] : polygons).map((polygon, index) => '<div class="stock-row"><span>' + escape(polygon.name) + '</span><b>' + (original ? stocks[polygon.name] : [0, 12, 37, 8][index % 4]) + ' cab.</b></div>').join('')
  for (const button of document.querySelectorAll('.symbol-button')) button.setAttribute('aria-pressed', String(button.dataset.symbol === controls.symbol.value))
  status.textContent = !original && controls.background.value === 'satelite' ? 'Este campo de prueba tiene un croquis. La foto corresponde a La Porteña.' : ''
}

function showStory(index) {
  const story = stories[index]
  document.getElementById('source-message').innerHTML = '<b>' + escape(story.role + ' · ejemplo de la landing') + '</b>' + escape(story.input)
  document.getElementById('reply-message').innerHTML = '<b>Troppero · propuesta de respuesta</b>' + escape(story.output)
  controls.symbol.value = story.icon
  controls.state.value = index > 1 ? 'revisar' : 'registrado'
  for (const [i, button] of [...document.getElementById('roles').children].entries()) button.setAttribute('aria-pressed', String(i === index))
  render()
}

for (const [name, item] of Object.entries(simbolos)) {
  controls.symbol.add(new Option(name, name))
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'symbol-button'
  button.dataset.symbol = name
  button.title = item.description
  button.innerHTML = item.svg + '<span>' + escape(name) + '</span>'
  button.addEventListener('click', () => {
    controls.symbol.value = name
    render()
  })
  document.getElementById('symbols').append(button)
}
for (const [index, story] of stories.entries()) {
  const button = document.createElement('button')
  button.type = 'button'
  button.textContent = story.role
  button.addEventListener('click', () => showStory(index))
  document.getElementById('roles').append(button)
}
for (const element of Object.values(controls)) element.addEventListener('input', render)

document.getElementById('download').addEventListener('click', async () => {
  const svg = mapElement.firstElementChild.cloneNode(true)
  const image = svg.querySelector('image')
  if (image) {
    try {
      const response = await fetch(photo)
      if (!response.ok) throw Error('No se pudo cargar la foto')
      const blob = await response.blob()
      const dataUri = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result)
        reader.onerror = reject
        reader.readAsDataURL(blob)
      })
      image.setAttribute('href', dataUri)
    } catch {
      status.textContent = 'No pude incluir la fotografía en el archivo. Volvé a intentar.'
      return
    }
  }
  const url = URL.createObjectURL(new Blob([svg.outerHTML], { type: 'image/svg+xml' }))
  const link = document.createElement('a')
  link.href = url
  link.download = 'troppero-mapa-' + controls.field.value + '.svg'
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  status.textContent = 'Vista descargada en SVG.'
})

showStory(2)
