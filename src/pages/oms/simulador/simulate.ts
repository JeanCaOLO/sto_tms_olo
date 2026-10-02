import type { EngineRule, OrderSituation, QueueOrder } from '../types';

// Config de UNA corrida: el subconjunto de una Simulation que afecta el cálculo.
export interface RunConfig {
  ruleIds: string[];
  situations: OrderSituation[];
}

// Lógica pura del Simulador (PROTOTIPO). Sin React, sin backend: reordena una
// cola mock aplicando SOLO las reglas elegidas para la corrida. El "score" real
// lo calcula el motor en Construcción (Lambdas); aquí es una heurística mock que
// suma los pesos de las reglas activas de la corrida al score base del pedido.
//
// Prioridades NUMÉRICAS (menor número = mayor prioridad), coherente con el
// DECIDED del proyecto. El tier del pedido se conserva; lo que cambia es el
// score/orden simulado, que es lo que ilustra el reordenamiento.

export interface SimulatedOrder extends QueueOrder {
  baseScore: number;   // score original antes de la corrida
  simScore: number;    // score tras aplicar las reglas elegidas
  moved: boolean;      // cambió de posición respecto al orden base
}

// Filtra los pedidos por situación y recalcula el orden con las reglas elegidas.
export function runSimulation(
  orders: QueueOrder[],
  rules: EngineRule[],
  config: RunConfig,
): SimulatedOrder[] {
  const situations = new Set<OrderSituation>(config.situations);
  const chosen = rules.filter((r) => config.ruleIds.includes(r.id));
  const weightBoost = chosen.reduce((sum, r) => sum + r.weight, 0);

  // Orden base (por score original desc) para detectar quién se movió.
  const base = orders
    .filter((o) => situations.has(o.situation as OrderSituation))
    .slice()
    .sort((a, b) => b.score - a.score);
  const basePos = new Map(base.map((o, i) => [o.id, i]));

  // ponytail: heurística mock — reparte el boost de reglas de forma
  // determinista por índice, suficiente para ver el reordenamiento en el proto.
  // El cálculo real de score vive en el motor (Lambdas), fuera de este mock.
  const simulated = base.map((o, i) => {
    const simScore = o.score + Math.round((weightBoost * (base.length - i)) / (base.length || 1));
    return { ...o, baseScore: o.score, simScore, score: simScore };
  });
  simulated.sort((a, b) => b.simScore - a.simScore);

  return simulated.map((o, newPos) => ({ ...o, moved: basePos.get(o.id) !== newPos }));
}
