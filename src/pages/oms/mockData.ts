// Datos de ejemplo para el prototipo del OMS — sin conexión a Supabase todavía.
// Ver PLAN_MODULO_OMS.md para el modelo de datos real propuesto (§6.2).

export type PriorityTier = 'alta' | 'media' | 'baja';

export interface OmsOrder {
  id: string;
  order_number: string;
  customer_name: string;
  store_name: string;
  delivery_date: string;
  total_weight: number;
  total_volume: number;
  total_amount: number;
  priority_tier: PriorityTier;
  priority_score: number;
  matched_rules: string[];
  sla_at_risk: boolean;
  overridden: boolean;
  override_reason?: string;
  override_by?: string;
}

export const mockQueueOrders: OmsOrder[] = [
  {
    id: '1',
    order_number: 'PED-2026-0142',
    customer_name: 'Super Mercado La Económica',
    store_name: 'San Diego (VE)',
    delivery_date: '2026-08-19',
    total_weight: 320,
    total_volume: 4.1,
    total_amount: 4200,
    priority_tier: 'alta',
    priority_score: 92,
    matched_rules: ['Cliente VIP', 'SLA en riesgo'],
    sla_at_risk: true,
    overridden: false,
  },
  {
    id: '2',
    order_number: 'PED-2026-0143',
    customer_name: 'Farmacia Cruz Verde',
    store_name: 'Cliro (CR)',
    delivery_date: '2026-08-19',
    total_weight: 45,
    total_volume: 0.6,
    total_amount: 890,
    priority_tier: 'alta',
    priority_score: 88,
    matched_rules: ['Producto perecedero'],
    sla_at_risk: true,
    overridden: false,
  },
  {
    id: '3',
    order_number: 'PED-2026-0144',
    customer_name: 'Mayoreo Central',
    store_name: 'Micheleana (VE)',
    delivery_date: '2026-08-20',
    total_weight: 1200,
    total_volume: 15.2,
    total_amount: 15800,
    priority_tier: 'alta',
    priority_score: 85,
    matched_rules: ['Cliente VIP', 'Monto alto'],
    sla_at_risk: false,
    overridden: true,
    override_reason: 'Cliente escaló el caso directamente con el equipo comercial',
    override_by: 'Eduardo',
  },
  {
    id: '4',
    order_number: 'PED-2026-0145',
    customer_name: 'Abastecedora Don Beto',
    store_name: 'San Diego (VE)',
    delivery_date: '2026-08-21',
    total_weight: 210,
    total_volume: 2.8,
    total_amount: 1450,
    priority_tier: 'media',
    priority_score: 61,
    matched_rules: ['Zona de alta rotación'],
    sla_at_risk: false,
    overridden: false,
  },
  {
    id: '5',
    order_number: 'PED-2026-0146',
    customer_name: 'Super La Feria',
    store_name: 'Cliro (CR)',
    delivery_date: '2026-08-21',
    total_weight: 90,
    total_volume: 1.1,
    total_amount: 620,
    priority_tier: 'media',
    priority_score: 55,
    matched_rules: [],
    sla_at_risk: false,
    overridden: false,
  },
  {
    id: '6',
    order_number: 'PED-2026-0147',
    customer_name: 'Distribuidora Andina',
    store_name: 'Micheleana (VE)',
    delivery_date: '2026-08-19',
    total_weight: 480,
    total_volume: 6.0,
    total_amount: 3100,
    priority_tier: 'alta',
    priority_score: 79,
    matched_rules: ['Producto perecedero', 'SLA en riesgo'],
    sla_at_risk: true,
    overridden: false,
  },
  {
    id: '7',
    order_number: 'PED-2026-0148',
    customer_name: 'Minimarket El Sol',
    store_name: 'Cliro (CR)',
    delivery_date: '2026-08-22',
    total_weight: 30,
    total_volume: 0.4,
    total_amount: 210,
    priority_tier: 'baja',
    priority_score: 22,
    matched_rules: [],
    sla_at_risk: false,
    overridden: false,
  },
  {
    id: '8',
    order_number: 'PED-2026-0149',
    customer_name: 'Mayoreo Oriente',
    store_name: 'San Diego (VE)',
    delivery_date: '2026-08-20',
    total_weight: 890,
    total_volume: 11.4,
    total_amount: 9200,
    priority_tier: 'media',
    priority_score: 58,
    matched_rules: ['Monto alto'],
    sla_at_risk: false,
    overridden: false,
  },
  {
    id: '9',
    order_number: 'PED-2026-0150',
    customer_name: 'Farmacia Salud Total',
    store_name: 'Cliro (CR)',
    delivery_date: '2026-08-19',
    total_weight: 60,
    total_volume: 0.8,
    total_amount: 430,
    priority_tier: 'baja',
    priority_score: 30,
    matched_rules: [],
    sla_at_risk: false,
    overridden: true,
    override_reason: 'Cliente pidió posponer la entrega por teléfono',
    override_by: 'Eduardo',
  },
  {
    id: '10',
    order_number: 'PED-2026-0151',
    customer_name: 'Super Mercado La Económica',
    store_name: 'San Diego (VE)',
    delivery_date: '2026-08-23',
    total_weight: 150,
    total_volume: 2.0,
    total_amount: 980,
    priority_tier: 'baja',
    priority_score: 18,
    matched_rules: [],
    sla_at_risk: false,
    overridden: false,
  },
];

export interface OmsRule {
  id: string;
  name: string;
  condition: string;
  weight: number;
  active: boolean;
  profile: string;
}

export const mockRules: OmsRule[] = [
  {
    id: 'rule-1',
    name: 'Cliente VIP',
    condition: 'SI cliente.tier = VIP → +30 puntos',
    weight: 90,
    active: true,
    profile: 'General',
  },
  {
    id: 'rule-2',
    name: 'SLA en riesgo',
    condition: 'SI (fecha_entrega - hoy) <= 1 día → +25 puntos',
    weight: 85,
    active: true,
    profile: 'General',
  },
  {
    id: 'rule-3',
    name: 'Monto alto',
    condition: 'SI monto_pedido > $5,000 → +15 puntos',
    weight: 60,
    active: true,
    profile: 'General',
  },
  {
    id: 'rule-4',
    name: 'Producto perecedero',
    condition: 'SI tipo_producto = perecedero → +20 puntos',
    weight: 70,
    active: true,
    profile: 'Perecederos Venezuela',
  },
  {
    id: 'rule-5',
    name: 'Zona de alta rotación',
    condition: 'SI zona = alta_rotacion → +10 puntos',
    weight: 40,
    active: false,
    profile: 'Mayoreo VIP',
  },
  {
    id: 'rule-6',
    name: 'Cliente Mayoreo prioritario',
    condition: 'SI cliente = Mayoreo Y tier = VIP → Prioridad 1 fija',
    weight: 95,
    active: true,
    profile: 'Mayoreo VIP',
  },
];

export interface OmsAuditEntry {
  id: string;
  order_number: string;
  change_type: 'automatico' | 'manual';
  previous_tier: PriorityTier;
  new_tier: PriorityTier;
  reason: string;
  actor: string;
  created_at: string;
}

export const mockAuditLog: OmsAuditEntry[] = [
  {
    id: 'log-1',
    order_number: 'PED-2026-0144',
    change_type: 'manual',
    previous_tier: 'media',
    new_tier: 'alta',
    reason: 'Cliente escaló el caso directamente con el equipo comercial',
    actor: 'Eduardo',
    created_at: '2026-08-18T09:15:00',
  },
  {
    id: 'log-2',
    order_number: 'PED-2026-0150',
    change_type: 'manual',
    previous_tier: 'media',
    new_tier: 'baja',
    reason: 'Cliente pidió posponer la entrega',
    actor: 'Eduardo',
    created_at: '2026-08-18T08:40:00',
  },
  {
    id: 'log-3',
    order_number: 'PED-2026-0142',
    change_type: 'automatico',
    previous_tier: 'media',
    new_tier: 'alta',
    reason: 'Regla "SLA en riesgo" activada (entrega en menos de 24h)',
    actor: 'Motor de reglas',
    created_at: '2026-08-18T06:00:00',
  },
  {
    id: 'log-4',
    order_number: 'PED-2026-0146',
    change_type: 'automatico',
    previous_tier: 'baja',
    new_tier: 'alta',
    reason: 'Reglas "Producto perecedero" y "SLA en riesgo" activadas',
    actor: 'Motor de reglas',
    created_at: '2026-08-18T06:00:00',
  },
  {
    id: 'log-5',
    order_number: 'PED-2026-0143',
    change_type: 'automatico',
    previous_tier: 'media',
    new_tier: 'alta',
    reason: 'Regla "Producto perecedero" activada',
    actor: 'Motor de reglas',
    created_at: '2026-08-17T22:00:00',
  },
  {
    id: 'log-6',
    order_number: 'PED-2026-0149',
    change_type: 'automatico',
    previous_tier: 'baja',
    new_tier: 'media',
    reason: 'Regla "Monto alto" activada',
    actor: 'Motor de reglas',
    created_at: '2026-08-17T20:30:00',
  },
];

export const mockKpis = {
  pendientes: 128,
  slaEnRiesgo: 14,
  reprioritizadosManualPct: 7,
  antiguedadPromedioHoras: 6.4,
};
