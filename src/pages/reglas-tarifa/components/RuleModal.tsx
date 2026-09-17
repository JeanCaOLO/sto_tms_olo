// Editor de reglas. La pestaña SIMPLE habla el idioma del usuario —variable, operador, valor,
// aumenta o disminuye— y va mostrando en castellano lo que la regla va a hacer. La pestaña
// AVANZADA es el JSON del motor, para lo que el formulario no cubre (escalones, mínimos/máximos,
// tarifas por zona).
//
// La traducción entre una cosa y la otra NO vive acá: está en `lib/tarifas/rule-builder.ts`, que es
// código puro y con tests. Este archivo es solo el formulario.

import { useEffect, useMemo, useState } from 'react';
import Decimal from 'decimal.js';
import Button from '../../../components/base/Button';
import Input from '../../../components/base/Input';
import Select from '../../../components/base/Select';
import Badge from '../../../components/base/Badge';
import { saveRule } from '../../../lib/tarifas/localRulesDataSource';
import { RuleSchema } from '../../../lib/tarifas/schemas';
import type {
  BaseRef, BuilderOperator, ConditionBuilderForm, ConditionMode, ConditionRowForm,
  ConditionRowOperator, Expr, NumericVarKey, PartyVariable, Pred, RateTable, RuleBuilderForm,
  RuleEffect, Stage, Tier, TierMode, VarKey,
} from '../../../lib/tarifas/types';
import {
  CONDITION_ROW_OP_LABELS, EFFECT_LABELS, OPERATOR_HINTS, OPERATOR_LABELS, TIER_MODE_HINTS,
  TIER_MODE_LABELS, collectVarKeys, compileBuilder, compileConditions, describeBuilder,
  emptyConditionRow, emptyTier, findMissingCustomVars, isBuilderValid, validateBuilder,
  validateConditionRows, type BuilderErrors,
} from '../../../lib/tarifas/rule-builder';
import { VAR_KEY_LABELS, formatPred, varLabel } from '../../../lib/tarifas/format';
import { evaluateExpr } from '../../../lib/tarifas/evaluator';
import { puede } from '../../../lib/liquidador/rbac';
import type { LiquidadorRole } from '../../../lib/liquidador/rbac';
import { registrarEvento } from '../../../lib/liquidador/auditLog';
import { listParties } from '../../../lib/tarifas/partiesDataSource';
import { listRateTables } from '../../../lib/tarifas/rateTablesDataSource';
import { labelsOf, listPartyVariables } from '../../../lib/tarifas/partyVariablesDataSource';
import type { SettlementPartyRow } from '../../../lib/tarifas/parties';

interface RuleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  rule?: any;
  organizationId: string;
  /** País activo del módulo: toda regla nueva nace en él. */
  country: { id: string; name: string; local_currency?: string } | null;
  rolActivo: LiquidadorRole;
  usuarioActivo: string;
}

const STAGE_OPTIONS: { value: Stage; label: string }[] = [
  { value: 'BASE', label: 'Base (precio base de la ruta)' },
  { value: 'VARIABLE', label: 'Variable (cliente / kg / bulto)' },
  { value: 'MODIFIER', label: 'Modificador (ajuste por servicio)' },
  { value: 'SURCHARGE', label: 'Recargo (pernocta, peajes, incidentes)' },
  { value: 'ADJUSTMENT', label: 'Ajuste (descuentos/penalidades)' },
  { value: 'TAX', label: 'Impuesto' },
];

// Redactadas como preguntas, no con el nombre técnico del modo de competencia.
const STACKING_OPTIONS = [
  { value: 'SUM', label: 'Se suma a las demás' },
  { value: 'MAX', label: 'Compite: gana la de monto más alto del grupo' },
  { value: 'EXCLUSIVE', label: 'Compite: gana la de mayor prioridad' },
];

// Las seis comparaciones más IN ("está en la lista") y BETWEEN ("está entre") — A2: antes solo se
// alcanzaban escribiendo JSON, aunque el motor las ejecuta desde siempre.
const CONDITION_ROW_OP_OPTIONS: { value: ConditionRowOperator; label: string }[] =
  (['EQ', 'NEQ', 'GT', 'GTE', 'LT', 'LTE', 'IN', 'BETWEEN'] as ConditionRowOperator[])
    .map((op) => ({ value: op, label: CONDITION_ROW_OP_LABELS[op] }));

const OPERATOR_OPTIONS: { value: BuilderOperator; label: string }[] =
  (['FIXED', 'TIMES', 'PER_BLOCK', 'PERCENT', 'TIERED', 'RATE_TABLE'] as BuilderOperator[])
    .map((op) => ({ value: op, label: OPERATOR_LABELS[op] }));

const TIER_MODE_OPTIONS: { value: TierMode; label: string }[] =
  (['RATE', 'PROGRESSIVE', 'FLAT'] as TierMode[])
    .map((m) => ({ value: m, label: TIER_MODE_LABELS[m] }));

// Variables del sistema que sirven como unidad de cálculo (multiplicar, contar en bloques).
const BUILTIN_NUMERIC_VARS: NumericVarKey[] = [
  'km', 'clientCount', 'packageCount', 'weightKg', 'durationHours', 'tollsAmount', 'tollCount',
  'pickupCount', 'truckVolumeM3', 'truckWeightTons', 'lateMinutes', 'incidentCount',
  'overnightNights', 'weekday',
];

// Todas las del sistema, para condicionar (incluye las de texto: tipo de camión, zona, servicio).
const BUILTIN_ALL_VARS = Object.keys(VAR_KEY_LABELS) as VarKey[];

type Tab = 'simple' | 'advanced';
type BaseType = 'STAGE_SUBTOTAL' | 'RUNNING_SUBTOTAL' | 'RULE';

const emptyBuilder = (): RuleBuilderForm => ({
  variable: 'tollCount',
  operator: 'TIMES',
  value: '0',
  effect: 'INCREASE',
  blockSize: 10,
  percentBase: { of: 'RUNNING_SUBTOTAL' },
  tierMode: 'RATE',
  tiers: [emptyTier()],
});

export default function RuleModal({
  isOpen, onClose, onSuccess, rule, organizationId, country, rolActivo, usuarioActivo,
}: RuleModalProps) {
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [tab, setTab] = useState<Tab>('simple');

  const [parties, setParties] = useState<SettlementPartyRow[]>([]);
  const [partyVariables, setPartyVariables] = useState<PartyVariable[]>([]);
  const [rateTables, setRateTables] = useState<RateTable[]>([]);

  const [formData, setFormData] = useState({
    code: '', name: '', country_id: '', stage: 'SURCHARGE' as Stage, priority: 10,
    stacking: 'SUM' as 'SUM' | 'MAX' | 'EXCLUSIVE', exclusion_group: '',
    scope: 'COUNTRY' as 'COUNTRY' | 'PARTY', party_id: '',
    reason: '', active: true,
    effective_from: '', effective_to: '',
  });

  const [conditionMode, setConditionMode] = useState<ConditionMode>('always');
  const [conditionCombinator, setConditionCombinator] = useState<'AND' | 'OR'>('AND');
  const [conditionRows, setConditionRows] = useState<ConditionRowForm[]>([emptyConditionRow()]);
  const [conditionRowErrors, setConditionRowErrors] = useState<Record<number, string>>({});
  const [advancedConditionsJson, setAdvancedConditionsJson] = useState('{ "p": "ALWAYS" }');

  const [builder, setBuilder] = useState<RuleBuilderForm>(emptyBuilder());
  const [builderErrors, setBuilderErrors] = useState<BuilderErrors>({});
  const [advancedExpressionJson, setAdvancedExpressionJson] = useState('{ "op": "FIXED", "amount": "0" }');

  // La descripción se autogenera hasta que alguien la toca; desde ahí manda lo que escribió.
  const [description, setDescription] = useState('');
  const [descriptionTouched, setDescriptionTouched] = useState(false);

  // Aviso temprano: el período invertido también lo rechaza el validador al guardar, pero verlo al
  // teclear evita mandar el error a la franja roja de arriba.
  const periodoInvertido = !!formData.effective_from && !!formData.effective_to
    && formData.effective_from > formData.effective_to;

  const [probeValue, setProbeValue] = useState('10');
  const [probeResult, setProbeResult] = useState<string | null>(null);

  // ── Carga de catálogos ──────────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!isOpen) return;
    void listParties().then(setParties).catch(() => setParties([]));
  }, [isOpen]);

  // Tarifarios del país, para que el operador "Tarifa de tabla" ofrezca los que existen en vez de
  // pedir que alguien recuerde el código de memoria.
  useEffect(() => {
    if (!isOpen || !country?.id) { setRateTables([]); return; }
    void listRateTables(country.id).then(setRateTables).catch(() => setRateTables([]));
  }, [isOpen, country?.id]);

  useEffect(() => {
    if (!isOpen || formData.scope !== 'PARTY' || !formData.party_id) {
      setPartyVariables([]);
      return;
    }
    void listPartyVariables(formData.party_id).then(setPartyVariables).catch(() => setPartyVariables([]));
  }, [isOpen, formData.scope, formData.party_id]);

  // ── Apertura ────────────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!isOpen) return;
    setErrorMsg('');
    setProbeResult(null);
    setBuilderErrors({});

    if (rule) {
      setFormData({
        code: rule.code || '', name: rule.name || '', country_id: rule.country_id || '',
        stage: rule.stage || 'BASE', priority: rule.priority ?? 10, stacking: rule.stacking || 'SUM',
        exclusion_group: rule.exclusion_group || '',
        scope: (rule.scope as 'COUNTRY' | 'PARTY') || 'COUNTRY', party_id: rule.party_id || '',
        reason: rule.reason || '', active: rule.active ?? true,
        effective_from: rule.effective_from || '', effective_to: rule.effective_to || '',
      });
      setAdvancedConditionsJson(JSON.stringify(rule.conditions, null, 2));
      setAdvancedExpressionJson(JSON.stringify(rule.expression, null, 2));
      setDescription(rule.description || '');
      setDescriptionTouched(!!rule.description);
      setConditionRowErrors({});

      // A1: la condición vuelve a abrirse en el formulario visual si se armó ahí, en vez de forzar
      // JSON en toda segunda edición — el mismo defecto que ya se había corregido para el cálculo,
      // todavía vivo del lado de la condición.
      if (rule.condition_builder) {
        const cb = rule.condition_builder as ConditionBuilderForm;
        setConditionMode(cb.mode);
        setConditionCombinator(cb.combinator);
        setConditionRows(cb.rows.length > 0 ? cb.rows : [emptyConditionRow()]);
      } else if (!rule.conditions || rule.conditions.p === 'ALWAYS') {
        // Sin forma visual guardada pero la condición ES "siempre": no hace falta adivinar nada.
        setConditionMode('always');
        setConditionCombinator('AND');
        setConditionRows([emptyConditionRow()]);
      } else {
        // Cualquier otra cosa sin forma visual guardada (reglas de antes de esta fase, o armadas a
        // mano en JSON) se abre en JSON — mismo criterio que ya usa el cálculo con `builder`.
        setConditionMode('advanced');
        setConditionCombinator('AND');
        setConditionRows([emptyConditionRow()]);
      }

      // Si la regla se armó en el formulario simple, vuelve a abrirse ahí. Antes TODA edición
      // mandaba al JSON, que es lo que hacía inservible el constructor guiado.
      if (rule.builder) {
        setBuilder(rule.builder as RuleBuilderForm);
        setTab('simple');
      } else {
        setBuilder(emptyBuilder());
        setTab('advanced');
      }
    } else {
      setFormData({
        code: '', name: '', country_id: country?.id ?? '', stage: 'SURCHARGE', priority: 10, stacking: 'SUM',
        exclusion_group: '', scope: 'COUNTRY', party_id: '',
        reason: '', active: true,
        effective_from: '', effective_to: '',
      });
      setConditionMode('always');
      setConditionCombinator('AND');
      setConditionRows([emptyConditionRow()]);
      setConditionRowErrors({});
      setAdvancedConditionsJson('{ "p": "ALWAYS" }');
      setBuilder(emptyBuilder());
      setAdvancedExpressionJson('{ "op": "FIXED", "amount": "0" }');
      setDescription('');
      setDescriptionTouched(false);
      setTab('simple');
    }
  }, [isOpen, rule]);

  // ── Derivados ───────────────────────────────────────────────────────────────────────────────

  const customLabels = useMemo(() => labelsOf(partyVariables), [partyVariables]);

  const numericVarOptions = useMemo(() => [
    ...BUILTIN_NUMERIC_VARS.map((v) => ({ value: v as string, label: VAR_KEY_LABELS[v as never] ?? v })),
    ...partyVariables
      .filter((v) => v.kind === 'NUMBER')
      .map((v) => ({ value: v.key as string, label: `${v.label} (propia)` })),
  ], [partyVariables]);

  const allVarOptions = useMemo(() => [
    ...BUILTIN_ALL_VARS.map((v) => ({ value: v as string, label: VAR_KEY_LABELS[v as never] ?? v })),
    ...partyVariables.map((v) => ({ value: v.key as string, label: `${v.label} (propia)` })),
  ], [partyVariables]);

  const buildConditions = (): Pred => {
    if (conditionMode === 'advanced') return JSON.parse(advancedConditionsJson);
    return compileConditions({ mode: conditionMode, combinator: conditionCombinator, rows: conditionRows });
  };

  /** Forma visual de la condición, para reabrirla (A1) — null si se escribió en JSON. */
  const currentConditionBuilder = (): ConditionBuilderForm | null => (
    conditionMode === 'advanced'
      ? null
      : { mode: conditionMode, combinator: conditionCombinator, rows: conditionRows }
  );

  const selectedCountry = country;
  const currencyLabel = selectedCountry?.local_currency ?? 'moneda local';

  const conditionText = useMemo(() => {
    try {
      return formatPred(buildConditions(), customLabels);
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conditionMode, conditionCombinator, conditionRows, advancedConditionsJson, customLabels]);

  const autoDescription = useMemo(
    () => describeBuilder(builder, {
      varLabel: (k) => varLabel(k, customLabels),
      currency: currencyLabel,
      conditionText,
    }),
    [builder, customLabels, currencyLabel, conditionText],
  );

  const effectiveDescription = descriptionTouched ? description : autoDescription;

  const usedVars = useMemo(() => {
    try {
      return collectVarKeys({ conditions: buildConditions(), expression: compileBuilder(builder) });
    } catch {
      return [];
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [builder, conditionMode, conditionCombinator, conditionRows, advancedConditionsJson]);

  const missingVars = useMemo(() => {
    if (formData.scope !== 'PARTY') return [];
    try {
      return findMissingCustomVars(
        { conditions: buildConditions(), expression: compileBuilder(builder) },
        partyVariables,
      );
    } catch {
      return [];
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [builder, conditionMode, conditionCombinator, conditionRows, partyVariables, formData.scope]);

  // ── Prueba rápida, sin salir del formulario ─────────────────────────────────────────────────

  const runProbe = () => {
    try {
      const expr = compileBuilder(builder);
      const vars = { [builder.variable ?? 'km']: Number(probeValue) || 0 } as never;
      const amount = evaluateExpr(expr, {
        vars,
        originZoneId: '',
        destZoneId: '',
        // Bases ficticias de 100 para que un porcentaje también dé un número comprensible.
        getStageSubtotal: () => new Decimal(100),
        getRunningSubtotal: () => new Decimal(100),
        getRuleAmount: () => new Decimal(100),
        warn: () => {},
      });
      setProbeResult(`${amount.toFixed(2)} ${currencyLabel}`);
    } catch (error) {
      setProbeResult(error instanceof Error ? error.message : 'No se pudo calcular');
    }
  };

  // ── Guardado ────────────────────────────────────────────────────────────────────────────────

  const addConditionRow = () => setConditionRows((rows) => [...rows, emptyConditionRow()]);
  const removeConditionRow = (index: number) => setConditionRows((rows) => rows.filter((_, i) => i !== index));
  const setConditionRow = (index: number, patch: Partial<ConditionRowForm>) => setConditionRows(
    (rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)),
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!organizationId) {
      setErrorMsg('No se pudo identificar la organización. Recarga la página e intenta de nuevo.');
      return;
    }
    if (!puede(rule ? 'EDITAR_REGLA' : 'CREAR_REGLA', rolActivo)) {
      setErrorMsg('Tu rol simulado actual no tiene permiso para esta acción. Cambiá a "Jefe de transporte" en el selector de rol.');
      return;
    }
    if (formData.scope === 'PARTY' && !formData.party_id) {
      setErrorMsg('Elegí a qué compañía pertenece la regla, o cambiá su alcance a "Todas las compañías del país".');
      return;
    }

    if (conditionMode === 'rows') {
      const rowErrors = validateConditionRows({ mode: conditionMode, combinator: conditionCombinator, rows: conditionRows });
      setConditionRowErrors(rowErrors);
      if (Object.keys(rowErrors).length > 0) {
        setErrorMsg('Revisá las filas de condición marcadas.');
        return;
      }
    }

    let conditions: Pred;
    try {
      conditions = buildConditions();
    } catch {
      setErrorMsg('La condición en modo avanzado no es JSON válido.');
      return;
    }

    let expression: Expr;
    if (tab === 'simple') {
      const errors = validateBuilder(builder);
      setBuilderErrors(errors);
      if (!isBuilderValid(errors)) {
        setErrorMsg('Revisá los campos marcados del cálculo.');
        return;
      }
      expression = compileBuilder(builder);
    } else {
      try {
        expression = JSON.parse(advancedExpressionJson);
      } catch {
        setErrorMsg('La expresión en modo avanzado no es JSON válido.');
        return;
      }
    }

    if (missingVars.length > 0) {
      setErrorMsg(`La regla usa variables que esta compañía no tiene declaradas: ${missingVars.join(', ')}.`);
      return;
    }

    const candidate = {
      id: rule?.id || 'draft',
      countryId: formData.country_id || 'draft',
      scope: formData.scope,
      partyId: formData.scope === 'PARTY' ? formData.party_id : null,
      code: formData.code.trim().toUpperCase(),
      name: formData.name,
      stage: formData.stage,
      priority: Number(formData.priority),
      stacking: formData.stacking,
      exclusionGroup: formData.stacking === 'MAX' && formData.exclusion_group.trim() ? formData.exclusion_group.trim() : null,
      conditions,
      expression,
      description: effectiveDescription || null,
      reason: formData.reason.trim() || null,
      effect: tab === 'simple' ? builder.effect : null,
      builder: tab === 'simple' ? builder : null,
      conditionBuilder: currentConditionBuilder(),
      isAdhoc: false,
      active: formData.active,
      // Vacío = sin límite por ese lado. No se asume "desde hoy": una regla que se carga hoy puede
      // corresponder a un acuerdo que empezó el mes pasado, y suponerlo dejaría fuera viajes ya
      // hechos sin que nadie lo pida.
      effectiveFrom: formData.effective_from || null,
      effectiveTo: formData.effective_to || null,
      version: rule?.version ?? 1,
    };

    const validation = RuleSchema.safeParse(candidate);
    if (!validation.success) {
      const firstIssue = validation.error.issues[0];
      setErrorMsg(`Regla inválida: ${firstIssue?.path.join('.')} — ${firstIssue?.message}`);
      return;
    }

    setLoading(true);
    try {
      const payload = {
        country_id: formData.country_id || null,
        scope: candidate.scope,
        party_id: candidate.partyId,
        code: candidate.code,
        name: candidate.name,
        stage: candidate.stage,
        priority: candidate.priority,
        stacking: candidate.stacking,
        exclusion_group: candidate.exclusionGroup,
        conditions: candidate.conditions,
        expression: candidate.expression,
        description: candidate.description,
        reason: candidate.reason,
        effect: candidate.effect,
        builder: candidate.builder,
        condition_builder: candidate.conditionBuilder,
        is_adhoc: false,
        active: candidate.active,
        effective_from: candidate.effectiveFrom,
        effective_to: candidate.effectiveTo,
        version: rule ? candidate.version + 1 : 1,
        updated_at: new Date().toISOString(),
      };

      const { error } = await saveRule(organizationId, payload, rule?.id);
      if (error) throw error;

      await registrarEvento({
        entidad: 'pricing_rules',
        entidadId: rule?.id || candidate.code,
        accion: rule ? 'UPDATE' : 'CREATE',
        usuario: usuarioActivo,
        rol: rolActivo,
        antes: rule ?? null,
        despues: payload,
        motivo: candidate.reason ?? undefined,
      });

      onSuccess();
      onClose();
    } catch (error: any) {
      const msg = error?.message || JSON.stringify(error);
      setErrorMsg(
        msg.includes('duplicate') || msg.includes('unique')
          ? 'Ya existe una regla con ese código.'
          : `Error al guardar la regla: ${msg}`,
      );
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const setBuilderField = <K extends keyof RuleBuilderForm>(key: K, value: RuleBuilderForm[K]) => {
    setBuilder((prev) => ({ ...prev, [key]: value }));
    setBuilderErrors((prev) => ({ ...prev, [key]: undefined }));
    setProbeResult(null);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-3xl max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 bg-white flex items-center justify-between px-6 py-4 border-b border-gray-200 z-10">
          <h2 className="text-lg font-semibold text-gray-900">{rule ? 'Editar regla' : 'Nueva regla'}</h2>
          <div className="flex items-center gap-3">
            <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
              {(['simple', 'advanced'] as Tab[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={`px-3 py-1 text-xs rounded-md transition-colors ${tab === t ? 'bg-white text-teal-700 shadow-sm' : 'text-gray-600'}`}
                >
                  {t === 'simple' ? 'Simple' : 'Avanzado (JSON)'}
                </button>
              ))}
            </div>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 cursor-pointer">
              <i className="ri-close-line text-xl"></i>
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {errorMsg && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
              <i className="ri-error-warning-line mt-0.5 shrink-0"></i>
              <span>{errorMsg}</span>
            </div>
          )}

          {/* ── Identificación ─────────────────────────────────────────────────────────────── */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Identificación</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input label="Código *" value={formData.code} onChange={(e) => setFormData({ ...formData, code: e.target.value })} placeholder="BONO-PEAJES" required disabled={!!rule} />
              <Input label="Nombre *" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="Bono por peaje transitado" required />
              <Select
                label="Alcance *"
                value={formData.scope}
                onChange={(e) => setFormData({ ...formData, scope: e.target.value as 'COUNTRY' | 'PARTY', party_id: '' })}
                options={[
                  { value: 'COUNTRY', label: 'Todas las compañías del país' },
                  { value: 'PARTY', label: 'Solo una compañía' },
                ]}
              />
              {formData.scope === 'PARTY' && (
                <Select
                  label="Compañía *"
                  value={formData.party_id}
                  onChange={(e) => setFormData({ ...formData, party_id: e.target.value })}
                  options={[
                    { value: '', label: 'Elegir compañía...' },
                    ...parties
                      .filter((p) => p.country_id === formData.country_id)
                      .map((p) => ({ value: p.id, label: `${p.name} (${p.classification === 'OWN' ? 'propia' : 'tercero'})` })),
                  ]}
                />
              )}
            </div>
            {formData.scope === 'PARTY' && (
              <p className="text-xs text-teal-800 bg-teal-50 border border-teal-200 rounded-lg px-3 py-2 mt-3">
                Con el <strong>mismo código</strong> que una regla del país, esta la reemplaza para esta
                compañía. Con un código nuevo, se suma a las que hereda.
              </p>
            )}
          </section>

          {/* ── Condición ──────────────────────────────────────────────────────────────────── */}
          <section className="border-t border-gray-200 pt-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-700">¿Cuándo aplica?</h3>
              <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
                {([
                  { mode: 'always' as ConditionMode, label: 'Siempre' },
                  { mode: 'rows' as ConditionMode, label: 'Si se cumple…' },
                  { mode: 'advanced' as ConditionMode, label: 'JSON' },
                ]).map(({ mode, label }) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setConditionMode(mode)}
                    className={`px-3 py-1 text-xs rounded-md transition-colors ${conditionMode === mode ? 'bg-white text-teal-700 shadow-sm' : 'text-gray-600'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {conditionMode === 'rows' && (
              <div className="space-y-2">
                {conditionRows.length > 1 && (
                  <div className="flex items-center gap-2 text-xs text-gray-600">
                    <span>Se cumplen</span>
                    <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
                      {([
                        { value: 'AND' as const, label: 'todas (Y)' },
                        { value: 'OR' as const, label: 'alguna (O)' },
                      ]).map(({ value, label }) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setConditionCombinator(value)}
                          className={`px-2 py-0.5 rounded-md transition-colors ${conditionCombinator === value ? 'bg-white text-teal-700 shadow-sm' : 'text-gray-600'}`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {conditionRows.map((row, index) => (
                  <div key={index} className="space-y-1">
                    <div className="flex flex-wrap gap-2 items-end">
                      <button
                        type="button"
                        title="Negar esta condición"
                        onClick={() => setConditionRow(index, { negate: !row.negate })}
                        className={`px-2 py-2 text-xs rounded-lg border transition-colors ${row.negate ? 'bg-red-50 border-red-300 text-red-700' : 'border-gray-300 text-gray-500'}`}
                      >
                        NO
                      </button>
                      <div className="w-48">
                        <Select
                          value={row.left}
                          onChange={(e) => setConditionRow(index, { left: e.target.value as VarKey })}
                          options={allVarOptions}
                        />
                      </div>
                      <div className="w-44">
                        <Select
                          value={row.op}
                          onChange={(e) => setConditionRow(index, { op: e.target.value as ConditionRowOperator })}
                          options={CONDITION_ROW_OP_OPTIONS}
                        />
                      </div>
                      {row.op === 'BETWEEN' ? (
                        <>
                          <div className="w-28">
                            <Input
                              value={row.from}
                              onChange={(e) => setConditionRow(index, { from: e.target.value })}
                              placeholder="Desde"
                            />
                          </div>
                          <div className="w-28">
                            <Input
                              value={row.to}
                              onChange={(e) => setConditionRow(index, { to: e.target.value })}
                              placeholder="Hasta"
                            />
                          </div>
                        </>
                      ) : row.op === 'IN' ? (
                        <div className="flex-1 min-w-40">
                          <Input
                            value={row.values}
                            onChange={(e) => setConditionRow(index, { values: e.target.value })}
                            placeholder="valor1, valor2, valor3"
                          />
                        </div>
                      ) : (
                        <div className="flex-1 min-w-32">
                          <Input
                            value={row.right}
                            onChange={(e) => setConditionRow(index, { right: e.target.value })}
                            placeholder="20"
                          />
                        </div>
                      )}
                      <Button type="button" variant="ghost" size="sm" onClick={() => removeConditionRow(index)}>
                        <i className="ri-delete-bin-line"></i>
                      </Button>
                    </div>
                    {conditionRowErrors[index] && (
                      <p className="text-xs text-red-600">{conditionRowErrors[index]}</p>
                    )}
                  </div>
                ))}
                <Button type="button" variant="secondary" size="sm" onClick={addConditionRow}>
                  <i className="ri-add-line mr-1"></i> Agregar condición
                </Button>
              </div>
            )}

            {conditionMode === 'advanced' && (
              <textarea
                value={advancedConditionsJson}
                onChange={(e) => setAdvancedConditionsJson(e.target.value)}
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            )}
          </section>

          {/* ── Cálculo ────────────────────────────────────────────────────────────────────── */}
          {tab === 'simple' ? (
            <section className="border-t border-gray-200 pt-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">¿Cuánto suma o resta?</h3>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-start">
                <Select
                  label="Operador *"
                  value={builder.operator}
                  onChange={(e) => setBuilderField('operator', e.target.value as BuilderOperator)}
                  options={OPERATOR_OPTIONS}
                />
                {builder.operator !== 'FIXED' && builder.operator !== 'RATE_TABLE' && (
                  <Select
                    label="Variable *"
                    value={builder.variable ?? ''}
                    onChange={(e) => setBuilderField('variable', e.target.value as NumericVarKey)}
                    options={[{ value: '', label: 'Elegir variable…' }, ...numericVarOptions]}
                    error={builderErrors.variable}
                  />
                )}
                {builder.operator === 'PER_BLOCK' && (
                  <Input
                    label="Cada cuántas *"
                    type="number"
                    value={String(builder.blockSize ?? '')}
                    onChange={(e) => setBuilderField('blockSize', Number(e.target.value))}
                    error={builderErrors.blockSize}
                  />
                )}
                {builder.operator !== 'TIERED' && (
                  <Input
                    label={
                      builder.operator === 'PERCENT'
                        ? 'Porcentaje *'
                        : builder.operator === 'RATE_TABLE'
                          ? `Respaldo en ${currencyLabel} *`
                          : `Importe en ${currencyLabel} *`
                    }
                    value={builder.value}
                    onChange={(e) => setBuilderField('value', e.target.value)}
                    placeholder={builder.operator === 'PERCENT' ? '20' : '20.00'}
                    error={builderErrors.value}
                  />
                )}
                <Select
                  label="Efecto *"
                  value={builder.effect}
                  onChange={(e) => setBuilderField('effect', e.target.value as RuleEffect)}
                  options={(['INCREASE', 'DECREASE'] as RuleEffect[]).map((v) => ({ value: v, label: EFFECT_LABELS[v] }))}
                />
              </div>

              <p className="text-xs text-gray-500 mt-2">{OPERATOR_HINTS[builder.operator]}</p>

              {builder.operator === 'RATE_TABLE' && (
                <div className="mt-3 space-y-2">
                  <Select
                    label="¿De qué tarifario sale el importe? *"
                    value={builder.rateTableCode ?? ''}
                    onChange={(e) => setBuilderField('rateTableCode', e.target.value)}
                    options={[
                      { value: '', label: rateTables.length === 0 ? 'No hay tarifarios en este país' : 'Elegir tarifario…' },
                      ...rateTables.map((t) => ({
                        value: t.code,
                        label: `${t.code} — ${t.name} (${t.keyColumns.map((c) => varLabel(c)).join(' · ')})`,
                      })),
                    ]}
                    error={builderErrors.rateTableCode}
                  />
                  {rateTables.length === 0 ? (
                    <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                      <i className="ri-alert-line mr-1"></i>
                      Todavía no hay ninguno cargado. Se crean en la pestaña <strong>Tarifarios</strong>.
                    </p>
                  ) : (
                    <p className="text-xs text-gray-500">
                      El <strong>respaldo</strong> es lo que se cobra si el viaje no casa ninguna fila
                      del tarifario. Queda anotado en el desglose cuando pasa, así que un viaje sin
                      cobertura se ve en vez de liquidarse en silencio.
                    </p>
                  )}
                </div>
              )}

              {builder.operator === 'TIERED' && (
                <div className="mt-3 space-y-3">
                  <Select
                    label="¿Qué significa el importe de cada tramo? *"
                    value={builder.tierMode ?? 'RATE'}
                    onChange={(e) => setBuilderField('tierMode', e.target.value as TierMode)}
                    options={TIER_MODE_OPTIONS}
                  />
                  <p className="text-xs text-gray-500">{TIER_MODE_HINTS[builder.tierMode ?? 'RATE']}</p>

                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50">
                        <tr className="text-left text-xs font-medium text-slate-500 uppercase">
                          <th className="px-3 py-2">Desde</th>
                          <th className="px-3 py-2">Hasta (inclusive)</th>
                          <th className="px-3 py-2">Importe ({currencyLabel})</th>
                          <th className="px-3 py-2"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {(builder.tiers ?? []).map((tier, index) => {
                          // El "desde" no se escribe: es el "hasta" del tramo anterior. Pedirlo
                          // permitiría dejar huecos o solapes entre tramos.
                          const desde = index === 0
                            ? '0'
                            : String(((builder.tiers ?? [])[index - 1]?.upTo ?? 0) + 1);
                          return (
                            <tr key={index}>
                              <td className="px-3 py-1.5 text-slate-500">{desde}</td>
                              <td className="px-3 py-1.5">
                                <input
                                  type="number"
                                  value={tier.upTo === null ? '' : String(tier.upTo)}
                                  placeholder="sin límite"
                                  onChange={(e) => {
                                    const raw = e.target.value.trim();
                                    const next = [...(builder.tiers ?? [])];
                                    next[index] = { ...tier, upTo: raw === '' ? null : Number(raw) };
                                    setBuilderField('tiers', next);
                                  }}
                                  className="w-32 px-2 py-1 border border-slate-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                                />
                              </td>
                              <td className="px-3 py-1.5">
                                <input
                                  value={tier.amount}
                                  onChange={(e) => {
                                    const next = [...(builder.tiers ?? [])];
                                    next[index] = { ...tier, amount: e.target.value };
                                    setBuilderField('tiers', next);
                                  }}
                                  className="w-28 px-2 py-1 border border-slate-200 rounded text-sm font-mono focus:outline-none focus:ring-2 focus:ring-teal-500"
                                />
                              </td>
                              <td className="px-3 py-1.5 text-right">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setBuilderField(
                                    'tiers',
                                    (builder.tiers ?? []).filter((_, i) => i !== index),
                                  )}
                                >
                                  <i className="ri-delete-bin-line"></i>
                                </Button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex items-center gap-3">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => setBuilderField('tiers', [...(builder.tiers ?? []), emptyTier()])}
                    >
                      <i className="ri-add-line mr-1"></i> Agregar tramo
                    </Button>
                    {builderErrors.tiers && (
                      <span className="text-xs text-red-600">{builderErrors.tiers}</span>
                    )}
                  </div>
                </div>
              )}

              {builder.operator === 'PERCENT' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                  <Select
                    label="Base del porcentaje *"
                    value={(builder.percentBase?.of ?? 'RUNNING_SUBTOTAL') as BaseType}
                    onChange={(e) => {
                      const of = e.target.value as BaseType;
                      const base: BaseRef = of === 'STAGE_SUBTOTAL'
                        ? { of, stage: 'BASE' }
                        : of === 'RULE'
                          ? { of, ruleCode: '' }
                          : { of: 'RUNNING_SUBTOTAL' };
                      setBuilderField('percentBase', base);
                    }}
                    options={[
                      { value: 'RUNNING_SUBTOTAL', label: 'El subtotal acumulado hasta esta regla' },
                      { value: 'STAGE_SUBTOTAL', label: 'El subtotal de una etapa' },
                      { value: 'RULE', label: 'El monto de otra regla' },
                    ]}
                    error={builderErrors.percentBase}
                  />
                  {builder.percentBase?.of === 'STAGE_SUBTOTAL' && (
                    <Select
                      label="Etapa base"
                      value={builder.percentBase.stage}
                      onChange={(e) => setBuilderField('percentBase', { of: 'STAGE_SUBTOTAL', stage: e.target.value as Stage })}
                      options={STAGE_OPTIONS}
                    />
                  )}
                  {builder.percentBase?.of === 'RULE' && (
                    <Input
                      label="Código de la otra regla"
                      value={builder.percentBase.ruleCode}
                      onChange={(e) => setBuilderField('percentBase', { of: 'RULE', ruleCode: e.target.value })}
                    />
                  )}
                </div>
              )}

              {/* A3: tope y piso sobre el resultado ya calculado, para cualquier operador — "el
                  recargo no puede pasar de X" es el pedido que hoy exige JSON. */}
              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                <Input
                  label={`Piso — no baja de (${currencyLabel})`}
                  value={builder.clamp?.min ?? ''}
                  onChange={(e) => setBuilderField('clamp', { ...builder.clamp, min: e.target.value })}
                  placeholder="sin piso"
                />
                <Input
                  label={`Tope — no pasa de (${currencyLabel})`}
                  value={builder.clamp?.max ?? ''}
                  onChange={(e) => setBuilderField('clamp', { ...builder.clamp, max: e.target.value })}
                  placeholder="sin tope"
                  error={builderErrors.clamp}
                />
              </div>

              {/* Vista previa: lo que la regla va a hacer, en castellano */}
              <div className="mt-4 bg-teal-50 border border-teal-200 rounded-lg px-4 py-3 space-y-2">
                <div className="flex items-start gap-2">
                  <i className="ri-double-quotes-l text-teal-600 mt-0.5"></i>
                  <p className="text-sm text-teal-900 font-medium">{autoDescription}</p>
                </div>
                {usedVars.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1">
                    <span className="text-xs text-teal-700">Variables usadas:</span>
                    {usedVars.map((v) => (
                      <Badge key={v} variant="info" size="sm">{varLabel(v, customLabels)}</Badge>
                    ))}
                  </div>
                )}
                {missingVars.length > 0 && (
                  <p className="text-xs text-red-600">
                    <i className="ri-error-warning-line mr-1"></i>
                    Esta compañía no tiene declaradas: {missingVars.join(', ')}
                  </p>
                )}
              </div>

              {/* Prueba rápida */}
              <div className="mt-3 flex flex-wrap items-end gap-3">
                {builder.operator !== 'FIXED' && (
                  <div className="w-56">
                    <Input
                      label={`Probar con ${builder.variable ? varLabel(builder.variable, customLabels).toLowerCase() : 'la variable'} =`}
                      type="number"
                      value={probeValue}
                      onChange={(e) => setProbeValue(e.target.value)}
                    />
                  </div>
                )}
                <Button type="button" variant="secondary" onClick={runProbe}>
                  <i className="ri-flask-line mr-1"></i> Probar
                </Button>
                {probeResult && (
                  <span className="text-sm text-slate-700 pb-2">
                    Esta regla aportaría <strong>{probeResult}</strong>
                  </span>
                )}
              </div>
            </section>
          ) : (
            <section className="border-t border-gray-200 pt-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Expresión (JSON del motor)</h3>
              <textarea
                value={advancedExpressionJson}
                onChange={(e) => setAdvancedExpressionJson(e.target.value)}
                rows={6}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                Para escalones, mínimos/máximos, condicionales y tarifas por zona — lo que el
                formulario simple no cubre. Se valida al guardar.
              </p>
            </section>
          )}

          {/* ── Descripción y motivo ──────────────────────────────────────────────────────── */}
          <section className="border-t border-gray-200 pt-4 space-y-3">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="rule-description" className="block text-sm font-medium text-slate-700">Descripción</label>
                {descriptionTouched && (
                  <button
                    type="button"
                    onClick={() => { setDescriptionTouched(false); setDescription(''); }}
                    className="text-xs text-teal-600 hover:underline cursor-pointer"
                  >
                    Volver a la automática
                  </button>
                )}
              </div>
              <textarea
                id="rule-description"
                value={effectiveDescription}
                onChange={(e) => { setDescriptionTouched(true); setDescription(e.target.value); }}
                rows={2}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
              {!descriptionTouched && (
                <p className="text-xs text-gray-500 mt-1">Se escribe sola desde el cálculo. Editala si querés otra redacción.</p>
              )}
            </div>

            <Input
              label="Motivo"
              value={formData.reason}
              onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
              placeholder="Acuerdo con el transportista de agosto 2026"
            />
          </section>

          {/* ── Vigencia ──────────────────────────────────────────────────────────────────── */}
          <section className="border-t border-gray-200 pt-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-1">Desde y hasta cuándo rige</h3>
            <p className="text-xs text-gray-500 mb-3">
              Se compara contra la <strong>fecha del viaje</strong>, no contra hoy. Un viaje de
              agosto se sigue liquidando con la tarifa de agosto aunque el acuerdo ya haya cambiado.
              Dejalas vacías si la regla no tiene vencimiento.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Rige desde"
                type="date"
                value={formData.effective_from}
                onChange={(e) => setFormData({ ...formData, effective_from: e.target.value })}
              />
              <Input
                label="Rige hasta"
                type="date"
                value={formData.effective_to}
                onChange={(e) => setFormData({ ...formData, effective_to: e.target.value })}
              />
            </div>
            {periodoInvertido && (
              <p className="text-xs text-red-600 mt-2">
                <i className="ri-error-warning-line mr-1"></i>
                La fecha de fin es anterior a la de inicio: así la regla no aplicaría nunca.
              </p>
            )}
            <p className="text-xs text-gray-500 mt-2">
              Ambos días quedan <strong>incluidos</strong>. Vencerla no es lo mismo que desactivarla:
              una regla vencida sigue aplicando a los viajes anteriores a su fecha de fin, y una
              inactiva no aplica a ninguno.
            </p>
          </section>

          {/* ── Competencia con otras reglas ──────────────────────────────────────────────── */}
          <section className="border-t border-gray-200 pt-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Cómo convive con las demás reglas</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Select
                label="Etapa del cálculo *"
                value={formData.stage}
                onChange={(e) => setFormData({ ...formData, stage: e.target.value as Stage })}
                options={STAGE_OPTIONS}
              />
              <Select
                label="¿Se suma o compite? *"
                value={formData.stacking}
                onChange={(e) => setFormData({ ...formData, stacking: e.target.value as 'SUM' | 'MAX' | 'EXCLUSIVE' })}
                options={STACKING_OPTIONS}
              />
              {formData.stacking === 'MAX' && (
                <Input
                  label="Grupo con el que compite"
                  value={formData.exclusion_group}
                  onChange={(e) => setFormData({ ...formData, exclusion_group: e.target.value })}
                  placeholder="recargo_incidentes"
                />
              )}
              {formData.stacking !== 'SUM' && (
                <Input
                  label="Prioridad (menor = gana)"
                  type="number"
                  value={String(formData.priority)}
                  onChange={(e) => setFormData({ ...formData, priority: Number(e.target.value) })}
                />
              )}
              <label className="flex items-center gap-2 text-sm text-slate-700 pb-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.active}
                  onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                  className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                />
                Regla activa
              </label>
            </div>
          </section>

          <div className="flex justify-end gap-3 pt-2 border-t border-gray-200">
            <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>Cancelar</Button>
            <Button type="submit" disabled={loading}>{loading ? 'Guardando…' : rule ? 'Guardar cambios' : 'Crear regla'}</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
