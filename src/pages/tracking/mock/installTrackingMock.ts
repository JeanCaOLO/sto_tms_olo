// Modo mock del tracking (solo desarrollo, sin túnel a Aurora): el cliente real (api.ts) habla con un backend
// simulado en memoria. Lo importa `main.tsx` únicamente cuando `MOCK_AUTH_ENABLED` (exige `import.meta.env.DEV`),
// así que no entra a un build desplegado. Solo en este modo se ven la simulación y "Iniciar viaje (pruebas)".
import { setTrackingTransport } from '../api';
import { createFakeTrackingBackend } from './fakeTrackingBackend';
import { rutaPorCalles } from '../route-osrm';
import { setRoadProvider, simNow } from './sim';

setTrackingTransport(createFakeTrackingBackend(), simNow);

// Los camiones simulados siguen las calles (OSRM); si OSRM no responde, van en línea recta. Las peticiones van
// de a una: el servidor público de OSRM admite ~1 por segundo y la simulación pide 2 por viaje al arrancar.
let queue: Promise<unknown> = Promise.resolve();
setRoadProvider((points) => {
  const next = queue.then(() => rutaPorCalles(points));
  queue = next.catch(() => undefined);
  return next;
});
