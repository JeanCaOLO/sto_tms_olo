// Datos MOCK del módulo OMS — prototipo visual navegable, sin backend.
// El calendario de rutas usa los datos reales de `Rutas cofersa - costa rica.csv`
// (Cofersa Costa Rica, 34 zonas), mapeando "Días de Carga" a la cuadrícula semanal.
// L=Lunes M=Martes X=Miércoles J=Jueves V=Viernes S=Sábado D=Domingo.

import type {
  AuditEntry,
  Company,
  DispatchRoute,
  EngineRule,
  OmsAlert,
  QueueOrder,
} from './types';

// FR1 — Calendario real de Cofersa Costa Rica (34 zonas).
// Las zonas GAM del casco despachan "Lunes a Viernes" (L,M,X,J,V) según el CSV
// corregido; 44 REY es "Cita previa" (sin días fijos, byAppointment).
export const cofersaRoutes: DispatchRoute[] = [
  { id: '08', name: 'San Carlos', routeType: 'Rural', country: 'CR', loadDays: ['L', 'X', 'V'], deliveryDays: ['M', 'J', 'S'], byAppointment: false, exceptions: 1, active: true },
  { id: '09', name: 'Limón', routeType: 'Rural', country: 'CR', loadDays: ['L', 'X', 'V'], deliveryDays: ['M', 'J', 'S'], byAppointment: false, exceptions: 0, active: true },
  { id: '29', name: 'Talamanca', routeType: 'Rural', country: 'CR', loadDays: ['J'], deliveryDays: ['V'], byAppointment: false, exceptions: 0, active: true },
  { id: '39', name: 'Sarapiquí', routeType: 'Rural', country: 'CR', loadDays: ['X'], deliveryDays: ['J'], byAppointment: false, exceptions: 0, active: true },
  { id: '10', name: 'Guanacaste Altura', routeType: 'Rural', country: 'CR', loadDays: ['L', 'X'], deliveryDays: ['M', 'J'], byAppointment: false, exceptions: 0, active: true },
  { id: '11', name: 'Guanacaste Bajura', routeType: 'Rural', country: 'CR', loadDays: ['L', 'X'], deliveryDays: ['M', 'J'], byAppointment: false, exceptions: 0, active: true },
  { id: '12', name: 'Zona Sur', routeType: 'Rural', country: 'CR', loadDays: ['L', 'J'], deliveryDays: ['M', 'X', 'V', 'S'], byAppointment: false, exceptions: 0, active: true },
  { id: '13', name: 'Puntarenas', routeType: 'Rural', country: 'CR', loadDays: ['M', 'J'], deliveryDays: ['X', 'V'], byAppointment: false, exceptions: 2, active: true },
  { id: '15', name: 'Turrialba', routeType: 'Rural', country: 'CR', loadDays: ['X'], deliveryDays: ['J'], byAppointment: false, exceptions: 0, active: true },
  { id: '16', name: 'Corralillo', routeType: 'Rural', country: 'CR', loadDays: ['J'], deliveryDays: ['V'], byAppointment: false, exceptions: 0, active: true },
  { id: '18', name: 'Zona Sur', routeType: 'Rural', country: 'CR', loadDays: ['L', 'J'], deliveryDays: ['M', 'X', 'V', 'S'], byAppointment: false, exceptions: 0, active: true },
  { id: '20', name: 'Puriscal', routeType: 'Rural', country: 'CR', loadDays: ['M', 'J'], deliveryDays: ['X', 'V'], byAppointment: false, exceptions: 0, active: true },
  { id: '31', name: 'Upala', routeType: 'Rural', country: 'CR', loadDays: ['J'], deliveryDays: ['V'], byAppointment: false, exceptions: 0, active: true },
  { id: '32', name: 'Puerto Jiménez', routeType: 'Rural', country: 'CR', loadDays: ['L'], deliveryDays: ['M'], byAppointment: false, exceptions: 0, active: true },
  { id: '33', name: 'Cartago Epa', routeType: 'GAM', country: 'CR', loadDays: ['V'], deliveryDays: ['L'], byAppointment: false, exceptions: 0, active: true },
  { id: '34', name: 'Escazú Epa', routeType: 'GAM', country: 'CR', loadDays: ['L'], deliveryDays: ['M'], byAppointment: false, exceptions: 0, active: true },
  { id: '35', name: 'Desamparados Epa', routeType: 'GAM', country: 'CR', loadDays: ['M'], deliveryDays: ['X'], byAppointment: false, exceptions: 0, active: true },
  { id: '36', name: 'Tibás Epa', routeType: 'GAM', country: 'CR', loadDays: ['J'], deliveryDays: ['V'], byAppointment: false, exceptions: 0, active: true },
  { id: '37', name: 'Curridabat Epa', routeType: 'GAM', country: 'CR', loadDays: ['J'], deliveryDays: ['V'], byAppointment: false, exceptions: 0, active: true },
  { id: '38', name: 'Belén Epa', routeType: 'GAM', country: 'CR', loadDays: ['X'], deliveryDays: ['J'], byAppointment: false, exceptions: 0, active: true },
  { id: '01', name: 'Casco', routeType: 'GAM', country: 'CR', loadDays: ['L', 'M', 'X', 'J', 'V'], deliveryDays: [], byAppointment: false, exceptions: 0, active: true },
  { id: '02', name: 'Desamparados', routeType: 'GAM', country: 'CR', loadDays: ['L', 'M', 'X', 'J', 'V'], deliveryDays: [], byAppointment: false, exceptions: 0, active: true },
  { id: '03', name: 'Guadalupe', routeType: 'GAM', country: 'CR', loadDays: ['L', 'M', 'X', 'J', 'V'], deliveryDays: [], byAppointment: false, exceptions: 0, active: true },
  { id: '04', name: 'Alajuela', routeType: 'GAM', country: 'CR', loadDays: ['L', 'M', 'X', 'J', 'V'], deliveryDays: [], byAppointment: false, exceptions: 0, active: true },
  { id: '17', name: 'Grecia', routeType: 'GAM', country: 'CR', loadDays: ['L', 'M', 'X', 'J', 'V'], deliveryDays: [], byAppointment: false, exceptions: 0, active: true },
  { id: '05', name: 'Heredia', routeType: 'GAM', country: 'CR', loadDays: ['L', 'M', 'X', 'J', 'V'], deliveryDays: [], byAppointment: false, exceptions: 0, active: true },
  { id: '06', name: 'Cartago', routeType: 'GAM', country: 'CR', loadDays: ['L', 'M', 'X', 'J', 'V'], deliveryDays: [], byAppointment: false, exceptions: 0, active: true },
  { id: '07', name: 'Carretera', routeType: 'GAM', country: 'CR', loadDays: ['L', 'M', 'X', 'J', 'V'], deliveryDays: [], byAppointment: false, exceptions: 0, active: true },
  { id: '21', name: 'Casco', routeType: 'GAM', country: 'CR', loadDays: ['L', 'M', 'X', 'J', 'V'], deliveryDays: [], byAppointment: false, exceptions: 0, active: true },
  { id: '22', name: 'Desampa', routeType: 'GAM', country: 'CR', loadDays: ['L', 'M', 'X', 'J', 'V'], deliveryDays: [], byAppointment: false, exceptions: 0, active: false },
  { id: '23', name: 'Guadalupe', routeType: 'GAM', country: 'CR', loadDays: ['L', 'M', 'X', 'J', 'V'], deliveryDays: [], byAppointment: false, exceptions: 0, active: true },
  { id: '25', name: 'Heredia', routeType: 'GAM', country: 'CR', loadDays: ['L', 'M', 'X', 'J', 'V'], deliveryDays: [], byAppointment: false, exceptions: 0, active: true },
  { id: '26', name: 'Cartago', routeType: 'GAM', country: 'CR', loadDays: ['L', 'M', 'X', 'J', 'V'], deliveryDays: [], byAppointment: false, exceptions: 0, active: true },
  { id: '44', name: 'REY', routeType: 'GAM', country: 'CR', loadDays: [], deliveryDays: [], byAppointment: true, exceptions: 0, active: true },
];

// FR2/FR3 — cola de priorización (mock). tier numérico: 1 = más urgente.
export const queueOrders: QueueOrder[] = [
  {
    id: 'PED-10432', ref: 'ERP-CF-88213', warehouseId: '0001', companyId: '0109', branchId: '0001', orderType: 'Expedición ERP',
    customer: 'Ferretería Central', route: '34 Escazú', country: 'CR', tier: 1, score: 920,
    totalAmount: 1_240_500, weight: 320.5, volume: 2.4, itemCount: 24, observations: 'Entregar en oficina, urgente',
    dispatchDate: '2026-08-29', createdDate: '2026-08-27', status: 'DISP', situation: 'DISP', intakeTime: '08:41',
    appliedRules: [{ name: 'Fecha de entrega vencida', weight: 600 }, { name: 'Cliente — quiebre de stock', weight: 320 }],
    history: [{ at: '2026-08-28 08:41', from: 'sin asignar', to: 1, type: 'automatico' }],
  },
  {
    id: 'PED-10440', ref: 'ERP-CF-88240', warehouseId: '0001', companyId: '0109', branchId: '0001', orderType: 'Expedición ERP',
    customer: 'Distribuidora Pacífico', route: '13 Puntarenas', country: 'CR', tier: 2, score: 610,
    totalAmount: 486_200, weight: 95.0, volume: 0.9, itemCount: 8, observations: '—',
    dispatchDate: '2026-08-30', createdDate: '2026-08-28', status: 'DISP', situation: 'DISP', intakeTime: '09:05',
    appliedRules: [{ name: 'Día de ruta próximo', weight: 610 }],
    history: [{ at: '2026-08-28 09:05', from: 'sin asignar', to: 2, type: 'automatico' }],
  },
  {
    id: 'PED-10455', ref: 'ERP-CF-88255', warehouseId: '0001', companyId: '0109', branchId: '0001', orderType: 'Expedición ERP',
    customer: 'Ferretería San Carlos', route: '08 San Carlos', country: 'CR', tier: 3, score: 300,
    totalAmount: 712_800, weight: 210.0, volume: 1.6, itemCount: 15, observations: 'Cliente retira',
    dispatchDate: '2026-08-31', createdDate: '2026-08-28', status: 'DISP', situation: 'DISP', intakeTime: '09:22',
    appliedRules: [{ name: 'Día de ruta a 2 días', weight: 300 }],
    history: [{ at: '2026-08-28 09:22', from: 'sin asignar', to: 3, type: 'automatico' }],
  },
  {
    id: 'PED-10461', ref: 'ERP-CF-88261', warehouseId: '0001', companyId: '0109', branchId: '0001', orderType: 'Expedición ERP',
    customer: 'Ferretería San Carlos', route: '08 San Carlos', country: 'CR', tier: 1, score: 950,
    totalAmount: 158_000, weight: 42.3, volume: 0.3, itemCount: 3, observations: 'Viaje extra pagado por el cliente',
    dispatchDate: '2026-08-28', createdDate: '2026-08-26', status: 'DISP', situation: 'DISP', intakeTime: '07:58',
    appliedRules: [{ name: 'Fecha de entrega vencida', weight: 600 }, { name: 'Override manual', weight: 350 }],
    history: [
      { at: '2026-08-28 07:58', from: 'sin asignar', to: 2, type: 'automatico' },
      { at: '2026-08-28 10:12', from: 2, to: 1, type: 'manual', reason: 'Viaje extra pagado por el cliente' },
    ],
  },
  {
    id: 'PED-10470', ref: 'ERP-CF-88270', warehouseId: '0001', companyId: '0109', branchId: '0001', orderType: 'Expedición ERP',
    customer: 'Comercial Zona Sur', route: '12 Zona Sur', country: 'CR', tier: 4, score: 0,
    totalAmount: 2_050_900, weight: 540.0, volume: 4.1, itemCount: 41, observations: '—',
    dispatchDate: '2026-09-03', createdDate: '2026-08-28', status: 'DISP', situation: 'DISP', intakeTime: '10:30',
    appliedRules: [],
    history: [{ at: '2026-08-28 10:30', from: 'sin asignar', to: 4, type: 'automatico' }],
  },
  {
    id: 'PED-10471', ref: 'ERP-CF-88271', warehouseId: '0001', companyId: '0109', branchId: '0001', orderType: 'Expedición ERP',
    customer: 'Ferretería Limón', route: '09 Limón', country: 'CR', tier: 2, score: 640,
    totalAmount: 890_400, weight: 178.5, volume: 1.2, itemCount: 12, observations: 'Entregar antes de mediodía',
    dispatchDate: '2026-08-30', createdDate: '2026-08-28', status: 'DISP', situation: 'DISP', intakeTime: '08:12',
    appliedRules: [{ name: 'Día de ruta próximo', weight: 640 }],
    history: [{ at: '2026-08-28 08:12', from: 'sin asignar', to: 2, type: 'automatico' }],
  },
  {
    id: 'PED-10472', ref: 'ERP-CF-88272', warehouseId: '0001', companyId: '0109', branchId: '0001', orderType: 'Expedición ERP',
    customer: 'Depósito Guanacaste', route: '10 Guanacaste Altura', country: 'CR', tier: 3, score: 340,
    totalAmount: 1_320_000, weight: 410.0, volume: 3.0, itemCount: 28, observations: '—',
    dispatchDate: '2026-08-31', createdDate: '2026-08-28', status: 'DISP', situation: 'DISP', intakeTime: '08:20',
    appliedRules: [{ name: 'Día de ruta a 2 días', weight: 340 }],
    history: [{ at: '2026-08-28 08:20', from: 'sin asignar', to: 3, type: 'automatico' }],
  },
  {
    id: 'PED-10473', ref: 'ERP-CF-88273', warehouseId: '0001', companyId: '0109', branchId: '0001', orderType: 'Expedición ERP',
    customer: 'Ferretería Turrialba', route: '15 Turrialba', country: 'CR', tier: 1, score: 900,
    totalAmount: 245_600, weight: 62.0, volume: 0.5, itemCount: 5, observations: 'Cliente retira',
    dispatchDate: '2026-08-29', createdDate: '2026-08-27', status: 'DISP', situation: 'DISP', intakeTime: '08:33',
    appliedRules: [{ name: 'Cliente retira', weight: 900 }],
    history: [{ at: '2026-08-28 08:33', from: 'sin asignar', to: 1, type: 'automatico' }],
  },
  {
    id: 'PED-10474', ref: 'ERP-CF-88274', warehouseId: '0001', companyId: '0109', branchId: '0001', orderType: 'Expedición ERP',
    customer: 'Comercial Puriscal', route: '20 Puriscal', country: 'CR', tier: 2, score: 600,
    totalAmount: 512_300, weight: 130.0, volume: 1.0, itemCount: 9, observations: '—',
    dispatchDate: '2026-08-30', createdDate: '2026-08-28', status: 'DISP', situation: 'DISP', intakeTime: '08:47',
    appliedRules: [{ name: 'Día de ruta próximo', weight: 600 }],
    history: [{ at: '2026-08-28 08:47', from: 'sin asignar', to: 2, type: 'automatico' }],
  },
  {
    id: 'PED-10475', ref: 'ERP-CF-88275', warehouseId: '0001', companyId: '0109', branchId: '0001', orderType: 'Expedición ERP',
    customer: 'Distribuidora Bajura', route: '11 Guanacaste Bajura', country: 'CR', tier: 3, score: 320,
    totalAmount: 1_780_000, weight: 495.0, volume: 3.7, itemCount: 33, observations: 'Enviar a bodega nueva',
    dispatchDate: '2026-08-31', createdDate: '2026-08-28', status: 'DISP', situation: 'DISP', intakeTime: '09:01',
    appliedRules: [{ name: 'Día de ruta a 2 días', weight: 320 }],
    history: [{ at: '2026-08-28 09:01', from: 'sin asignar', to: 3, type: 'automatico' }],
  },
  {
    id: 'PED-10476', ref: 'ERP-CF-88276', warehouseId: '0001', companyId: '0109', branchId: '0001', orderType: 'Expedición ERP',
    customer: 'Ferretería Talamanca', route: '29 Talamanca', country: 'CR', tier: 1, score: 930,
    totalAmount: 168_900, weight: 38.0, volume: 0.4, itemCount: 4, observations: 'Urgente — reposición',
    dispatchDate: '2026-08-29', createdDate: '2026-08-27', status: 'DISP', situation: 'DISP', intakeTime: '09:14',
    appliedRules: [{ name: 'Fecha de entrega vencida', weight: 600 }, { name: 'Quiebre de stock', weight: 330 }],
    history: [{ at: '2026-08-28 09:14', from: 'sin asignar', to: 1, type: 'automatico' }],
  },
  {
    id: 'PED-10477', ref: 'ERP-CF-88277', warehouseId: '0001', companyId: '0109', branchId: '0001', orderType: 'Expedición ERP',
    customer: 'Comercial Sarapiquí', route: '39 Sarapiquí', country: 'CR', tier: 3, score: 300,
    totalAmount: 720_000, weight: 205.0, volume: 1.5, itemCount: 14, observations: '—',
    dispatchDate: '2026-08-31', createdDate: '2026-08-28', status: 'DISP', situation: 'DISP', intakeTime: '09:28',
    appliedRules: [{ name: 'Día de ruta a 2 días', weight: 300 }],
    history: [{ at: '2026-08-28 09:28', from: 'sin asignar', to: 3, type: 'automatico' }],
  },
  {
    id: 'PED-10478', ref: 'ERP-CF-88278', warehouseId: '0001', companyId: '0109', branchId: '0001', orderType: 'Expedición ERP',
    customer: 'Ferretería Corralillo', route: '16 Corralillo', country: 'CR', tier: 2, score: 620,
    totalAmount: 398_000, weight: 88.0, volume: 0.8, itemCount: 7, observations: 'Entregar mañana',
    dispatchDate: '2026-08-30', createdDate: '2026-08-28', status: 'DISP', situation: 'DISP', intakeTime: '09:40',
    appliedRules: [{ name: 'Día de ruta próximo', weight: 620 }],
    history: [{ at: '2026-08-28 09:40', from: 'sin asignar', to: 2, type: 'automatico' }],
  },
  {
    id: 'PED-10479', ref: 'ERP-CF-88279', warehouseId: '0001', companyId: '0109', branchId: '0001', orderType: 'Expedición ERP',
    customer: 'Depósito Upala', route: '31 Upala', country: 'CR', tier: 4, score: 40,
    totalAmount: 2_410_500, weight: 610.0, volume: 4.8, itemCount: 47, observations: '—',
    dispatchDate: '2026-09-04', createdDate: '2026-08-28', status: 'DISP', situation: 'DISP', intakeTime: '09:52',
    appliedRules: [{ name: 'Día de ruta lejano', weight: 40 }],
    history: [{ at: '2026-08-28 09:52', from: 'sin asignar', to: 4, type: 'automatico' }],
  },
  {
    id: 'PED-10480', ref: 'ERP-CF-88280', warehouseId: '0001', companyId: '0109', branchId: '0001', orderType: 'Expedición ERP',
    customer: 'Ferretería Osa', route: '32 Puerto Jiménez', country: 'CR', tier: 1, score: 910,
    totalAmount: 320_000, weight: 71.0, volume: 0.6, itemCount: 6, observations: 'Cliente retira 48h',
    dispatchDate: '2026-08-29', createdDate: '2026-08-27', status: 'DISP', situation: 'DISP', intakeTime: '10:05',
    appliedRules: [{ name: 'Cliente retira', weight: 910 }],
    history: [{ at: '2026-08-28 10:05', from: 'sin asignar', to: 1, type: 'automatico' }],
  },
  {
    id: 'PED-10481', ref: 'ERP-CF-88281', warehouseId: '0001', companyId: '0109', branchId: '0001', orderType: 'Expedición ERP',
    customer: 'EPA Cartago', route: '33 Cartago Epa', country: 'CR', tier: 2, score: 660,
    totalAmount: 1_050_000, weight: 260.0, volume: 2.0, itemCount: 19, observations: '—',
    dispatchDate: '2026-08-30', createdDate: '2026-08-28', status: 'DISP', situation: 'DISP', intakeTime: '10:18',
    appliedRules: [{ name: 'Día de ruta próximo', weight: 660 }],
    history: [{ at: '2026-08-28 10:18', from: 'sin asignar', to: 2, type: 'automatico' }],
  },
  {
    id: 'PED-10482', ref: 'ERP-CF-88282', warehouseId: '0001', companyId: '0109', branchId: '0001', orderType: 'Expedición ERP',
    customer: 'EPA Belén', route: '38 Belén Epa', country: 'CR', tier: 3, score: 310,
    totalAmount: 640_800, weight: 152.0, volume: 1.1, itemCount: 11, observations: 'Revisar dirección en observación',
    dispatchDate: '2026-08-31', createdDate: '2026-08-28', status: 'DISP', situation: 'DISP', intakeTime: '10:31',
    appliedRules: [{ name: 'Día de ruta a 2 días', weight: 310 }],
    history: [{ at: '2026-08-28 10:31', from: 'sin asignar', to: 3, type: 'automatico' }],
  },
  {
    id: 'PED-10483', ref: 'ERP-CF-88283', warehouseId: '0001', companyId: '0109', branchId: '0001', orderType: 'Expedición ERP',
    customer: 'Ferretería Casco', route: '01 Casco', country: 'CR', tier: 2, score: 630,
    totalAmount: 455_000, weight: 102.0, volume: 0.9, itemCount: 8, observations: '—',
    dispatchDate: '2026-08-30', createdDate: '2026-08-28', status: 'DISP', situation: 'DISP', intakeTime: '10:44',
    appliedRules: [{ name: 'Día de ruta próximo', weight: 630 }],
    history: [{ at: '2026-08-28 10:44', from: 'sin asignar', to: 2, type: 'automatico' }],
  },
  {
    id: 'PED-10484', ref: 'ERP-CF-88284', warehouseId: '0001', companyId: '0109', branchId: '0001', orderType: 'Expedición ERP',
    customer: 'Depósito Heredia', route: '05 Heredia', country: 'CR', tier: 4, score: 30,
    totalAmount: 1_990_000, weight: 520.0, volume: 4.0, itemCount: 38, observations: '—',
    dispatchDate: '2026-09-04', createdDate: '2026-08-28', status: 'DISP', situation: 'DISP', intakeTime: '10:57',
    appliedRules: [{ name: 'Día de ruta lejano', weight: 30 }],
    history: [{ at: '2026-08-28 10:57', from: 'sin asignar', to: 4, type: 'automatico' }],
  },
  {
    id: 'PED-10485', ref: 'ERP-CF-88285', warehouseId: '0001', companyId: '0109', branchId: '0001', orderType: 'Expedición ERP',
    customer: 'El Rey Distribución', route: '44 REY', country: 'CR', tier: 1, score: 940,
    totalAmount: 275_000, weight: 55.0, volume: 0.5, itemCount: 5, observations: 'Cita previa — coordinar hora',
    dispatchDate: '2026-08-29', createdDate: '2026-08-27', status: 'DISP', situation: 'DISP', intakeTime: '11:10',
    appliedRules: [{ name: 'Cliente retira', weight: 940 }],
    history: [{ at: '2026-08-28 11:10', from: 'sin asignar', to: 1, type: 'automatico' }],
  },
];

// FR4 — alertas activas del Panel (incluye tipos derivados de FR8 y FR9.6).
export const omsAlerts: OmsAlert[] = [
  { id: 'AL-1', severity: 'critica', type: 'Pedido vencido', orderId: 'PED-10432', timestamp: '2026-08-28 09:12' },
  { id: 'AL-2', severity: 'critica', type: 'Referencia WMS inválida', orderId: 'PED-10461', timestamp: '2026-08-28 09:10' },
  { id: 'AL-3', severity: 'atencion', type: 'Sincronización al lago fallida', orderId: 'PED-10458', timestamp: '2026-08-28 09:03' },
  { id: 'AL-4', severity: 'atencion', type: 'País no identificado', orderId: 'PED-10462', timestamp: '2026-08-28 09:01' },
];

// Compañías seleccionables en el Motor de Reglas.
export const companies: Company[] = [
  { id: '0109', name: 'Cofersa' },
  { id: 'EPA', name: 'EPA' },
];

// FR5 — catálogo de macro-reglas del OMS, asociadas por compañía.
// `active` refleja el ESTADO REAL DEL CÓDIGO (src/pages/oms/engine/priorityEngine.ts),
// no la aspiración de negocio: una regla en `false` todavía NO tiene lógica
// detrás, sin importar cuánto se documentó en las reuniones. Mantener
// sincronizado con priorityEngine.ts cada vez que se implemente/cambie una
// regla ahí — este catálogo es lo único que un no-desarrollador puede leer
// para saber "qué de esto ya es real".
//
// Hoy están activas exactamente 2 reglas (primera entrega, reunión Antonio
// 2026-09-08), y priorityEngine.ts las aplica IGUAL para Cofersa y EPA (el
// código no distingue compañía todavía) - por eso ambas compañías las listan.
// Catálogo alineado al motor REAL del backend (ADR-013). La lógica vive en
// Python (backend/oms/src/: regla_fecha.py, score.py, handoff_pedidos.py) y es
// de solo lectura; este catálogo solo documenta y expone parámetros. La
// prioridad es NUMÉRICA INVERTIDA (menor = más urgente; base 100, mínima 1) vía
// score ponderado (score.py), NO tiers 1..4. ADR-013 DESACOPLA priorizar (deja
// DISP) de liberar a eFlow (escribe GENE en la ventana dispatch_date − dias_prep_picking).
export const engineRules: EngineRule[] = [
  // --- Cofersa ---
  {
    id: 'MR-CF-1', company: '0109', order: 1, name: 'Regla de fecha de entrega', firstDelivery: true, active: true, weight: 600,
    description: 'Calcula la urgencia desde la fecha en que el pedido debe estar listo = fecha de entrega (delivery_date) − lead_time_days. lead_time_days lo envía Planificación por pedido (default 1 si viene NULL). Si la fecha planificada es la centinela 1900-01-01 (cliente sin fecha real, p. ej. Cofersa por default) se trata como URGENTE para que un humano lo revise. Implementada en backend/oms/src/regla_fecha.py + score.py.',
    params: [
      { key: 'lead_time_default', label: 'lead_time_days por defecto (si viene NULL)', value: '1', kind: 'number' },
      { key: 'fecha_centinela', label: 'Fecha centinela (fallback urgente)', value: '1900-01-01', kind: 'text', help: 'Si la fecha planificada == centinela, no es fecha real → urgente.' },
    ],
  },
  {
    id: 'MR-CF-6', company: '0109', order: 2, name: 'Liberación a eFlow por ventana (ADR-013)', firstDelivery: true, active: true, weight: 0,
    description: 'DESACOPLADA de la priorización: priorizar deja el pedido en DISP; la liberación cambia la situación a GENE (vía la costura a sim_expedicionescabecera) solo cuando hoy ≥ dispatch_date − dias_prep_picking. Es POR VIAJE "gratis" (todos los pedidos de un numero_viaje comparten dispatch_date). Casos sin dispatch_date: cliente-retira se libera de inmediato (alta prioridad, el cliente recoge); los demás (p. ej. sin coordenadas) caen a delivery_date como ancla de la ventana. El barrido corre 5×/día. La acción manual "Procesar a Eflow" (gated por rol) libera un viaje ignorando la ventana. Implementada en backend/oms/src/handoff_pedidos.py (en_ventana_liberacion / liberar_pedido).',
    params: [
      { key: 'dias_prep_picking', label: 'Días de preparación de picking (ventana)', value: '1', kind: 'number', help: 'Política del OMS: cuántos días antes del despacho se libera a eFlow.' },
      { key: 'barrido_veces_dia', label: 'Barridos por día (v1)', value: '5', kind: 'number' },
    ],
  },
  {
    id: 'MR-CF-3', company: '0109', order: 3, name: 'Cliente retira (por zona)', firstDelivery: true, active: true, weight: 900,
    description: 'Los pedidos cuya zona de entrega es "cliente retira" reciben la prioridad más alta, sin importar la fecha. Se modela por ZONA (delivery_zone), NO por el texto libre de observaciones. El análisis de observaciones con IA está diferido (ver MR-CF-2).',
    params: [
      { key: 'zona_cliente_retira', label: 'Zona(s) de cliente retira', value: 'cliente_retira', kind: 'text', help: 'Valor de delivery_zone que marca retiro en bodega.' },
      { key: 'prioridad_retira', label: 'Prioridad asignada', value: '1', kind: 'number' },
    ],
  },
  {
    id: 'MR-CF-2', company: '0109', order: 4, name: 'Análisis de observaciones con IA (DIFERIDO)', firstDelivery: false, active: false, weight: 0,
    description: 'Interpretar el texto libre de observaciones (dirección, fecha solicitada, urgencia, cita) con un modelo de Amazon Bedrock. DIFERIDO (decisión D11): cliente-retira se resuelve hoy por zona (MR-CF-3). Hoy solo existe un stub determinístico de palabras clave en backend/oms/src/analizador_observaciones.py, NO activo en el flujo.',
    params: [
      { key: 'modelo', label: 'Modelo Bedrock (futuro)', value: 'por definir', kind: 'text' },
    ],
  },
  {
    id: 'MR-CF-4', company: '0109', order: 5, name: 'Asignación de viaje / bajada', firstDelivery: false, active: false, weight: 0,
    description: 'El viaje lo asigna PLANIFICACIÓN, no el OMS. El OMS solo lee numero_viaje/dispatch_date ya denormalizados en orders. NO hay lógica de asignación de viaje/bajada en el OMS.',
    params: [],
  },
  {
    id: 'MR-CF-5', company: '0109', order: 6, name: 'Inventario / capacidad (backorder) — FUTURO', firstDelivery: false, active: false, weight: 0,
    description: 'Validar viabilidad de inventario/capacidad antes de liberar (reservas, pendientes, reposición). FUTURO: unidad U2 (backorder-inventario-oms) diferida hasta que el negocio defina OQ-BO1/BO2/BO3.',
    params: [],
  },
  // --- EPA: mismo motor por scope (país→almacén→cliente); el cross docking
  // (prioridad fija, sin regla de fecha) sigue sin codificarse. ---
  {
    id: 'MR-EPA-1', company: 'EPA', order: 1, name: 'Regla de fecha de entrega', firstDelivery: true, active: true, weight: 600,
    description: 'Misma lógica que Cofersa (el motor no distingue compañía todavía; la especificidad se resolverá por scope) — ver MR-CF-1.',
    params: [
      { key: 'lead_time_default', label: 'lead_time_days por defecto (si viene NULL)', value: '1', kind: 'number' },
      { key: 'fecha_centinela', label: 'Fecha centinela (fallback urgente)', value: '1900-01-01', kind: 'text' },
    ],
  },
  {
    id: 'MR-EPA-2', company: 'EPA', order: 2, name: 'Cliente retira (por zona)', firstDelivery: true, active: true, weight: 900,
    description: 'Misma lógica que Cofersa — ver MR-CF-3 (por zona, no por observaciones).',
    params: [
      { key: 'zona_cliente_retira', label: 'Zona(s) de cliente retira', value: 'cliente_retira', kind: 'text' },
      { key: 'prioridad_retira', label: 'Prioridad asignada', value: '1', kind: 'number' },
    ],
  },
  {
    id: 'MR-EPA-3', company: 'EPA', order: 3, name: 'Cross docking (prioridad fija, sin regla de fecha)', firstDelivery: false, active: false, weight: 500,
    description: 'EPA recibe y alista al mismo tiempo (cross docking): saldría con prioridad fija, SIN pasar por la regla de fecha. NO implementada — hoy EPA pasa por MR-EPA-1 igual que Cofersa. Activarla implica excluir a EPA de la regla de fecha en código.',
    params: [
      { key: 'prioridad_default', label: 'Prioridad por default (propuesta)', value: '1', kind: 'number' },
    ],
  },
  {
    id: 'MR-EPA-5', company: 'EPA', order: 4, name: 'Liberación a eFlow por ventana (ADR-013)', firstDelivery: true, active: true, weight: 0,
    description: 'Igual que Cofersa — ver MR-CF-6 (liberación por dispatch_date − dias_prep_picking, por viaje, barrido 5×/día + acción manual).',
    params: [
      { key: 'dias_prep_picking', label: 'Días de preparación de picking (ventana)', value: '1', kind: 'number' },
      { key: 'barrido_veces_dia', label: 'Barridos por día (v1)', value: '5', kind: 'number' },
    ],
  },
];

// FR7 — auditoría (mock).
export const auditEntries: AuditEntry[] = [
  { id: 'A-1', timestamp: '2026-08-28 09:12', orderId: 'PED-10432', country: 'CR', changeType: 'automatico', tierFrom: 'sin asignar', tierTo: 1, scoreFrom: null, scoreTo: 920, actor: 'sistema', detail: 'Regla: Fecha de entrega vencida' },
  { id: 'A-2', timestamp: '2026-08-28 10:12', orderId: 'PED-10461', country: 'CR', changeType: 'manual', tierFrom: 2, tierTo: 1, scoreFrom: 600, scoreTo: 950, actor: 'jperez', detail: 'Viaje extra pagado por el cliente' },
  { id: 'A-3', timestamp: '2026-08-28 09:05', orderId: 'PED-10440', country: 'CR', changeType: 'automatico', tierFrom: 'sin asignar', tierTo: 2, scoreFrom: null, scoreTo: 610, actor: 'sistema', detail: 'Regla: Día de ruta próximo' },
];

// KPIs del Panel derivados de los mocks (FR4.1).
export function computeKpis() {
  const pendientes = queueOrders.filter((o) => o.status === 'Pendiente').length;
  const vencidos = queueOrders.filter((o) => o.dispatchDate < '2026-08-29').length;
  const overrides = auditEntries.filter((a) => a.changeType === 'manual').length;
  const total = auditEntries.length || 1;
  const overridePct = Math.round((overrides / total) * 100);
  const sinRuta = queueOrders.filter((o) => o.appliedRules.length === 0 && o.tier === 4).length;
  return { pendientes, vencidos, overridePct, sinRuta };
}
