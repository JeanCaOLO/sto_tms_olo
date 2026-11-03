// Los datos de ejemplo de Planificación (pedidos, rutas, vehículos, conductores) solo sirven para
// trabajar sin backend. Fuera de desarrollo un fallo de la API debe verse como error: mostrar
// pedidos o conductores inventados como si fueran reales es peor que no mostrar nada.
// Función (no constante) para que los tests puedan alternar `DEV` con `vi.stubEnv`.
export function mockFallbackEnabled(): boolean {
  return import.meta.env.DEV === true;
}
