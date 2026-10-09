// Plantillas base y estructura de las hojas de carga de costos.
// Módulo PURO: solo estructura de datos sin lógica de negocio.

export type SheetCell = string | number | boolean | null | undefined;
export type SheetMatrix = SheetCell[][];

export const SHEET_VARIABLES = 'Variables';
export const SHEET_FIXED = 'Fijos';
export const SHEET_PARAMS = 'Parámetros';

export const SHEET_HEADERS_VARIABLES = ['componente', 'tipo_camion', 'frecuencia', 'cantidad_frecuencia', 'costo', 'unidad_componente'];
export const SHEET_HEADERS_FIXED = ['concepto', 'monto_mensual', 'aplica_a', 'tipo_camion', 'valor_vehiculo', 'vida_meses'];
export const SHEET_HEADERS_PARAMS = ['clave', 'valor', 'descripcion'];

/** Las hojas de la plantilla con ejemplos genéricos (no son datos de ningún país). */
export function costTemplateSheets(): Record<string, SheetMatrix> {
  return {
    Instrucciones: [
      ['Plantilla de estructura de costos'],
      [''],
      ['1. Llene las hojas Variables, Fijos y Parámetros. Borre las filas de ejemplo.'],
      ['2. Variables: componentes que se repiten. "frecuencia" es km (cada N km), year (cada N años) o month (cada N meses).'],
      ['   El costo por km se calcula solo: km = costo ÷ N · year = costo ÷ (N × km por año) · month = costo ÷ (N × km por año ÷ 12).'],
      ['3. Fijos: importes mensuales. "aplica_a" es conductor, ayudante, depreciacion u otros. Para la depreciación puede dar valor_vehiculo y vida_meses en vez del monto.'],
      ['4. tipo_camion: deje vacío si la fila aplica a todos los camiones; si no, escriba el tipo tal como está en el catálogo de vehículos.'],
      ['5. Parámetros: dias_operativos, km_anual, precio_combustible y rendimiento_km_litro:<tipo de camión>.'],
      ['6. Los importes van sin símbolo de moneda; use un solo formato de números en todo el archivo.'],
    ],
    [SHEET_VARIABLES]: [
      SHEET_HEADERS_VARIABLES,
      ['Filtro de aceite', 'Camión mediano', 'km', 5000, 9040, '1 UND'],
      ['Batería', 'Camión mediano', 'year', 2, 90400, '2 UND'],
    ],
    [SHEET_FIXED]: [
      SHEET_HEADERS_FIXED,
      ['Salario del conductor', 500000, 'conductor', '', '', ''],
      ['Salario del ayudante', 300000, 'ayudante', '', '', ''],
      ['Depreciación', '', 'depreciacion', 'Camión mediano', 20000000, 72],
    ],
    [SHEET_PARAMS]: [
      SHEET_HEADERS_PARAMS,
      ['dias_operativos', 30, 'Días operativos por mes: divisor de los costos mensuales'],
      ['km_anual', 36000, 'Kilómetros que recorre un camión al año'],
      ['precio_combustible', 635, 'Precio del litro'],
      ['rendimiento_km_litro:Camión mediano', 6, 'Kilómetros por litro de ese camión'],
    ],
  };
}

export const FREQUENCY_ALIASES: Record<string, 'km' | 'year' | 'month'> = {
  km: 'km', kilometro: 'km', kilometros: 'km',
  year: 'year', anio: 'year', ano: 'year', anual: 'year', anos: 'year', anios: 'year',
  month: 'month', mes: 'month', mensual: 'month', meses: 'month',
};

export const GROUP_ALIASES: Record<string, 'conductor' | 'ayudante' | 'depreciacion' | 'otros'> = {
  conductor: 'conductor', chofer: 'conductor',
  ayudante: 'ayudante',
  depreciacion: 'depreciacion', leasing: 'depreciacion',
  otros: 'otros', otro: 'otros',
};
