import { periodoSemana, type SemanaCampo } from '../../../functions/_shared/wa/semanal.ts'
export const demo: SemanaCampo = {
  empresa: 'Campo de ejemplo', periodo: periodoSemana(new Date('2026-10-17T12:00:00Z')),
  lluvia: [{campo:'Don Gilberto',mediciones:2,mm:13},{campo:'La Porteña',mediciones:1,mm:8}],
  recorridas:[{campo:'Don Gilberto',dias:2,observaciones:4,potreros:3},{campo:'La Porteña',dias:3,observaciones:7,potreros:5}],
  observaciones:[
    {fecha:'2026-10-12',campo:'Don Gilberto',potrero:'1A',agua:'normal',pasto:'abundante',electrico:'ok',conteo:null,novedad:'molino revisado'},
    {fecha:'2026-10-13',campo:'La Porteña',potrero:'2B',agua:'llena',pasto:'normal',electrico:null,conteo:null,novedad:null},
    {fecha:'2026-10-14',campo:'La Porteña',potrero:'5B',agua:null,pasto:'escaso',electrico:null,conteo:null,novedad:'revisar aguada'},
    {fecha:'2026-10-16',campo:'La Porteña',potrero:'7B',agua:null,pasto:null,electrico:'cortado',conteo:null,novedad:'alambrado para reparar'},
  ],
  gastos:[{campo:'Don Gilberto',categoria:'Combustible',cantidad:1,total:45000},{campo:'La Porteña',categoria:'Veterinaria',cantidad:1,total:35000}],
  hacienda:[{campo:'Don Gilberto',categoria:'vacas',cabezas:80},{campo:'La Porteña',categoria:'terneros',cabezas:42}],
  vencimientos:[{fecha:'2026-10-20',tipo:'gasto',monto:35000,descripcion:'Veterinario',contraparte:null,categoria:'Veterinaria'}],
}
