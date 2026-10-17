// Modo mock del tracking (solo desarrollo, sin túnel a Aurora): el cliente real (api.ts) habla con un backend
// simulado en memoria. Lo importa `main.tsx` únicamente cuando `MOCK_AUTH_ENABLED` (exige `import.meta.env.DEV`),
// así que no entra a un build desplegado. Solo en este modo se ven la simulación y "Iniciar viaje (pruebas)".
import { setTrackingTransport } from '../api';
import { createFakeTrackingBackend } from './fakeTrackingBackend';
import { simNow } from './sim';

setTrackingTransport(createFakeTrackingBackend(), simNow);
