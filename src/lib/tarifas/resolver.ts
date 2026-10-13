// ¿QUÉ reglas aplican? Deriva las variables del contexto, filtra las reglas cuya condición se
// cumple, resuelve el alcance (país + compañía) y decide el stacking — salvo MAX, que necesita
// saber "cuánto" para decidir "cuál" y por eso viaja entero hasta `runChargePipeline`, donde los
// montos reales ya existen.
//
// El orden de salida es TOTAL y determinista (etapa, prioridad, alcance, código): dos reglas
// empatadas ya no se aplican en el orden en que las devolvió la base.

// Barril que re-exporta todas las exportaciones públicas de sus particiones.
export * from './resolver/index';
