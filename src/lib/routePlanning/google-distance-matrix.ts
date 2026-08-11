import type { Stop } from './types.ts';

// Google caps Distance Matrix requests at 25 origins x 25 destinations (and
// 100 elements per request) — chunk in 10x10 blocks to stay well under both.
const BATCH_SIZE = 10;
const ENDPOINT = 'https://maps.googleapis.com/maps/api/distancematrix/json';

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function coordsParam(stops: Stop[]): string {
  return stops.map((s) => `${s.lat},${s.lng}`).join('|');
}

async function fetchBatch(origins: Stop[], destinations: Stop[], apiKey: string) {
  const url = `${ENDPOINT}?origins=${coordsParam(origins)}&destinations=${coordsParam(
    destinations,
  )}&mode=driving&key=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Distance Matrix API error: ${res.status}`);
  const body = await res.json();
  if (body.status !== 'OK') throw new Error(`Distance Matrix API status: ${body.status}`);
  return body.rows as { elements: { distance: { value: number }; duration: { value: number } }[] }[];
}

export async function fetchDrivingMatrix(stops: Stop[], apiKey: string) {
  const n = stops.length;
  const distanceKm: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  const durationMin: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));

  const originBatches = chunk(stops.map((s, i) => ({ s, i })), BATCH_SIZE);
  const destBatches = chunk(stops.map((s, i) => ({ s, i })), BATCH_SIZE);

  for (const origins of originBatches) {
    for (const destinations of destBatches) {
      const rows = await fetchBatch(
        origins.map((o) => o.s),
        destinations.map((d) => d.s),
        apiKey,
      );
      rows.forEach((row, oi) => {
        row.elements.forEach((el, di) => {
          distanceKm[origins[oi].i][destinations[di].i] = el.distance.value / 1000;
          durationMin[origins[oi].i][destinations[di].i] = el.duration.value / 60;
        });
      });
    }
  }
  return { distanceKm, durationMin };
}
