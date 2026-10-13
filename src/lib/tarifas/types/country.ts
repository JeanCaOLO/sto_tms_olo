// Tipos de configuración por país: moneda, zona horaria, redondeo.

export type RoundingMode = 'HALF_UP' | 'HALF_EVEN' | 'UP' | 'DOWN';

export interface Country {
  id: string;
  iso2: string;
  name: string;
  /**
   * MONEDA ÚNICA del país. Todo importe del módulo —lo que dicta una regla, lo que dice un
   * tarifario, lo que cuesta operar, el total y el margen— está escrito en ella.
   *
   * Hubo una segunda moneda "de consolidación" y se eliminó: obligaba a que cada importe declarara
   * en cuál de las dos estaba escrito, y ese campo era invisible en varias pantallas. La peor
   * consecuencia estaba en las reglas ad-hoc de una liquidación, que asumían la de referencia sin
   * decirlo: en Venezuela alguien tecleaba 50 y se cargaban 2.000.
   */
  localCurrency: string; // p.ej. 'CRC'
  roundingDecimals: number;
  roundingMode: RoundingMode;
  /** Horas a partir de las cuales un viaje cuenta como "más de un día". */
  overnightThresholdHours: number;
  /**
   * Si el país admite emitir una liquidación con total negativo. Por defecto NO: un total negativo
   * significa que el transportista le debe plata a la empresa, que casi siempre es un error de
   * carga y no una intención.
   */
  allowNegativeTotal?: boolean;
}
