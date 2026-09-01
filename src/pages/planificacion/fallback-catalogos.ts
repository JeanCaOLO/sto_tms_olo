import type { Conductor, Transportista, Vehiculo } from './types';

// ponytail: vehicles / carriers / drivers return 0 rows in mock mode (no real
// authenticated session + org filter). Before 2026-08-31 the "Configurar ruta"
// dropdowns were simply empty. These fallbacks are a curated snapshot of the
// real eflow QA transport catalog (`EFLOW_WMH.transportation_companies /
// trasportation_units / drivers` on 10.17.224.224 — ver memoria
// `eflow-qa-db-rutas-choferes`).
//
// Real: carrier names, plates, brands, driver names, driver cédulas.
// Synthesized: capacities — every QA unit had weight/volume capacity = 0, so
// values here are sane guesses by truck size (KIA BONGO / small ~2500kg,
// TOYOTA DYNA / ISUZU NPR ~4500kg, FREIGHTLINER / NISSAN UD ~8000kg).
// Ids are deterministic `eflow-<kind>-<eflow_id>`.
//
// Remove (or replace with the real fetch) once Supabase auth/RLS + org data
// are wired — same pattern as fallback-rutas.ts.

export const FALLBACK_TRANSPORTISTAS: Transportista[] = [
  { id: 'eflow-car-3', name: 'Transosa de Alajuela S.A.' },
  { id: 'eflow-car-8', name: 'Inversiones Acuña y Salazar del Caribe S.R.L.' },
  { id: 'eflow-car-9', name: 'Edison Miguel Ureña Ureña' },
  { id: 'eflow-car-16', name: 'Pedro Hernández Castro' },
  { id: 'eflow-car-7', name: 'Javier Martín Ulloa Serrano' },
  { id: 'eflow-car-4', name: 'Luis Carlos Martín Mora Castillo' },
  { id: 'eflow-car-37', name: 'María Jiménez Ramírez' },
  { id: 'eflow-car-29', name: 'OLO' },
  { id: 'eflow-car-38', name: 'Transmajori' },
];

export const FALLBACK_VEHICULOS: Vehiculo[] = [
  { id: 'eflow-veh-2', plate: 'CL188786', brand: 'Toyota', model: 'Dyna', vehicle_type: 'Camión liviano', capacity_weight: 4500, capacity_volume: 20 },
  { id: 'eflow-veh-3', plate: 'C162414', brand: 'Freightliner', model: 'M2', vehicle_type: 'Camión pesado', capacity_weight: 8000, capacity_volume: 32 },
  { id: 'eflow-veh-4', plate: 'CL244242', brand: 'Hyundai', model: 'HD65', vehicle_type: 'Camión liviano', capacity_weight: 3500, capacity_volume: 16 },
  { id: 'eflow-veh-6', plate: 'CL300011', brand: 'KIA', model: 'Bongo', vehicle_type: 'Camión pequeño', capacity_weight: 2500, capacity_volume: 12 },
  { id: 'eflow-veh-7', plate: 'CL345361', brand: 'Isuzu', model: 'QRL', vehicle_type: 'Camión liviano', capacity_weight: 4500, capacity_volume: 20 },
  { id: 'eflow-veh-8', plate: 'CL186068', brand: 'Toyota', model: 'Dyna', vehicle_type: 'Camión liviano', capacity_weight: 4500, capacity_volume: 20 },
  { id: 'eflow-veh-9', plate: 'CL272155', brand: 'Isuzu', model: 'QKR', vehicle_type: 'Camión pequeño', capacity_weight: 2800, capacity_volume: 13 },
  { id: 'eflow-veh-12', plate: 'CL190087', brand: 'Isuzu', model: 'NPR', vehicle_type: 'Camión liviano', capacity_weight: 5000, capacity_volume: 22 },
  { id: 'eflow-veh-14', plate: 'C132239', brand: 'Nissan', model: 'UD', vehicle_type: 'Camión pesado', capacity_weight: 8000, capacity_volume: 32 },
  { id: 'eflow-veh-21', plate: 'C177642', brand: 'JAC', model: 'N-Series', vehicle_type: 'Camión liviano', capacity_weight: 4200, capacity_volume: 19 },
  { id: 'eflow-veh-23', plate: 'C162179', brand: 'Mitsubishi', model: 'Canter', vehicle_type: 'Camión liviano', capacity_weight: 4000, capacity_volume: 18 },
  { id: 'eflow-veh-24', plate: 'CL228091', brand: 'KIA', model: 'Bongo', vehicle_type: 'Camión pequeño', capacity_weight: 2500, capacity_volume: 12 },
];

export const FALLBACK_CONDUCTORES: Conductor[] = [
  { id: 'eflow-drv-4', full_name: 'Luis Diego Solórzano Gómez', document: '204300699', carrier_id: 'eflow-car-3' },
  { id: 'eflow-drv-5', full_name: 'Gerardo Alonso Durán Alfaro', document: '205400666', carrier_id: 'eflow-car-3' },
  { id: 'eflow-drv-6', full_name: 'Diego Ricardo Solórzano Sánchez', document: '206590907', carrier_id: 'eflow-car-3' },
  { id: 'eflow-drv-7', full_name: 'Víctor Manuel Vega Chaves', document: '601730907', carrier_id: 'eflow-car-3' },
  { id: 'eflow-drv-8', full_name: 'Heber Fernando Mena Mena', document: '108960212', carrier_id: 'eflow-car-3' },
  { id: 'eflow-drv-9', full_name: 'Luis Gerardo Vallejos Castro', document: '603930431', carrier_id: 'eflow-car-3' },
  { id: 'eflow-drv-12', full_name: 'David José Vargas Borbón', document: '116350274', carrier_id: 'eflow-car-16' },
  { id: 'eflow-drv-11', full_name: 'Merwin Rafael Ortega Rangel', document: '186201041419', carrier_id: 'eflow-car-16' },
  { id: 'eflow-drv-22', full_name: 'Edison Miguel Ureña Ureña', document: '114090799', carrier_id: 'eflow-car-9' },
  { id: 'eflow-drv-24', full_name: 'Francisco Arguedas Morales', document: '111790453', carrier_id: 'eflow-car-9' },
  { id: 'eflow-drv-23', full_name: 'Jonathan Jesús Álvarez Torres', document: '111000137', carrier_id: 'eflow-car-9' },
  { id: 'eflow-drv-31', full_name: 'Javier Martín Ulloa Serrano', document: '106380244', carrier_id: 'eflow-car-7' },
  { id: 'eflow-drv-14', full_name: 'Luis Carlos Mora Castillo', document: '106510512', carrier_id: 'eflow-car-4' },
  { id: 'eflow-drv-21', full_name: 'Randal Acuña Jiménez', document: '205680638', carrier_id: 'eflow-car-8' },
  { id: 'eflow-drv-20', full_name: 'Yeiner Enrique González Fernández', document: '702060910', carrier_id: 'eflow-car-8' },
  { id: 'eflow-drv-30', full_name: 'Federico José Ulloa Umaña', document: '116080706', carrier_id: 'eflow-car-37' },
  { id: 'eflow-drv-34', full_name: 'Robier Alonso Colomer Olivas', document: '701180253', carrier_id: 'eflow-car-29' },
  { id: 'eflow-drv-69', full_name: 'Gerardo Stanley Sánchez', document: '206440829', carrier_id: 'eflow-car-38' },
];
