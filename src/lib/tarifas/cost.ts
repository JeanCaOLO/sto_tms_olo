// Motor de costos. Deliberadamente NO es "una regla más" del lenguaje de reglas: el costo no se
// liquida al transportista, se calcula con su propio modelo y solo se usa para derivar el margen.
// Hay un solo modelo: la ESTRUCTURA de costos por filas (la de la compañía, o la del país para la
// flota propia).
//
// MONEDA: hay una sola por país, así que el costo y el total liquidado están siempre en la misma y
// el margen compara moneda contra la misma moneda por construcción.

// Barril que re-exporta todas las exportaciones públicas de sus particiones.
export * from './cost/index';
