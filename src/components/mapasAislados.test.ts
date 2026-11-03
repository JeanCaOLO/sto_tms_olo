// Leaflet pinta sus paneles y controles con z-index de 400 a 1000. Sin un contexto de apilamiento propio (`isolate`) en
// el contenedor del mapa, esos paneles pueden quedar por encima del encabezado fijo, el menú y los modales de la app.
// FlotaMapa ya lo tenía; este test exige lo mismo a todos los mapas.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const read = (relative: string) => readFileSync(resolve(SRC, relative), 'utf-8');

const MAPAS = [
  'pages/tracking/components/FlotaMapa.tsx',
  'pages/planificacion/components/TripMapa.tsx',
  'pages/zonas/components/ZoneMap.tsx',
];

describe('mapas aislados del resto de la pantalla', () => {
  it.each(MAPAS)('%s aísla su contenedor con la clase isolate', (file) => {
    expect(read(file)).toMatch(/className=\{?[`"'][^`"']*\bisolate\b/);
  });

  it('el contenedor de ZoneMap conserva la altura que le pasa quien lo usa', () => {
    expect(read('pages/zonas/components/ZoneMap.tsx')).toMatch(/isolate \$\{className\}/);
  });
});
