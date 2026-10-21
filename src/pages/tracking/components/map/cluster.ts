// Agrupación de camiones en el mapa (clustering), pura y sin dependencias: los íconos que en pantalla quedarían
// a menos de `radius` px se juntan en una burbuja con el número. Con la flota separada no agrupa nada.

export interface ScreenPoint {
  id: string;
  x: number;
  y: number;
}

export interface Cluster {
  ids: string[];
  x: number;
  y: number;
}

/** Agrupa en orden (codicioso): cada punto entra al primer grupo cuyo centro está a ≤ radius px. */
export function clusterPoints(points: ScreenPoint[], radius: number): Cluster[] {
  const clusters: Cluster[] = [];
  const r2 = radius * radius;
  for (const p of points) {
    const hit = clusters.find((c) => (c.x - p.x) ** 2 + (c.y - p.y) ** 2 <= r2);
    if (!hit) {
      clusters.push({ ids: [p.id], x: p.x, y: p.y });
      continue;
    }
    // El centro se mueve al promedio, así la burbuja queda en medio del grupo.
    const n = hit.ids.length;
    hit.x = (hit.x * n + p.x) / (n + 1);
    hit.y = (hit.y * n + p.y) / (n + 1);
    hit.ids.push(p.id);
  }
  return clusters;
}
