// Run: node --experimental-strip-types src/lib/routePlanning/plan-route.selfcheck.ts
import assert from 'node:assert/strict';
import { buildMatrices } from './build-matrices.ts';
import { planRoute } from './plan-route.ts';
import type { Stop } from './types.ts';

// Depot (index 0) + 4 stops around San José, Costa Rica — no real client data.
const stops: Stop[] = [
  { id: 'olo-warehouse', lat: 9.9281, lng: -84.0907, weightKg: 0, volumeM3: 0 },
  { id: 'cliente-a', lat: 9.9333, lng: -84.0833, weightKg: 100, volumeM3: 1 },
  { id: 'cliente-b', lat: 9.9000, lng: -84.1000, weightKg: 100, volumeM3: 1 },
  { id: 'cliente-c', lat: 9.9350, lng: -84.0900, weightKg: 100, volumeM3: 1 },
  { id: 'cliente-d', lat: 9.8000, lng: -83.9000, weightKg: 100, volumeM3: 1, windowStartMin: 8 * 60, windowEndMin: 8 * 60 + 5 },
];

async function main() {
  const matrices = await buildMatrices(stops);
  assert.equal(matrices.usedFallback, true, 'no API key given, must use haversine fallback');

  const roomyCapacity = { maxWeightKg: 10_000, maxVolumeM3: 100 };
  const roomy = planRoute(stops, roomyCapacity, matrices);
  assert.equal(roomy.order.length, stops.length - 1, 'must place every non-depot stop exactly once');
  assert.ok(roomy.totalDistanceKm > 0, 'total distance must be positive');
  const clienteC = roomy.order.find((s) => s.id === 'cliente-c')!;
  assert.equal(clienteC.overCapacity, false, 'well under capacity must not be flagged');

  const tightCapacity = { maxWeightKg: 150, maxVolumeM3: 100 };
  const tight = planRoute(stops, tightCapacity, matrices);
  const overflow = tight.order.filter((s) => s.overCapacity);
  assert.ok(overflow.length > 0, 'exceeding weight capacity must flag at least one stop');
  assert.ok(tight.warnings.some((w) => w.includes('excede capacidad')), 'capacity warning must be present');

  const distantD = roomy.order.find((s) => s.id === 'cliente-d')!;
  assert.equal(distantD.outsideWindow, true, 'a 5-minute window far from the depot must be missed');
  assert.ok(roomy.warnings.some((w) => w.includes('fuera de la ventana')), 'window warning must be present');

  console.log('plan-route self-check: all assertions passed');
}

main();
