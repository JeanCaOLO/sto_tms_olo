import { useState } from 'react';
import { Link } from 'react-router-dom';
import Card from '../../../components/base/Card';
import Badge from '../../../components/base/Badge';
import Button from '../../../components/base/Button';
import RuleParamsModal from './RuleParamsModal';
import { useReglasController } from './useReglasController';

// Pantalla Motor de Reglas (FR5) — catálogo semi-configurable.
// Reglas implementadas (lógica en código): activar/desactivar, ajustar peso,
// editar parámetros, configurar por compañía; aloja la tabla de prioridades.
export default function OmsReglasPage() {
  const {
    rules, companies, priorityTable, loading, error,
    toggleRule, setWeight,
    editingId, setEditingId, editingRule, saveParams,
    toggleCompany,
  } = useReglasController();

  // Edición local del peso por fila (buffer para el input numérico).
  const [weightDraft, setWeightDraft] = useState<Record<string, string>>({});

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Motor de Reglas</h1>
          <p className="text-sm text-slate-600 mt-1">
            Catálogo de reglas implementadas — la lógica vive en código; aquí se activan, se ajusta su peso y sus parámetros
          </p>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center h-64">
          <i className="ri-loader-4-line animate-spin text-teal-600 text-2xl"></i>
        </div>
      )}
      {!loading && error && <Card><p className="text-sm text-red-600">{error}</p></Card>}

      {!loading && !error && (
        <>
          {/* Catálogo de reglas */}
          <Card padding={false}>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Regla</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Descripción</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Estado</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Peso/Score</th>
                    <th className="text-right py-3 px-4 text-sm font-semibold text-slate-700">Parámetros</th>
                  </tr>
                </thead>
                <tbody>
                  {rules.map((r) => (
                    <tr key={r.id} className={`border-b border-slate-100 align-top ${r.active ? '' : 'opacity-60'}`}>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-slate-500">{r.order}.</span>
                          <span className="text-sm font-medium text-slate-900">{r.name}</span>
                        </div>
                        {r.firstDelivery && (
                          <Badge variant="info" size="sm">Primera entrega</Badge>
                        )}
                      </td>
                      <td className="py-3 px-4 text-sm text-slate-600 max-w-md">{r.description}</td>
                      <td className="py-3 px-4">
                        <button
                          onClick={() => toggleRule(r.id)}
                          className="cursor-pointer"
                          aria-label={r.active ? 'Desactivar regla' : 'Activar regla'}
                          aria-pressed={r.active}
                        >
                          <span className={`inline-flex items-center h-6 w-11 rounded-full transition-colors ${r.active ? 'bg-teal-600' : 'bg-slate-300'}`}>
                            <span className={`inline-block w-5 h-5 bg-white rounded-full shadow transform transition-transform ${r.active ? 'translate-x-5' : 'translate-x-0.5'}`}></span>
                          </span>
                        </button>
                        <div className="text-xs text-slate-500 mt-1">{r.active ? 'Activa' : 'Inactiva'}</div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min={0}
                            max={1000}
                            value={weightDraft[r.id] ?? String(r.weight)}
                            onChange={(e) => setWeightDraft((d) => ({ ...d, [r.id]: e.target.value }))}
                            onBlur={(e) => setWeight(r.id, Number(e.target.value) || 0)}
                            className="w-20 px-2 py-1 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                            aria-label={`Peso de ${r.name}`}
                          />
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <Button variant="ghost" size="sm" icon={<i className="ri-settings-3-line"></i>} onClick={() => setEditingId(r.id)}>
                          Parámetros
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="px-4 py-3 text-xs text-slate-500 border-t border-slate-100">
              <i className="ri-lock-2-line mr-1"></i>
              La lógica de cada regla está implementada en código (solo lectura). No se crean ni editan reglas nuevas desde la interfaz.
            </p>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Configuración por compañía */}
            <Card>
              <h2 className="text-lg font-semibold text-slate-900 mb-1">Configuración por compañía</h2>
              <p className="text-sm text-slate-600 mb-4">Qué compañías participan en la priorización.</p>
              <div className="space-y-2">
                {companies.map((c) => (
                  <div key={c.id} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                    <div>
                      <span className="text-sm font-medium text-slate-900">{c.name}</span>
                      <span className="text-xs text-slate-500 ml-2">({c.id})</span>
                    </div>
                    <button onClick={() => toggleCompany(c.id)} className="cursor-pointer flex items-center gap-2" aria-pressed={c.prioritizes}>
                      <span className="text-xs text-slate-500">{c.prioritizes ? 'Prioriza' : 'No prioriza'}</span>
                      <span className={`inline-flex items-center h-6 w-11 rounded-full transition-colors ${c.prioritizes ? 'bg-teal-600' : 'bg-slate-300'}`}>
                        <span className={`inline-block w-5 h-5 bg-white rounded-full shadow transform transition-transform ${c.prioritizes ? 'translate-x-5' : 'translate-x-0.5'}`}></span>
                      </span>
                    </button>
                  </div>
                ))}
              </div>
              <p className="text-xs text-slate-500 mt-3">Ej.: EPA opera por cross docking y no requiere priorización; Cofersa sí.</p>
            </Card>

            {/* Tabla de prioridades + override */}
            <Card>
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-lg font-semibold text-slate-900">Tabla de prioridades</h2>
                <span className="text-xs text-slate-500">1 = más urgente</span>
              </div>
              <p className="text-sm text-slate-600 mb-4">Niveles (1..N) que define el cliente.</p>
              <div className="space-y-2">
                {priorityTable.map((row) => (
                  <div key={row.level} className="flex items-start gap-3 py-1.5 border-b border-slate-100 last:border-0">
                    <span className="w-7 h-7 flex items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-700 shrink-0">{row.level}</span>
                    <div>
                      <p className="text-sm font-medium text-slate-900">{row.label}</p>
                      <p className="text-xs text-slate-500">{row.description}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-900">Override manual</p>
                  <p className="text-xs text-slate-500">Alterar la prioridad de un pedido puntual (rol autorizado).</p>
                </div>
                <Link
                  to="/oms/cola"
                  className="inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <i className="ri-external-link-line"></i>
                  Ir a la Cola
                </Link>
              </div>
            </Card>
          </div>
        </>
      )}

      {editingRule && (
        <RuleParamsModal
          rule={editingRule}
          onSave={(params) => saveParams(editingRule.id, params)}
          onCancel={() => setEditingId(null)}
        />
      )}
    </div>
  );
}
