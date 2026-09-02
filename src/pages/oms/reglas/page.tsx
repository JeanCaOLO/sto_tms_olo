import Card from '../../../components/base/Card';
import Badge from '../../../components/base/Badge';
import Button from '../../../components/base/Button';
import RuleFormModal from './RuleFormModal';
import { useReglasController } from './useReglasController';

const OPERATOR_LABEL: Record<string, string> = {
  igual: '=', distinto: '≠', mayor: '>', menor: '<',
  'mayor-igual': '≥', 'menor-igual': '≤', contiene: 'contiene',
};

// Pantalla Motor de Reglas (FR5): perfiles + reglas configurables (mock).
export default function OmsReglasPage() {
  const {
    profiles, activeProfile, setActiveProfile, rulesInProfile, loading, error,
    toggleRule, modalOpen, setModalOpen, addRule,
  } = useReglasController();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Motor de Reglas</h1>
          <p className="text-sm text-slate-600 mt-1">Reglas de priorización configurables por perfil</p>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center h-64">
          <i className="ri-loader-4-line animate-spin text-teal-600 text-2xl"></i>
        </div>
      )}
      {!loading && error && <Card><p className="text-sm text-red-600">{error}</p></Card>}

      {!loading && !error && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <Card className="lg:col-span-1">
            <h2 className="text-sm font-semibold text-slate-900 mb-3">Perfiles</h2>
            <ul className="space-y-1">
              {profiles.map((p) => (
                <li key={p}>
                  <button
                    onClick={() => setActiveProfile(p)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm cursor-pointer transition-colors ${
                      p === activeProfile ? 'bg-teal-600 text-white' : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {p}
                  </button>
                </li>
              ))}
            </ul>
          </Card>

          <Card className="lg:col-span-3" padding={false}>
            <div className="flex items-center justify-between p-6 pb-4">
              <h2 className="text-lg font-semibold text-slate-900">Reglas de {activeProfile}</h2>
              <Button size="sm" icon={<i className="ri-add-line"></i>} onClick={() => setModalOpen(true)}>Nueva regla</Button>
            </div>
            {rulesInProfile.length === 0 ? (
              <div className="text-center py-10 text-slate-500">
                <i className="ri-list-check-2 text-3xl"></i>
                <p className="mt-2 text-sm">Este perfil no tiene reglas.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Estado</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Nombre</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Condición</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Peso</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rulesInProfile.sort((a, b) => b.weight - a.weight).map((r) => (
                      <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="py-3 px-4">
                          <button onClick={() => toggleRule(r.id)} className="cursor-pointer" aria-label={r.active ? 'Desactivar regla' : 'Activar regla'}>
                            <Badge variant={r.active ? 'success' : 'default'}>{r.active ? 'Activa' : 'Inactiva'}</Badge>
                          </button>
                        </td>
                        <td className="py-3 px-4 text-sm font-medium text-slate-900">{r.name}</td>
                        <td className="py-3 px-4 text-sm text-slate-600">
                          <code className="text-xs">{r.field} {OPERATOR_LABEL[r.operator]} {r.value}</code>
                        </td>
                        <td className="py-3 px-4 text-sm font-semibold text-slate-900">{r.weight}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}

      {modalOpen && (
        <RuleFormModal profile={activeProfile} onSave={addRule} onCancel={() => setModalOpen(false)} />
      )}
    </div>
  );
}
