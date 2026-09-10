// Tipos del módulo OMS (Order Management System).
// Prototipo visual navegable con datos mock — sin backend, sin Supabase.
// Trazabilidad: requirements.md FR1–FR10 del intent 260826-modulo-oms.

export type Country = 'CR' | 'VE';

export type WeekDay = 'L' | 'M' | 'X' | 'J' | 'V' | 'S' | 'D';

export const WEEK_DAYS: WeekDay[] = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

export const WEEK_DAY_LABELS: Record<WeekDay, string> = {
  L: 'Lunes',
  M: 'Martes',
  X: 'Miércoles',
  J: 'Jueves',
  V: 'Viernes',
  S: 'Sábado',
  D: 'Domingo',
};

// Nivel numérico de prioridad. 1 = más urgente (convención: menor número = más
// prioridad; coherente con "EPA prioridad 1 / cross docking 0" del flujo actual).
// El número exacto de niveles sigue abierto (OQ-1) — el prototipo usa 1..4.
export type PriorityTier = 1 | 2 | 3 | 4;

export const TIER_LEVELS: PriorityTier[] = [1, 2, 3, 4];

export const TIER_LABEL: Record<PriorityTier, string> = {
  1: 'Prioridad 1',
  2: 'Prioridad 2',
  3: 'Prioridad 3',
  4: 'Prioridad 4',
};

// Mapeo tier -> variante de Badge del design system (design-system-mapping.md).
// 1 (más urgente) = danger; escala descendente hasta default.
export const TIER_BADGE: Record<PriorityTier, 'danger' | 'warning' | 'info' | 'default'> = {
  1: 'danger',
  2: 'warning',
  3: 'info',
  4: 'default',
};

export type RouteType = 'Rural' | 'GAM';

// FR1 — Calendario de Rutas y Días de Despacho.
export interface DispatchRoute {
  id: string;          // "Zona #" del CSV
  name: string;        // nombre de la zona
  routeType: RouteType;
  country: Country;
  loadDays: WeekDay[]; // Días de Carga -> checks de la cuadrícula semanal
  deliveryDays: WeekDay[];
  byAppointment: boolean; // 44 REY "Cita previa": sin días fijos
  exceptions: number;
  active: boolean;
}

// FR2/FR3 — pedido en la cola de priorización.
export interface QueueOrder {
  id: string;
  ref: string;             // referencia externa del pedido (WMS/ERP)
  warehouseId: string;     // ID Almacén
  companyId: string;       // ID Compañía
  branchId: string;        // ID Sucursal
  orderType: string;       // Tipo de Orden (p. ej. expedición ERP)
  customer: string;
  route: string;
  country: Country;
  tier: PriorityTier;
  score: number;
  totalAmount: number;     // Monto Total
  weight: number;          // Peso (kg)
  volume: number;          // Volumen (m³)
  itemCount: number;       // número de artículos del pedido
  observations: string;    // Observaciones (texto libre del vendedor)
  dispatchDate: string;    // Fecha de Despacho (ISO date)
  createdDate: string;     // Fecha de creación (ISO date)
  readyToPrepDate: string; // fecha de alisto calculada (ISO date)
  status: string;          // estado del pedido
  situation: string;       // situación del pedido (p. ej. DISP = disponible)
  intakeTime: string;
  appliedRules: { name: string; weight: number }[];
  history: { at: string; from: PriorityTier | 'sin asignar'; to: PriorityTier; type: 'automatico' | 'manual'; reason?: string }[];
}

// FR4 — alerta del Panel OMS.
export type AlertSeverity = 'critica' | 'atencion';

export interface OmsAlert {
  id: string;
  severity: AlertSeverity;
  type: string;
  orderId: string;
  timestamp: string;
}

// FR5 — Motor de Reglas como CATÁLOGO semi-configurable.
// La LÓGICA de cada macro-regla vive en código (Python) y es de solo lectura;
// desde la UI solo se activa/desactiva, se ajusta el peso y sus parámetros.

// Un parámetro editable de una regla (solo dato, nunca lógica).
export interface RuleParam {
  key: string;
  label: string;
  value: string;
  kind: 'text' | 'number' | 'time';
  help?: string;
}

export interface EngineRule {
  id: string;
  order: number;         // orden de la macro-regla (1..5)
  name: string;
  description: string;   // qué hace (solo lectura)
  weight: number;        // peso/score (editable)
  active: boolean;       // toggle para el rollout por etapas
  firstDelivery: boolean; // parte de la primera entrega
  params: RuleParam[];   // parámetros editables
}

// Configuración por compañía (ej.: EPA no prioriza; Cofersa sí).
export interface CompanyConfig {
  id: string;
  name: string;
  prioritizes: boolean;
}

// Tabla de prioridades que define el cliente (números 1..N).
export interface PriorityTableRow {
  level: number;
  label: string;
  description: string;
}

// FR7 — registro de auditoría de priorización.
export interface AuditEntry {
  id: string;
  timestamp: string;
  orderId: string;
  country: Country;
  changeType: 'automatico' | 'manual';
  tierFrom: PriorityTier | 'sin asignar';
  tierTo: PriorityTier;
  scoreFrom: number | null;
  scoreTo: number;
  actor: string;
  detail: string; // regla causante (auto) o motivo (manual)
}
