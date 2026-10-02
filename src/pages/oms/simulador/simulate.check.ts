// Self-check runnable de la lógica pura del Simulador (sin framework).
// Correr: npx tsx src/pages/oms/simulador/simulate.check.ts
// Falla (throw) si el filtro por situación o el reordenamiento se rompen.
import { runSimulation, type SimulatedOrder } from './simulate';
import type { EngineRule, QueueOrder } from '../types';

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`CHECK FALLÓ: ${msg}`);
}

// Pedido mock mínimo: solo importan id, score y situation para esta lógica.
const order = (id: string, score: number, situation: 'DISP' | 'GENERADA'): QueueOrder =>
  ({ id, score, situation } as unknown as QueueOrder);

const rule = (id: string, weight: number): EngineRule =>
  ({ id, weight } as unknown as EngineRule);

const orders = [
  order('A', 100, 'DISP'),
  order('B', 300, 'DISP'),
  order('C', 200, 'GENERADA'),
];
const rules = [rule('R1', 90), rule('R2', 10)];

// 1) Filtro por situación: solo DISP → C (GENERADA) queda fuera.
const onlyDisp = runSimulation(orders, rules, { ruleIds: ['R1', 'R2'], situations: ['DISP'] });
assert(onlyDisp.length === 2, 'el filtro de situación DISP debe dejar 2 pedidos');
assert(!onlyDisp.some((o) => o.id === 'C'), 'C (GENERADA) no debe aparecer con filtro DISP');

// 2) Ambas situaciones → los 3 pedidos.
const both = runSimulation(orders, rules, { ruleIds: ['R1'], situations: ['DISP', 'GENERADA'] });
assert(both.length === 3, 'con DISP+GENERADA deben aparecer los 3');

// 3) Resultado ordenado por simScore descendente (invariante de la tabla).
const ordered = both.every((o, i, arr) => i === 0 || arr[i - 1].simScore >= o.simScore);
assert(ordered, 'el resultado debe quedar ordenado por simScore desc');

// 4) Sin reglas elegidas: boost 0 → simScore == score base, nadie se mueve.
const noRules = runSimulation(orders, rules, { ruleIds: [], situations: ['DISP', 'GENERADA'] });
assert(noRules.every((o: SimulatedOrder) => o.simScore === o.baseScore), 'sin reglas, simScore = baseScore');
assert(noRules.every((o: SimulatedOrder) => !o.moved), 'sin reglas, nadie cambia de posición');

console.log('OK — simulate.check: filtro por situación, orden y boost verificados');
