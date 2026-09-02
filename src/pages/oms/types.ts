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

// Nivel categórico de prioridad. Nombres ilustrativos hasta homologar (OQ-1);
// solo el orden es normativo. (requirements.md, glosario)
export type PriorityTier = 'critico' | 'alto' | 'medio' | 'bajo';

export const TIER_LABEL: Record<PriorityTier, string> = {
  critico: 'Crítico',
  alto: 'Alto',
  medio: 'Medio',
  bajo: 'Bajo',
};

// Mapeo tier -> variante de Badge del design system (design-system-mapping.md).
export const TIER_BADGE: Record<PriorityTier, 'danger' | 'warning' | 'info' | 'default'> = {
  critico: 'danger',
  alto: 'warning',
  medio: 'info',
  bajo: 'default',
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
  customer: string;
  route: string;
  country: Country;
  tier: PriorityTier;
  score: number;
  readyToPrepDate: string; // ISO date
  status: string;
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

// FR5 — regla del motor.
export type RuleOperator = 'igual' | 'distinto' | 'mayor' | 'menor' | 'mayor-igual' | 'menor-igual' | 'contiene';

export interface PriorityRule {
  id: string;
  name: string;
  field: string;
  operator: RuleOperator;
  value: string;
  weight: number;
  active: boolean;
  profile: string;
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
