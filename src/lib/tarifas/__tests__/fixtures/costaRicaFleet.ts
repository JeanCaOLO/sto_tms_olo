// Componentes de mantenimiento de la flota propia de Costa Rica (planilla de costeo de última milla).
// Cada fila: [componente, frecuencia, unidades, { <tipo>: [cada cuánto, costo] }].
// Se usa como referencia de regresión del motor de costos: el total del tipo T3 tiene que dar 48.8118 por km.
// Los costos fijos (conductor, ayudante, depreciación) se dan solo agregados, no por concepto.

export type Frecuencia = 'km' | 'year' | 'month';
export type TipoCamion = 'T1' | 'T3' | 'T5';

export const COMPONENTES_CR: [string, Frecuencia, string, Record<TipoCamion, [number, number]>][] = [
  ['Filtro de Agua', 'km', '1 UND', { T1: [15000, 9040], T3: [15000, 11300], T5: [15000, 15820] }],
  ['Filtro de Aire', 'km', '1 UND', { T1: [15000, 14464], T3: [15000, 18080], T5: [15000, 24860] }],
  ['Filtro de Aceite', 'km', '1 UND', { T1: [5000, 7232], T3: [5000, 9040], T5: [5000, 13560] }],
  ['Lata de Aceite', 'km', '8/11.5 L', { T1: [5000, 28928], T3: [5000, 36160], T5: [5000, 51980] }],
  ['Engrase General', 'km', '1 Serv', { T1: [5000, 7232], T3: [5000, 9040], T5: [5000, 13560] }],
  ['Engrase de Cojinetes', 'km', '2 Ejes', { T1: [20000, 12656], T3: [20000, 15820], T5: [20000, 20340] }],
  ['Engrase de Patas', 'km', '1 Serv', { T1: [10000, 5424], T3: [10000, 6780], T5: [10000, 9040] }],
  ['Engrase Patas/Zapatas 4 Puntas', 'km', '4 Ptos', { T1: [10000, 7232], T3: [10000, 9040], T5: [10000, 11300] }],
  ['MO General (por hora)', 'month', '1 Hora', { T1: [1, 9040], T3: [1, 11300], T5: [1, 13560] }],
  ['MO (por evento)', 'month', '1 UND', { T1: [1, 9040], T3: [1, 11300], T5: [1, 13560] }],
  ['MO Servicio de Frenos', 'km', '2.5/3 H', { T1: [25000, 21696], T3: [25000, 27120], T5: [22000, 36160] }],
  ['Filtro de Diesel', 'km', '1 UND', { T1: [10000, 12656], T3: [10000, 15820], T5: [10000, 20340] }],
  ['Trampa de Diesel', 'km', '1 UND', { T1: [10000, 10848], T3: [10000, 13560], T5: [10000, 18080] }],
  ['Batería', 'year', '2 UND', { T1: [2, 72320], T3: [2, 90400], T5: [2, 113000] }],
  ['Kit Clutch', 'km', '1 Kit', { T1: [70000, 130176], T3: [70000, 162720], T5: [65000, 226000] }],
  ['MO Cambio de Clutch', 'km', '5/6 H', { T1: [70000, 43392], T3: [70000, 54240], T5: [65000, 81360] }],
  ['Aceite diferencial (85W140)', 'km', '4/6 L', { T1: [40000, 16272], T3: [40000, 20340], T5: [40000, 29380] }],
  ['Aceite de Caja (85W190)', 'km', '4/5.5 L', { T1: [40000, 16272], T3: [40000, 20340], T5: [40000, 27120] }],
  ['MO Diferencial y Caja', 'km', '1.5 H', { T1: [40000, 14464], T3: [40000, 18080], T5: [40000, 22600] }],
  ['Mantenimiento Arrancador', 'km', '1 Serv', { T1: [80000, 50624], T3: [80000, 63280], T5: [80000, 85880] }],
  ['Monitoreo Sensores/Computadora', 'km', '1 Escaneo', { T1: [10000, 16272], T3: [10000, 20340], T5: [10000, 24860] }],
  ['Bomba de Agua', 'km', '1 UND', { T1: [120000, 47008], T3: [120000, 58760], T5: [100000, 81360] }],
  ['MO Cambio Balancines/Tensores', 'km', '3/4 H', { T1: [100000, 32544], T3: [100000, 40680], T5: [100000, 54240] }],
  ['Balancines', 'km', '1 Juego', { T1: [100000, 39776], T3: [100000, 49720], T5: [100000, 67800] }],
  ['Tensores', 'km', '1 UND', { T1: [100000, 25312], T3: [100000, 31640], T5: [100000, 42940] }],
  ['Rach', 'km', '2 UND', { T1: [60000, 18080], T3: [60000, 22600], T5: [60000, 33900] }],
  ['Empastado Zapatas 4 Puntas', 'km', '1 Juego', { T1: [50000, 39776], T3: [50000, 49720], T5: [45000, 72320] }],
  ['Juego de Llantas (6 Nuevas)', 'km', '6 UND', { T1: [50000, 325440], T3: [50000, 406800], T5: [45000, 569520] }],
  ['2 Cojinetes de Rueda / UND', 'year', '1 UND', { T1: [4, 10848], T3: [4, 13560], T5: [4, 18080] }],
  ['Válvula Compensadora de Bolsas', 'year', '1 UND', { T1: [5, 10848], T3: [5, 13560], T5: [5, 17176] }],
  ['Bolsas / UND', 'year', '1 UND', { T1: [4, 21696], T3: [4, 27120], T5: [4, 36160] }],
  ['Rampa Hidráulica / UND', 'year', '1 UND', { T1: [8, 144640], T3: [8, 180800], T5: [8, 254250] }],
  ['Shocks / UND', 'year', '1 UND', { T1: [3, 21696], T3: [3, 27120], T5: [3, 36160] }],
  ['King Pin', 'year', '1 UND', { T1: [5, 18080], T3: [5, 22600], T5: [4, 39550] }],
  ['Crucetas / UND', 'year', '1 UND', { T1: [3, 10848], T3: [3, 13560], T5: [3, 20340] }],
  ['Cojinete Cardan c/Base', 'year', '1 UND', { T1: [4, 9944], T3: [4, 12430], T5: [4, 18080] }],
  ['Refuerzo de Resorte / UND', 'year', '1 UND', { T1: [5, 14464], T3: [5, 18080], T5: [5, 27120] }],
  ['Forrado de Madera / UND', 'year', '1 UND', { T1: [6, 28928], T3: [6, 36160], T5: [6, 45200] }],
  ['Piso / UND', 'year', '1 UND', { T1: [8, 43392], T3: [8, 54240], T5: [8, 81360] }],
  ['Persiana / UND', 'year', '1 UND', { T1: [7, 36160], T3: [7, 45200], T5: [7, 58760] }],
];

export const PARAMETROS_CR = { diasOperativos: 30, kmAnual: 36000, precioDiesel: 635, rendimientoKmPorLitro: { T1: 8.5, T3: 6.0, T5: 4.2 } };

/** Costos fijos mensuales en colones. */
export const FIJOS_CR = {
  conductor: 946770.49,
  ayudante: 501222.41,
  depreciacion: { T1: 10000000 / 60, T3: 20000000 / 72, T5: 35000000 / 72 },
};
