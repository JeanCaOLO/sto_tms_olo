import { useEffect, useMemo, useState } from 'react';
import Card from '../../../components/base/Card';
import Button from '../../../components/base/Button';
import Select from '../../../components/base/Select';
import Input from '../../../components/base/Input';
import Badge from '../../../components/base/Badge';
import PriorityBadge from '../components/PriorityBadge';
import ViewToggle from '../components/ViewToggle';
import Pagination from '../components/Pagination';
import { useOmsView } from '../useOmsView';
import { usePagination } from '../usePagination';
import { omsApi } from '../api/omsApi';
import { queueOrders } from '../mockData';
import {
  APPLY_MODE_LABEL, SITUATION_OPTIONS,
  companyOptions,
  type ApplyMode, type Company, type EngineRule, type OrderSituation,
  type QueueOrder, type Simulation, type SimulationExecution,
} from '../types';
import { runSimulation, type SimulatedOrder } from './simulate';

const money = (n: number) => n.toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nowStamp = () => new Date().toISOString().slice(0, 16).replace('T', ' ');

// Pantalla Simulador (DECIDED 2026-09-15): CONFIGURADOR de simulaciones.
// Una simulación es una CONFIGURACIÓN CON NOMBRE guardada (reglas + filtro de
// situación + modo de aplicación). Solo una activa por compañía: la activa es la
// que se ejecuta. El preview corre esa config sobre los pedidos (efímero) y
// registra una entrada en el HISTORIAL de ejecuciones (al final).
// PROTOTIPO: datos y persistencia mock (localStorage vía omsApi).
export default function OmsSimuladorPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState('');
  const [rules, setRules] = useState<EngineRule[]>([]);
  const [sims, setSims] = useState<Simulation[]>([]);
  const [executions, setExecutions] = useState<SimulationExecution[]>([]);
  const [loading, setLoading] = useState(true);

  const [editing, setEditing] = useState<Simulation | null>(null); // simulación en edición (o nueva)
  const [modalOpen, setModalOpen] = useState(false);
  const [preview, setPreview] = useState<{ sim: Simulation; rows: SimulatedOrder[] } | null>(null);

  const catalogView = useOmsView('cards');
  const previewView = useOmsView('cards');
  const historyView = useOmsView('cards');

  // Paginación de la preview (misma UX que la Cola). Pagina el resultado de la
  // corrida; el slice alimenta tanto la vista de tabla como la de cards.
  const previewPg = usePagination(preview?.rows ?? [], 10);

  useEffect(() => {
    Promise.all([omsApi.getCompanies(), omsApi.getEngineRules()])
      .then(([c, r]) => {
        setCompanies(c);
        setRules(r);
        setCompanyId((prev) => prev || c[0]?.id || '');
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!companyId) return;
    setPreview(null);
    Promise.all([omsApi.getSimulations(companyId), omsApi.getExecutions(companyId)])
      .then(([s, e]) => { setSims(s); setExecutions(e); });
  }, [companyId]);

  const companyRules = useMemo(() => rules.filter((r) => r.company === companyId), [rules, companyId]);
  const ruleName = (id: string) => companyRules.find((r) => r.id === id)?.name ?? id;
  const universe: QueueOrder[] = useMemo(() => queueOrders.filter((o) => o.country === 'CR'), []);

  const openNew = () => {
    setEditing({
      id: `SIM-${Date.now()}`, companyId, name: '', ruleIds: companyRules.filter((r) => r.active).map((r) => r.id),
      situations: ['DISP'], applyMode: 'manual', cutoffTime: '15:00', active: false,
    });
    setModalOpen(true);
  };
  const openEdit = (sim: Simulation) => { setEditing(sim); setModalOpen(true); };

  const onSave = async (sim: Simulation) => {
    await omsApi.saveSimulation(sim);
    setSims(await omsApi.getSimulations(companyId));
    setModalOpen(false);
    setEditing(null);
  };

  const onActivate = async (simId: string) => {
    setSims(await omsApi.activateSimulation(companyId, simId));
  };

  const onPreview = async (sim: Simulation) => {
    const rows = runSimulation(universe, companyRules, { ruleIds: sim.ruleIds, situations: sim.situations });
    setPreview({ sim, rows });
    await omsApi.logExecution({
      id: `EXE-${Date.now()}`, companyId, simulationId: sim.id, simulationName: sim.name,
      executedAt: nowStamp(), trigger: 'manual', affectedCount: rows.length,
    });
    setExecutions(await omsApi.getExecutions(companyId));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Simulador de Priorización</h1>
          <p className="text-sm text-slate-600 mt-1">
            Define, previsualiza y aplica simulaciones de priorización por compañía
          </p>
        </div>
        <div className="flex items-end gap-3">
          <div className="w-full sm:w-48">
            <Select
              label="Compañía"
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
              options={companyOptions(companies)}
            />
          </div>
          <Button icon={<i className="ri-add-line"></i>} onClick={openNew} disabled={loading || companyRules.length === 0}>
            Nueva simulación
          </Button>
        </div>
      </div>

      {/* Catálogo de simulaciones guardadas */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">Simulaciones guardadas</h2>
        {sims.length > 0 && <ViewToggle view={catalogView.view} onChange={catalogView.setView} />}
      </div>
      <Card padding={false}>
        {sims.length === 0 ? (
          <div className="text-center py-12 text-slate-500">
            <i className="ri-flask-line text-3xl"></i>
            <p className="mt-2 text-sm">No hay simulaciones guardadas para esta compañía.</p>
          </div>
        ) : catalogView.view === 'table' ? (
          <div className="overflow-x-auto">
            <table className="w-full whitespace-nowrap">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Nombre</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Reglas</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Situaciones</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Modo</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Hora corte</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Estado</th>
                  <th className="text-right py-3 px-4 text-sm font-semibold text-slate-700">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {sims.map((s) => (
                  <tr key={s.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-3 px-4 text-sm font-medium text-slate-900">{s.name}</td>
                    <td className="py-3 px-4 text-sm text-slate-600">{s.ruleIds.length}</td>
                    <td className="py-3 px-4 text-sm text-slate-600">{s.situations.join(', ')}</td>
                    <td className="py-3 px-4 text-sm text-slate-700">{APPLY_MODE_LABEL[s.applyMode]}</td>
                    <td className="py-3 px-4 text-sm text-slate-700">{s.applyMode === 'manual' ? '—' : s.cutoffTime}</td>
                    <td className="py-3 px-4">
                      <Badge variant={s.active ? 'success' : 'default'} size="sm">{s.active ? 'Activa' : 'Inactiva'}</Badge>
                    </td>
                    <td className="py-3 px-4 text-right text-sm whitespace-nowrap">
                      <SimActions sim={s} onActivate={onActivate} onEdit={openEdit} onPreview={onPreview} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 p-4">
            {sims.map((s) => (
              <div key={s.id} className={`rounded-lg border p-4 ${s.active ? 'border-teal-400 bg-teal-50' : 'border-slate-200'}`}>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <span className="font-semibold text-slate-900">{s.name}</span>
                  <Badge variant={s.active ? 'success' : 'default'} size="sm">{s.active ? 'Activa' : 'Inactiva'}</Badge>
                </div>
                <div className="text-sm space-y-1.5">
                  <div className="flex justify-between gap-3"><span className="text-slate-500">Reglas</span><span className="text-slate-900">{s.ruleIds.length}</span></div>
                  <div className="flex justify-between gap-3"><span className="text-slate-500">Situaciones</span><span className="text-slate-900">{s.situations.join(', ')}</span></div>
                  <div className="flex justify-between gap-3"><span className="text-slate-500">Modo</span><span className="text-slate-900">{APPLY_MODE_LABEL[s.applyMode]}</span></div>
                  <div className="flex justify-between gap-3"><span className="text-slate-500">Hora corte</span><span className="text-slate-900">{s.applyMode === 'manual' ? '—' : s.cutoffTime}</span></div>
                </div>
                <div className="flex justify-end mt-3 pt-3 border-t border-slate-100">
                  <SimActions sim={s} onActivate={onActivate} onEdit={openEdit} onPreview={onPreview} />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Preview de la simulación ejecutada — tabla estilo Cola con toggle */}
      {preview && (
        <>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">
              Previsualización · {preview.sim.name} <span className="text-slate-400 font-normal">({preview.rows.length} pedidos)</span>
            </h2>
            <ViewToggle view={previewView.view} onChange={previewView.setView} />
          </div>
          <Card padding={false}>
            {previewView.view === 'table' ? (
              <div className="overflow-x-auto">
                <table className="w-full whitespace-nowrap">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Prioridad</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Pedido</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">ID Almacén</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">ID Compañía</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">ID Sucursal</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Tipo de Orden</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Cliente</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Ruta</th>
                      <th className="text-right py-3 px-4 text-sm font-semibold text-slate-700">Monto Total</th>
                      <th className="text-right py-3 px-4 text-sm font-semibold text-slate-700">Peso (kg)</th>
                      <th className="text-right py-3 px-4 text-sm font-semibold text-slate-700">Volumen (m³)</th>
                      <th className="text-right py-3 px-4 text-sm font-semibold text-slate-700">N.º artículos</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Observaciones</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Fecha Despacho</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Fecha creación</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Fecha Alisto</th>
                      <th className="text-right py-3 px-4 text-sm font-semibold text-slate-700">Score base</th>
                      <th className="text-right py-3 px-4 text-sm font-semibold text-slate-700">Score simulado</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Estado</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Situación</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewPg.pageItems.map((o) => (
                      <tr key={o.id} className="border-b border-slate-100">
                        <td className="py-3 px-4"><PriorityBadge tier={o.tier} /></td>
                        <td className="py-3 px-4 text-sm font-medium text-slate-900">{o.id}</td>
                        <td className="py-3 px-4 text-sm text-slate-700">{o.warehouseId}</td>
                        <td className="py-3 px-4 text-sm text-slate-700">{o.companyId}</td>
                        <td className="py-3 px-4 text-sm text-slate-700">{o.branchId}</td>
                        <td className="py-3 px-4 text-sm text-slate-700">{o.orderType}</td>
                        <td className="py-3 px-4 text-sm text-slate-700">{o.customer}</td>
                        <td className="py-3 px-4 text-sm text-slate-700">{o.route}</td>
                        <td className="py-3 px-4 text-sm text-slate-700 text-right">{money(o.totalAmount)}</td>
                        <td className="py-3 px-4 text-sm text-slate-700 text-right">{o.weight.toFixed(1)}</td>
                        <td className="py-3 px-4 text-sm text-slate-700 text-right">{o.volume.toFixed(1)}</td>
                        <td className="py-3 px-4 text-sm text-slate-700 text-right">{o.itemCount}</td>
                        <td className="py-3 px-4 text-sm text-slate-600 max-w-[220px] truncate" title={o.observations}>{o.observations}</td>
                        <td className="py-3 px-4 text-sm text-slate-700">{o.dispatchDate}</td>
                        <td className="py-3 px-4 text-sm text-slate-700">{o.createdDate}</td>
                        <td className="py-3 px-4 text-sm text-slate-700">{o.readyToPrepDate}</td>
                        <td className="py-3 px-4 text-sm text-slate-500 text-right">{o.baseScore}</td>
                        <td className="py-3 px-4 text-sm font-semibold text-slate-900 text-right">{o.simScore}</td>
                        <td className="py-3 px-4 text-sm text-slate-600">{o.status}</td>
                        <td className="py-3 px-4 text-sm text-slate-600">{o.situation}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <Pagination {...previewPg} shown={previewPg.pageItems.length} noun="pedidos" />
              </div>
            ) : (
              <div>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 p-4">
                {previewPg.pageItems.map((o) => (
                  <div key={o.id} className="rounded-lg border border-slate-200 p-4">
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <span className="font-semibold text-slate-900">{o.id}</span>
                      <PriorityBadge tier={o.tier} />
                    </div>
                    <div className="text-sm space-y-1.5">
                      <div className="flex justify-between gap-3"><span className="text-slate-500">Cliente</span><span className="text-slate-900 text-right truncate">{o.customer}</span></div>
                      <div className="flex justify-between gap-3"><span className="text-slate-500">Ruta</span><span className="text-slate-900 text-right">{o.route}</span></div>
                      <div className="flex justify-between gap-3"><span className="text-slate-500">Almacén / Cía / Suc.</span><span className="text-slate-900 text-right">{o.warehouseId} / {o.companyId} / {o.branchId}</span></div>
                      <div className="flex justify-between gap-3"><span className="text-slate-500">Monto Total</span><span className="text-slate-900 text-right">{money(o.totalAmount)}</span></div>
                      <div className="flex justify-between gap-3"><span className="text-slate-500">Peso / Volumen</span><span className="text-slate-900 text-right">{o.weight.toFixed(1)} kg · {o.volume.toFixed(1)} m³</span></div>
                      <div className="flex justify-between gap-3"><span className="text-slate-500">Score base → sim.</span><span className="text-slate-900 text-right">{o.baseScore} → <span className="font-semibold">{o.simScore}</span></span></div>
                      <div className="flex justify-between gap-3"><span className="text-slate-500">Estado / Situación</span><span className="text-slate-900 text-right">{o.status} · {o.situation}</span></div>
                    </div>
                  </div>
                ))}
              </div>
              <Pagination {...previewPg} shown={previewPg.pageItems.length} noun="pedidos" />
              </div>
            )}
          </Card>
        </>
      )}

      {/* Historial de ejecuciones — al final */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">Historial de ejecuciones</h2>
        {executions.length > 0 && <ViewToggle view={historyView.view} onChange={historyView.setView} />}
      </div>
      <Card padding={false}>
        {executions.length === 0 ? (
          <p className="p-4 text-sm text-slate-500">Sin ejecuciones registradas para esta compañía.</p>
        ) : historyView.view === 'table' ? (
          <div className="overflow-x-auto">
            <table className="w-full whitespace-nowrap">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Fecha</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Simulación</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Origen</th>
                  <th className="text-right py-3 px-4 text-sm font-semibold text-slate-700">Pedidos</th>
                </tr>
              </thead>
              <tbody>
                {executions.map((e) => (
                  <tr key={e.id} className="border-b border-slate-100">
                    <td className="py-3 px-4 text-sm text-slate-500">{e.executedAt}</td>
                    <td className="py-3 px-4 text-sm font-medium text-slate-900">{e.simulationName || '—'}</td>
                    <td className="py-3 px-4 text-sm text-slate-700">{e.trigger === 'manual' ? 'Manual' : 'Automático'}</td>
                    <td className="py-3 px-4 text-sm text-slate-700 text-right">{e.affectedCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 p-4">
            {executions.map((e) => (
              <div key={e.id} className="rounded-lg border border-slate-200 p-4">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="font-semibold text-slate-900">{e.simulationName || '—'}</span>
                  <span className="text-xs text-slate-500">{e.trigger === 'manual' ? 'Manual' : 'Automático'}</span>
                </div>
                <div className="text-sm space-y-1.5">
                  <div className="flex justify-between gap-3"><span className="text-slate-500">Fecha</span><span className="text-slate-900">{e.executedAt}</span></div>
                  <div className="flex justify-between gap-3"><span className="text-slate-500">Pedidos</span><span className="text-slate-900">{e.affectedCount}</span></div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {modalOpen && editing && (
        <SimulationModal
          sim={editing}
          companyRules={companyRules}
          ruleName={ruleName}
          onSave={onSave}
          onCancel={() => { setModalOpen(false); setEditing(null); }}
        />
      )}
    </div>
  );
}

// Acciones de una fila/card del catálogo.
function SimActions({ sim, onActivate, onEdit, onPreview }: {
  sim: Simulation;
  onActivate: (id: string) => void;
  onEdit: (sim: Simulation) => void;
  onPreview: (sim: Simulation) => void;
}) {
  return (
    <span className="inline-flex items-center gap-3">
      <button onClick={() => onPreview(sim)} className="text-teal-600 hover:text-teal-700 cursor-pointer">Previsualizar</button>
      <button onClick={() => onEdit(sim)} className="text-slate-600 hover:text-slate-800 cursor-pointer">Editar</button>
      {sim.active ? (
        <span className="text-slate-400">Activa</span>
      ) : (
        <button onClick={() => onActivate(sim.id)} className="text-slate-600 hover:text-slate-800 cursor-pointer">Activar</button>
      )}
    </span>
  );
}

// Modal Nueva/Editar simulación: nombre + reglas (con seleccionar todas) +
// filtro situación + modo de aplicación + hora de corte condicional.
function SimulationModal({ sim, companyRules, ruleName, onSave, onCancel }: {
  sim: Simulation;
  companyRules: EngineRule[];
  ruleName: (id: string) => string;
  onSave: (sim: Simulation) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(sim.name);
  const [ruleIds, setRuleIds] = useState<string[]>(sim.ruleIds);
  const [situations, setSituations] = useState<OrderSituation[]>(sim.situations);
  const [applyMode, setApplyMode] = useState<ApplyMode>(sim.applyMode);
  const [cutoffTime, setCutoffTime] = useState(sim.cutoffTime);

  void ruleName;
  const toggleRule = (id: string) => setRuleIds((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const toggleSituation = (s: OrderSituation) => setSituations((p) => (p.includes(s) ? p.filter((x) => x !== s) : [...p, s]));
  const allSelected = companyRules.length > 0 && ruleIds.length === companyRules.length;
  const needsCutoff = applyMode !== 'manual';
  const canSave = name.trim() !== '' && ruleIds.length > 0 && situations.length > 0;

  const submit = () => onSave({ ...sim, name: name.trim(), ruleIds, situations, applyMode, cutoffTime });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40" role="dialog" aria-modal="true" aria-label="Configurar simulación">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto scrollbar-hide">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-slate-900">{sim.name ? 'Editar simulación' : 'Nueva simulación'}</h3>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-600 cursor-pointer" aria-label="Cerrar">
            <i className="ri-close-line text-xl"></i>
          </button>
        </div>

        <div className="mb-4">
          <Input label="Nombre" placeholder="p. ej. Cofersa — diaria T-1" value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        <div className="mb-5">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-semibold text-slate-900">Reglas incluidas</h4>
            <button
              onClick={() => setRuleIds(allSelected ? [] : companyRules.map((r) => r.id))}
              className="text-xs text-teal-600 hover:text-teal-700 cursor-pointer"
            >
              {allSelected ? 'Deseleccionar todas' : 'Seleccionar todas'}
            </button>
          </div>
          <div className="space-y-1.5">
            {companyRules.map((r) => (
              <label key={r.id} className="flex items-start gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={ruleIds.includes(r.id)} onChange={() => toggleRule(r.id)} className="mt-1 accent-teal-600" />
                <span><span className="font-medium text-slate-900">{r.name}</span> <span className="text-slate-400">· peso {r.weight}{r.active ? '' : ' · inactiva'}</span></span>
              </label>
            ))}
          </div>
        </div>

        <div className="mb-5">
          <h4 className="text-sm font-semibold text-slate-900 mb-2">Filtro de pedidos por situación</h4>
          <div className="flex gap-2">
            {SITUATION_OPTIONS.map((s) => (
              <button
                key={s}
                onClick={() => toggleSituation(s)}
                className={`px-3 py-1.5 rounded-lg text-sm cursor-pointer transition-colors border ${
                  situations.includes(s) ? 'bg-teal-600 text-white border-teal-600' : 'text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Select
            label="Modo de aplicación"
            value={applyMode}
            onChange={(e) => setApplyMode(e.target.value as ApplyMode)}
            options={[
              { value: 'manual', label: APPLY_MODE_LABEL.manual },
              { value: 'automatico', label: APPLY_MODE_LABEL.automatico },
              { value: 'mixto', label: APPLY_MODE_LABEL.mixto },
            ]}
          />
          {needsCutoff && (
            <Input label="Hora de corte" type="time" value={cutoffTime} onChange={(e) => setCutoffTime(e.target.value)} />
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel}>Cancelar</Button>
          <Button variant="primary" icon={<i className="ri-save-line"></i>} onClick={submit} disabled={!canSave}>Guardar</Button>
        </div>
      </div>
    </div>
  );
}
