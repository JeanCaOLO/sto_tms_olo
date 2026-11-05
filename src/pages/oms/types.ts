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

// Prioridad del OMS: escala numérica 0..n (menor = más urgente), tal cual la
// calcula el motor (DECIDED 2026-10-29). 0 = liberado/inmediato; la cola siempre
// es >= 1. Cofersa usa `dias_hasta_salida`; EPA trae la suya de EFLOW (1 ó 2). Ya
// NO es el modelo viejo de 4 "tiers": el número se muestra tal cual, sin inventar.
// `null` = el pedido aún no fue priorizado por el OMS (no mostrar un número falso).

// Etiqueta legible de una prioridad numérica.
export function priorityLabel(p: number): string {
  return `Prioridad ${p}`;
}

// Variante de Badge del design system por urgencia (menor número = más urgente).
// 0/1 = danger; 2 = warning; 3 = info; 4+ = default. Soporta cualquier n >= 0.
export function priorityBadgeVariant(p: number): 'danger' | 'warning' | 'info' | 'default' {
  if (p <= 1) return 'danger';
  if (p === 2) return 'warning';
  if (p === 3) return 'info';
  return 'default';
}

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
  priority: number | null; // prioridad numérica del OMS (0..n, menor = más urgente). null = aún sin priorizar
  score: number;           // score del motor; solo es válido si `prioritized` (si no, la UI lo muestra como —)
  totalAmount: number;     // Monto Total
  weight: number;          // Peso (kg)
  volume: number;          // Volumen (m³)
  itemCount: number;       // número de artículos del pedido
  observations: string;    // Observaciones (texto libre del vendedor)
  dispatchDate: string;    // Fecha de Entrega (ISO date) — delivery_date
  salidaDate?: string;     // Fecha de SALIDA del viaje (ISO date) — dispatch_date; la que decide la liberación (salida − 1). Opcional: el mock no la trae.
  createdDate: string;     // Fecha de creación (ISO date)
  status: string;          // estado del pedido
  situation: string;       // situación del pedido (p. ej. DISP = disponible)
  // Estado OMS (ADR-013): priorizado = el OMS ya calculó prioridad/score (deja DISP);
  // liberado = el OMS ya lo mandó a eFlow (oms_processed_at sellado, situación GENE).
  // Opcionales: el mock de respaldo no los trae → se tratan como "sin priorizar".
  prioritized?: boolean;
  released?: boolean;
  intakeTime: string;
  appliedRules: { name: string; weight: number }[];
  history: { at: string; from: number | 'sin asignar'; to: number; type: 'automatico' | 'manual'; reason?: string }[];
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
  company: string;       // compañía a la que aplica la regla
  order: number;         // orden de la macro-regla (1..N)
  name: string;
  description: string;   // qué hace (solo lectura)
  weight: number;        // peso/score (editable)
  active: boolean;       // toggle para el rollout por etapas
  firstDelivery: boolean; // parte de la primera entrega
  params: RuleParam[];   // parámetros editables
}

// Compañía seleccionable en el Motor de Reglas.
export interface Company {
  id: string;
  name: string;
}

// FR7 — registro de auditoría de priorización.
export interface AuditEntry {
  id: string;
  timestamp: string;
  orderId: string;
  country: Country;
  changeType: 'automatico' | 'manual';
  tierFrom: number | 'sin asignar';
  tierTo: number;
  scoreFrom: number | null;
  scoreTo: number;
  actor: string;
  detail: string; // regla causante (auto) o motivo (manual)
}

// Bitácora del OMS (sql/49 oms_logs). Cada acción importante del motor deja una
// fila; la pestaña "Logs OMS" (solo developer) la muestra para monitorear errores.
export type OmsLogLevel = 'info' | 'warn' | 'error';

export interface OmsLogEntry {
  id: string;
  createdAt: string;      // created_at (ISO)
  level: OmsLogLevel;
  action: string;         // barrido | priorizar | liberar | procesar_viaje | error…
  corridaId: string | null;
  message: string;
  // Contexto variable (viaje, pedido, país, compañía, totales…) va aquí; la tabla
  // ya no tiene columnas fijas para eso (sql/53). Extensible sin migrar esquema.
  detail: unknown | null; // jsonb
  actor: string;
}

// --- Panel del OMS: dashboard del MOTOR (datos reales de orders + oms_logs) ---
// Reemplaza el panel mock previo (alertas/distribución/overdue). Refleja el flujo
// real de ADR-013: el barrido PRIORIZA la cola y LIBERA a eFlow al abrir la ventana.

// Embudo del día, derivado de public.orders (pedidos abiertos, closed_at IS NULL).
export interface OmsPipeline {
  abiertos: number;      // total de pedidos abiertos en el scope actual
  enCola: number;        // pedidos en la BANDEJA: crudos DISP/DISP aún sin priorizar (los que salen a más de 3 días). Se cuenta desde el endpoint de la bandeja para coincidir 1:1 con esa vista
  priorizados: number;   // ya con prioridad, esperando la ventana de salida (prioritization_run_id, sin oms_processed_at)
  liberadosHoy: number;  // enviados a eFlow hoy (oms_processed_at = hoy)
  // Indicadores de atención (reunión 2026-11-03):
  sinFechaEntrega: number;   // pedidos abiertos sin delivery_date (anomalía: EFLOW siempre debería mandarla)
  sinFechaSalida: number;    // pedidos YA planificados (planning_run_id) pero sin dispatch_date (p. ej. EPA sin coordenadas)
  modificacionesFecha: number; // total de modificaciones de fecha de entrega (suma de delivery_date_changes) sobre los pedidos abiertos
}

// Una fila de "por liberar pronto": pedidos priorizados-no-liberados agrupados por
// fecha de salida del viaje (dispatch_date). La ventana abre dispatch_date − 1.
export interface ProximaLiberacion {
  dispatchDate: string;  // fecha de salida del viaje (YYYY-MM-DD)
  ventanaAbre: string;   // día en que el barrido lo libera (dispatch_date − dias_prep_picking)
  abreHoy: boolean;      // la ventana ya abrió (hoy o antes)
  pedidos: number;
  viajes: number;        // numero_viaje distintos en esa fecha
}

// Una corrida del motor (fila 'barrido' de oms_logs con sus totales de detail).
export interface OmsCorrida {
  id: string;
  createdAt: string;
  corridaId: string | null;
  actor: string;
  level: OmsLogLevel;
  action: string;
  total: number | null;
  priorizados: number | null;
  liberados: number | null;
  pendientes: number | null;
  reconciliados: number | null;
  message: string;
}

// Latido del motor: última corrida, historial corto y errores recientes.
export interface OmsMotorActividad {
  ultima: OmsCorrida | null;
  corridas: OmsCorrida[];
  erroresRecientes: number; // filas level='error' en las últimas 24 h
}

// --- Simulador como CONFIGURADOR de simulaciones (DECIDED 2026-09-15) ---
// PROTOTIPO: entidades mock persistidas en localStorage; sin backend.
// Una SIMULACIÓN es una CONFIGURACIÓN CON NOMBRE que se guarda (reglas + filtro
// de situación + su modo de aplicación). Puede haber varias guardadas por
// compañía pero SOLO UNA activa: la activa es la que se ejecuta. El "preview"
// (correr esa config sobre los pedidos ahora) es efímero; el HISTORIAL de
// ejecuciones se registra aparte.

// Situación de pedido usada como filtro (DISP, GENERADA…).
export type OrderSituation = 'DISP' | 'GENERADA';

export const SITUATION_OPTIONS: OrderSituation[] = ['DISP', 'GENERADA'];

// Modo de aplicación de una simulación. El horario/hora de corte SOLO tiene
// sentido en 'automatico'/'mixto'; en 'manual' el usuario corre y aplica a mano.
export type ApplyMode = 'manual' | 'automatico' | 'mixto';

export const APPLY_MODE_LABEL: Record<ApplyMode, string> = {
  manual: 'Manual',
  automatico: 'Automática',
  mixto: 'Mixta (corte)',
};

// Una simulación guardada: configuración con nombre. Solo una activa por compañía.
export interface Simulation {
  id: string;
  companyId: string;
  name: string;
  ruleIds: string[];              // reglas incluidas en esta simulación
  situations: OrderSituation[];   // filtro de pedidos por situación
  applyMode: ApplyMode;
  cutoffTime: string;             // "HH:mm" — solo aplica en automatico/mixto
  active: boolean;                // la que se ejecuta (una por compañía)
}

// Registro del historial de ejecuciones (una corrida de una simulación).
export interface SimulationExecution {
  id: string;
  companyId: string;
  simulationId: string;
  simulationName: string;         // desnormalizado para el historial
  executedAt: string;             // "YYYY-MM-DD HH:mm"
  trigger: 'manual' | 'automatico';
  affectedCount: number;          // pedidos en el resultado
}
