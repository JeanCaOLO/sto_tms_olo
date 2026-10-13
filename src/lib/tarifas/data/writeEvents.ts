// Aviso de "se escribió algo" para quien guarda copias de lo leído (hoy, el caché del catálogo).
// Vive en la capa de datos porque la capa de datos no puede depender de quien la usa.

import type { EntityName } from './schema';

type Listener = (entities: ReadonlySet<EntityName>) => void;

const listeners = new Set<Listener>();

/** Se llama tras cada escritura confirmada; recibe las entidades tocadas. Devuelve cómo darse de baja. */
export function onDataWrite(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function notifyWrite(entities: Iterable<EntityName>): void {
  const touched = new Set(entities);
  if (touched.size === 0) return;
  for (const listener of listeners) listener(touched);
}
