// Barrel que re-exporta desde los módulos de la carpeta localRules/.
//
// Borde entre los componentes de `pages/reglas-tarifa/` y la capa de datos (`data/`).
//
// Formas de fila snake_case, con relaciones anidadas donde las había, para las pantallas. Todo por
// `db()`, el driver activo (Aurora vía HTTP en producción, JSON en tests). Ver `data/index.ts`.
//
// Desde 2026-10-02 (ROADMAP §8) países y zonas son del catálogo del TMS: acá se LEEN y no se
// editan. Lo que el tarifador edita es su configuración: grupos de zona, configuración de cálculo
// por país, reglas, plantillas, costos y política de margen.

export { listCountries, saveCountrySettings } from './localRules/countries';

export { listZoneGroups, saveZoneGroup, deleteZoneGroup, listZones, zoneUsage } from './localRules/zones';

export { listRules, saveRule, deleteRule } from './localRules/rules';

export { listTemplates, saveTemplate, deleteTemplate } from './localRules/templates';

export { listSimulatedCarriers } from './localRules/carriers';

export { listMarginPolicies, saveMarginPolicy } from './localRules/margins';

export { listRulesAndZonesForTesting } from './localRules/testing';
