import type { Pedido, Vehiculo } from './types';

export interface SugerenciaFlota {
  vehiculos: Vehiculo[]; // elegidos, mayor capacidad primero
  pesoPool: number;
  volumenPool: number;
  capacidadPeso: number; // suma de la flota elegida
  capacidadVolumen: number;
  cubre: boolean; // la flota elegida cubre peso y volumen del pool
}

// Elige la MENOR cantidad de vehículos (mayor capacidad de peso primero) cuya
// capacidad combinada cubra el peso y el volumen del pool. Greedy: suficiente
// para las flotas de este negocio (pocos vehículos). Si la flota no alcanza,
// devuelve todos los que tengan capacidad > 0 y `cubre=false`.
// ponytail: greedy por peso; si el volumen fuera el cuello de botella real,
// ordenar por el ratio que aprieta. Hoy el peso manda.
export function sugerirVehiculos(pool: Pedido[], vehiculos: Vehiculo[]): SugerenciaFlota {
  const pesoPool = pool.reduce((s, p) => s + (p.total_weight || 0), 0);
  const volumenPool = pool.reduce((s, p) => s + (p.total_volume || 0), 0);

  const orden = [...vehiculos]
    .filter((v) => v.capacity_weight > 0)
    .sort((a, b) => b.capacity_weight - a.capacity_weight);

  const elegidos: Vehiculo[] = [];
  let capacidadPeso = 0;
  let capacidadVolumen = 0;
  for (const v of orden) {
    if (capacidadPeso >= pesoPool && capacidadVolumen >= volumenPool) break;
    elegidos.push(v);
    capacidadPeso += v.capacity_weight;
    capacidadVolumen += v.capacity_volume;
  }

  return {
    vehiculos: elegidos,
    pesoPool,
    volumenPool,
    capacidadPeso,
    capacidadVolumen,
    cubre: capacidadPeso >= pesoPool && capacidadVolumen >= volumenPool,
  };
}
