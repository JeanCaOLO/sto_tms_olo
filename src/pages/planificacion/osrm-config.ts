// Base de OSRM (Open Source Routing Machine) — configurable vía
// VITE_OSRM_URL en .env.local para apuntar a un servidor propio (Docker,
// ver infra/osrm/) en vez del demo público. El demo público
// (router.project-osrm.org) es gratis pero SIN SLA — sin garantía de
// disponibilidad/uptime, rate-limited, puede caerse en cualquier momento.
// Bueno para prototipo, no para producción. Ver docs/work/2026-08/.
export const OSRM_BASE_URL = (import.meta.env.VITE_OSRM_URL || 'https://router.project-osrm.org').replace(/\/$/, '');
