// Los marcadores de Leaflet son botones enfocables: sin `title` el lector de pantalla solo oye "botón" (o el número de la
// parada). Los íconos dentro de los marcadores son decoración (aria-hidden) y cada mapa es una región con nombre.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const read = (file: string) => readFileSync(resolve(SRC, file), 'utf-8');
const MARKER = /<Marker\b(?:=>|[^>])*>/g;

describe('marcadores de los mapas', () => {
  it.each([
    'pages/tracking/components/map/TruckMarker.tsx',
    'pages/tracking/components/map/FlotaCamiones.tsx',
    'pages/tracking/components/map/RutaViaje.tsx',
    'pages/planificacion/components/TripMapa.tsx',
  ])('%s: cada <Marker> lleva title', (file) => {
    const markers = [...read(file).matchAll(MARKER)].map((m) => m[0]);
    expect(markers.length).toBeGreaterThan(0);
    expect(markers.filter((m) => !/\btitle=/.test(m))).toEqual([]);
  });

  it('los íconos que se dibujan dentro de los marcadores son aria-hidden', () => {
    const iconos = [...read('pages/tracking/components/map/icons.ts').matchAll(/<i class="ri-[^"]*"[^>]*>/g)].map((m) => m[0]);
    expect(iconos.length).toBeGreaterThan(0);
    expect(iconos.filter((i) => !/aria-hidden="true"/.test(i))).toEqual([]);
  });

  it.each([
    'pages/tracking/components/FlotaMapa.tsx',
    'pages/planificacion/components/TripMapa.tsx',
  ])('%s: el contenedor del mapa es una región con nombre', (file) => {
    expect(read(file)).toMatch(/role="region"/);
    expect(read(file)).toMatch(/role="region"[\s\S]{0,200}aria-label=|aria-label=[\s\S]{0,200}role="region"/);
  });
});
