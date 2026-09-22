// Motor de Prioridad del OMS (Fase 6, docs/arquitectura-tms-oms/05-roadmap.md).
// Módulo puro (sin React, sin fetch) para poder probarlo sin montar nada -
// ver Testing Posture en aidlc/spaces/default/memory/project.md. Este código
// vive bajo tsconfig.json local con strictNullChecks:true (Code Style DECIDED
// en project.md) aunque el tsconfig.app.json global tenga strict:false.
//
// PRIMERA ENTREGA (reunión funcional Antonio, 2026-09-08): solo 2 reglas -
// (1) cliente retira / análisis de observaciones y (2) generación automática
// por fecha (regla T-1: listo = fecha_entrega - 1 día). El resto de las 5
// macro-reglas (asignación de viaje/bajada, inventario/capacidad) quedan para
// fases posteriores.
//
// La prioridad "real" del negocio es NUMÉRICA e invertida (menor número =
// más urgente, para hacer match con el WMS - ver DECIDED en project.md).
// `tier`/`score` son un bucket de compatibilidad con la UI existente
// (PriorityTier 1-4, 1=más urgente ya coincide en dirección); es un mapeo
// temporal, no el modelo final (project.md ya marca esa discrepancia como
// pendiente de corrección en requirements.md).

export interface ExpedicionParaPriorizar {
  fechaPlanificada: string | null; // "fecha de expedición planificada" (=fecha de ENTREGA que envía el cliente) - el OMS solo LEE esto, nunca lo escribe
  fechaExpedicion: string | null; // fallback si no hay fecha planificada (p. ej. Cofersa no siempre la envía)
  observaciones: string | null;
}

export type Tier = 1 | 2 | 3 | 4;

export interface ReglaAplicada {
  name: string;
  weight: number;
}

export interface ResultadoPrioridad {
  prioridad: number; // numérica, menor = más urgente (1 = cliente retira, banda alta = sin fecha/lejana)
  tier: Tier;
  score: number; // para el sort existente de la Cola (mayor score = más urgente)
  esClienteRetira: boolean;
  appliedRules: ReglaAplicada[];
}

// Heurística MVP: las observaciones son texto libre sin estándar (ver
// project.md, reunión Antonio 2026-09-08) - esta lista se ajusta cuando se
// vean más patrones reales; queda expuesta para poder ampliarla desde el
// catálogo semi-configurable del Motor de Reglas (Fase 6, vista, no acá).
const PALABRAS_CLIENTE_RETIRA = ['cliente retira', 'retira cliente', 'retiro cliente', 'recoge cliente', 'recoge en bodega'];

export function esClienteRetira(observaciones: string | null): boolean {
  if (!observaciones) return false;
  const texto = observaciones.toLowerCase();
  return PALABRAS_CLIENTE_RETIRA.some((kw) => texto.includes(kw));
}

// Días de calendario entre dos fechas ISO (yyyy-mm-dd), truncando a medianoche
// para que la comparación no dependa de la hora del día. `entrega - hoy`;
// negativo = la entrega ya venció.
function diasEntreFechas(desdeIso: string, hastaIso: string): number {
  const desde = new Date(`${desdeIso}T00:00:00Z`);
  const hasta = new Date(`${hastaIso}T00:00:00Z`);
  const msPorDia = 24 * 60 * 60 * 1000;
  return Math.round((hasta.getTime() - desde.getTime()) / msPorDia);
}

function esFechaValida(fechaIso: string | null): fechaIso is string {
  if (!fechaIso) return false;
  return !Number.isNaN(new Date(`${fechaIso}T00:00:00Z`).getTime());
}

// `hoyIso` se inyecta (en vez de usar Date.now() adentro) para que el módulo
// sea determinista y probable sin mockear el reloj del sistema.
export function calcularPrioridad(
  expedicion: ExpedicionParaPriorizar,
  hoyIso: string,
): ResultadoPrioridad {
  const appliedRules: ReglaAplicada[] = [];

  if (esClienteRetira(expedicion.observaciones)) {
    appliedRules.push({ name: 'Cliente retira', weight: 1 });
    return { prioridad: 1, tier: 1, score: 1000, esClienteRetira: true, appliedRules };
  }

  const fechaEntrega = esFechaValida(expedicion.fechaPlanificada)
    ? expedicion.fechaPlanificada
    : esFechaValida(expedicion.fechaExpedicion)
      ? expedicion.fechaExpedicion
      : null;

  if (fechaEntrega === null) {
    // Sin fecha de entrega utilizable (p.ej. Cofersa no la envía) - no hay
    // insumo para la regla T-1; banda más baja hasta que se resuelva el
    // origen de datos (ver DECIDED "fuente de datos" en project.md).
    return { prioridad: 50, tier: 4, score: 0, esClienteRetira: false, appliedRules };
  }

  const diasParaEntrega = diasEntreFechas(hoyIso, fechaEntrega);
  appliedRules.push({ name: 'Regla T-1 (fecha de despacho)', weight: 1 });

  // Regla T-1: "listo" = entrega - 1 día. diasParaEntrega<=1 significa que
  // hoy ya cae dentro (o después) de la ventana en que debería estar listo.
  // Duración de ruta / horas de corte quedan como parámetros a incorporar
  // cuando el catálogo del Motor de Reglas los traiga (ver project.md DECIDED
  // "vista Motor de Reglas") - por ahora T-1 puro.
  let prioridad: number;
  if (diasParaEntrega <= 0) prioridad = 2; // entrega hoy o vencida
  else if (diasParaEntrega === 1) prioridad = 3; // ventana T-1: listo hoy
  else if (diasParaEntrega === 2) prioridad = 10;
  else prioridad = Math.min(20 + diasParaEntrega, 49);

  const tier: Tier = prioridad <= 3 ? 1 : prioridad <= 10 ? 2 : prioridad <= 20 ? 3 : 4;
  const score = Math.max(0, 1000 - prioridad * 10);

  return { prioridad, tier, score, esClienteRetira: false, appliedRules };
}
