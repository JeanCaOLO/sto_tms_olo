import type { DistanceMatrices, PlanResult, PlanStop, Stop, VehicleCapacity } from './types.ts';

export const DEFAULT_WINDOW_START_MIN = 8 * 60;
export const DEFAULT_WINDOW_END_MIN = 19 * 60;

function pickNearestUnvisited(current: number, visited: boolean[], durationMin: number[][]): number {
  let best = -1;
  let bestDuration = Infinity;
  for (let i = 0; i < visited.length; i++) {
    if (visited[i]) continue;
    if (durationMin[current][i] < bestDuration) {
      best = i;
      bestDuration = durationMin[current][i];
    }
  }
  return best;
}

function evaluateArrival(stop: Stop, plannedArrivalMin: number) {
  const windowStart = stop.windowStartMin ?? DEFAULT_WINDOW_START_MIN;
  const windowEnd = stop.windowEndMin ?? DEFAULT_WINDOW_END_MIN;
  const arrivalMin = Math.max(plannedArrivalMin, windowStart);
  return { arrivalMin, outsideWindow: arrivalMin > windowEnd };
}

interface PlanState {
  clockMin: number;
  totalDistanceKm: number;
  totalDurationMin: number;
  cumWeightKg: number;
  cumVolumeM3: number;
}

interface StepInput {
  state: PlanState;
  from: number;
  to: number;
  stop: Stop;
  matrices: DistanceMatrices;
  capacity: VehicleCapacity;
}

function advance({ state, from, to, stop, matrices, capacity }: StepInput) {
  state.totalDistanceKm += matrices.distanceKm[from][to];
  state.totalDurationMin += matrices.durationMin[from][to];
  state.clockMin += matrices.durationMin[from][to];

  const { arrivalMin, outsideWindow } = evaluateArrival(stop, state.clockMin);
  state.clockMin = arrivalMin;
  state.cumWeightKg += stop.weightKg;
  state.cumVolumeM3 += stop.volumeM3;
  const overCapacity =
    state.cumWeightKg > capacity.maxWeightKg || state.cumVolumeM3 > capacity.maxVolumeM3;

  const warnings: string[] = [];
  if (outsideWindow) warnings.push(`${stop.id}: llegada fuera de la ventana de entrega`);
  if (overCapacity) warnings.push(`${stop.id}: excede capacidad del vehículo, reasignar a otro viaje`);

  return { planStop: { ...stop, arrivalMin, overCapacity, outsideWindow }, warnings };
}

// ponytail: greedy nearest-neighbor, not a real VRPTW solver. Ceiling: does not
// re-order stops to fit windows, only flags violations. Upgrade path: OR-Tools
// or similar once route volume/complexity justifies it.
export function planRoute(
  stops: Stop[],
  capacity: VehicleCapacity,
  matrices: DistanceMatrices,
): PlanResult {
  const visited = new Array(stops.length).fill(false);
  const order: PlanStop[] = [];
  const warnings: string[] = [];
  const state: PlanState = {
    clockMin: DEFAULT_WINDOW_START_MIN,
    totalDistanceKm: 0,
    totalDurationMin: 0,
    cumWeightKg: 0,
    cumVolumeM3: 0,
  };
  let current = 0;
  visited[0] = true;

  while (order.length < stops.length - 1) {
    const next = pickNearestUnvisited(current, visited, matrices.durationMin);
    visited[next] = true;
    const step = advance({ state, from: current, to: next, stop: stops[next], matrices, capacity });
    order.push(step.planStop);
    warnings.push(...step.warnings);
    current = next;
  }

  return { order, totalDistanceKm: state.totalDistanceKm, totalDurationMin: state.totalDurationMin, warnings };
}
