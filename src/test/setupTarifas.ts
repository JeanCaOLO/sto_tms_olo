// Las pruebas del tarifador nunca hablan con el backend: cada una arranca con un almacén en memoria
// limpio, cargado con la semilla de `__tests__/fixtures/seed.json`. En la app no existe este camino.

import { beforeEach } from 'vitest';
import { setDataSource } from '../lib/tarifas/data';
import seedJson from '../lib/tarifas/__tests__/fixtures/seed.json';
import { MemoryDataSource } from '../lib/tarifas/data/memory/driver';
import { invalidateCatalogCache } from '../lib/tarifas/catalogLoader';
import { resetToSeed, setSeed } from '../lib/tarifas/data/memory/store';

setSeed(seedJson);

// También al cargar el archivo de prueba, para los `beforeAll` que leen datos antes del primer `beforeEach`.
setDataSource(new MemoryDataSource());

beforeEach(() => {
  resetToSeed();
  invalidateCatalogCache();
  setDataSource(new MemoryDataSource());
});
