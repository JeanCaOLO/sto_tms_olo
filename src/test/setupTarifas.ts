// Las pruebas del tarifador nunca hablan con el backend: cada una arranca con un almacén en memoria
// limpio, cargado con la semilla de `__tests__/fixtures/seed.json`. En la app no existe este camino.

import { beforeEach } from 'vitest';
import { setDataSource } from '../lib/tarifas/data';
import { MemoryDataSource } from '../lib/tarifas/__tests__/helpers/memory/driver';
import { resetToSeed } from '../lib/tarifas/__tests__/helpers/memory/store';

// También al cargar el archivo de prueba, para los `beforeAll` que leen datos antes del primer `beforeEach`.
setDataSource(new MemoryDataSource());

beforeEach(() => {
  resetToSeed();
  setDataSource(new MemoryDataSource());
});
