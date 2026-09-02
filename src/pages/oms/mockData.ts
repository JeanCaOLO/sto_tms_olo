// Datos MOCK del módulo OMS — prototipo visual navegable, sin backend.
// El calendario de rutas usa los datos reales de `Rutas cofersa - costa rica.csv`
// (Cofersa Costa Rica, 34 zonas), mapeando "Días de Carga" a la cuadrícula semanal.
// L=Lunes M=Martes X=Miércoles J=Jueves V=Viernes S=Sábado D=Domingo.

import type {
  AuditEntry,
  DispatchRoute,
  OmsAlert,
  PriorityRule,
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

// FR2/FR3 — cola de priorización (mock).
export const queueOrders: QueueOrder[] = [
  {
    id: 'PED-10432', customer: 'EPA', route: '34 Escazú Epa', country: 'CR', tier: 'critico', score: 920,
    readyToPrepDate: '2026-08-28', status: 'Pendiente', intakeTime: '08:41',
    appliedRules: [{ name: 'Fecha de despacho vencida', weight: 600 }, { name: 'Cliente EPA — quiebre de stock', weight: 320 }],
    history: [{ at: '2026-08-28 08:41', from: 'sin asignar', to: 'critico', type: 'automatico' }],
  },
  {
    id: 'PED-10440', customer: 'Cofersa', route: '13 Puntarenas', country: 'CR', tier: 'alto', score: 610,
    readyToPrepDate: '2026-08-29', status: 'Pendiente', intakeTime: '09:05',
    appliedRules: [{ name: 'Día de ruta próximo', weight: 610 }],
    history: [{ at: '2026-08-28 09:05', from: 'sin asignar', to: 'alto', type: 'automatico' }],
  },
  {
    id: 'PED-10455', customer: 'EPA', route: '34 Escazú Epa', country: 'CR', tier: 'medio', score: 300,
    readyToPrepDate: '2026-08-30', status: 'Pendiente', intakeTime: '09:22',
    appliedRules: [{ name: 'Día de ruta a 2 días', weight: 300 }],
    history: [{ at: '2026-08-28 09:22', from: 'sin asignar', to: 'medio', type: 'automatico' }],
  },
  {
    id: 'PED-10461', customer: 'Cofersa', route: '08 San Carlos', country: 'CR', tier: 'critico', score: 950,
    readyToPrepDate: '2026-08-27', status: 'Referencia WMS inválida', intakeTime: '07:58',
    appliedRules: [{ name: 'Fecha de despacho vencida', weight: 600 }, { name: 'Override manual', weight: 350 }],
    history: [
      { at: '2026-08-28 07:58', from: 'sin asignar', to: 'alto', type: 'automatico' },
      { at: '2026-08-28 10:12', from: 'alto', to: 'critico', type: 'manual', reason: 'Viaje extra pagado por el cliente' },
    ],
  },
  {
    id: 'PED-10470', customer: 'Mayoreo', route: '12 Zona Sur', country: 'CR', tier: 'bajo', score: 0,
    readyToPrepDate: '2026-09-02', status: 'Pendiente', intakeTime: '10:30',
    appliedRules: [],
    history: [{ at: '2026-08-28 10:30', from: 'sin asignar', to: 'bajo', type: 'automatico' }],
  },
];

// FR4 — alertas activas del Panel (incluye tipos derivados de FR8 y FR9.6).
export const omsAlerts: OmsAlert[] = [
  { id: 'AL-1', severity: 'critica', type: 'Pedido vencido', orderId: 'PED-10432', timestamp: '2026-08-28 09:12' },
  { id: 'AL-2', severity: 'critica', type: 'Referencia WMS inválida', orderId: 'PED-10461', timestamp: '2026-08-28 09:10' },
  { id: 'AL-3', severity: 'atencion', type: 'Sincronización al lago fallida', orderId: 'PED-10458', timestamp: '2026-08-28 09:03' },
  { id: 'AL-4', severity: 'atencion', type: 'País no identificado', orderId: 'PED-10462', timestamp: '2026-08-28 09:01' },
];

// FR5 — reglas del motor (mock).
export const priorityRules: PriorityRule[] = [
  { id: 'R-1', name: 'Fecha de despacho vencida', field: 'ready_to_prep_date', operator: 'menor-igual', value: 'hoy', weight: 600, active: true, profile: 'Base CR' },
  { id: 'R-2', name: 'Cliente EPA — quiebre de stock', field: 'flag_quiebre_stock', operator: 'igual', value: 'true', weight: 320, active: true, profile: 'Perfil EPA' },
  { id: 'R-3', name: 'Día de ruta próximo (≤1 día)', field: 'dias_a_salida', operator: 'menor-igual', value: '1', weight: 300, active: true, profile: 'Base CR' },
  { id: 'R-4', name: 'Cofersa — hora de ingreso temprana', field: 'hora_ingreso', operator: 'menor', value: '10:00', weight: 120, active: false, profile: 'Perfil Cofersa' },
];

export const ruleProfiles = ['Base CR', 'Perfil EPA', 'Perfil Cofersa'];

// FR7 — auditoría (mock).
export const auditEntries: AuditEntry[] = [
  { id: 'A-1', timestamp: '2026-08-28 09:12', orderId: 'PED-10432', country: 'CR', changeType: 'automatico', tierFrom: 'sin asignar', tierTo: 'critico', scoreFrom: null, scoreTo: 920, actor: 'sistema', detail: 'Regla: Fecha de despacho vencida' },
  { id: 'A-2', timestamp: '2026-08-28 10:12', orderId: 'PED-10461', country: 'CR', changeType: 'manual', tierFrom: 'alto', tierTo: 'critico', scoreFrom: 600, scoreTo: 950, actor: 'jperez', detail: 'Viaje extra pagado por el cliente' },
  { id: 'A-3', timestamp: '2026-08-28 09:05', orderId: 'PED-10440', country: 'CR', changeType: 'automatico', tierFrom: 'sin asignar', tierTo: 'alto', scoreFrom: null, scoreTo: 610, actor: 'sistema', detail: 'Regla: Día de ruta próximo' },
];

// KPIs del Panel derivados de los mocks (FR4.1).
export function computeKpis() {
  const pendientes = queueOrders.filter((o) => o.status === 'Pendiente').length;
  const vencidos = queueOrders.filter((o) => o.readyToPrepDate < '2026-08-28').length;
  const overrides = auditEntries.filter((a) => a.changeType === 'manual').length;
  const total = auditEntries.length || 1;
  const overridePct = Math.round((overrides / total) * 100);
  const sinRuta = queueOrders.filter((o) => o.appliedRules.length === 0 && o.tier === 'bajo').length;
  return { pendientes, vencidos, overridePct, sinRuta };
}
