import { expect,it } from 'vitest'
import { preguntaIdentificador,preguntaLugar } from './evaluacion'
it.each(['Busqué la caravana 48 y figura en el 9B.','¿La encontraste en el 9B o en otro potrero?'])(
  'no confunde una búsqueda o pregunta de lugar con pedir de nuevo la identidad: %s',texto=>expect(preguntaIdentificador(texto)).toBe(false))
it.each(['¿Qué número tiene la caravana?','¿Cuál es la caravana de la vaca?','¿Qué caravana tenía?'])(
  'detecta que vuelve a pedir el identificador: %s',texto=>expect(preguntaIdentificador(texto)).toBe(true))

it.each(['¿Cuál foto querés, la del 8B o la del 9B?','¿Qué potrero querés ver?'])(
  'acepta una aclaración con el nombre o con las opciones verificadas: %s',texto=>expect(preguntaLugar(texto,['8B','9B'])).toBe(true))
it.each(['No tengo el potrero.','¿Todo bien?'])(
  'no confunde un acuse o saludo con pedir el lugar: %s',texto=>expect(preguntaLugar(texto,['8B','9B'])).toBe(false))
