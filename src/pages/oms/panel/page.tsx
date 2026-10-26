import Badge from '../../../components/base/Badge';
import Button from '../../../components/base/Button';
import Card from '../../../components/base/Card';
import StatCard from '../../../components/feature/StatCard';
import { useOperationalContext } from '../../../hooks/useOperationalContext';
import { actionLabel } from '../auditoria/logLabels';
import { formatFechaHora } from '../fecha';
import type { OmsCorrida } from '../types';
import { usePanelController } from './usePanelController';

// Tiempo relativo legible ("hace 12 min", "hace 2 h", "hace 3 d"). Vacío → '—'.
function haceCuanto(iso: string): string {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'hace un momento';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.floor(h / 24)} d`;
}

const LEVEL_DOT: Record<OmsCorrida['level'], string> = {
  info: 'bg-emerald-500',
  warn: 'bg-amber-500',
  error: 'bg-red-500',
};

const n = (v: number | null) => (v == null ? '—' : v);

// Panel del OMS — dashboard del MOTOR (ADR-013). Tres bloques sobre datos reales:
//  1) embudo del día (orders): en cola → priorizados → liberados hoy;
//  2) latido del motor (oms_logs): última corrida + historial + errores;
//  3) por liberar pronto (orders): agenda de salidas priorizadas-no-liberadas.
export default function OmsPanelPage() {
  const { pipeline, proximas, actividad, loading, error, recargar } = usePanelController();
  const { countries, selectedCountryId } = useOperationalContext();
  // Zona horaria del país del contexto (IANA); si no hay país/zona, el helper cae a CR.
  const timeZone = countries.find((c) => c.id === selectedCountryId)?.timezone ?? null;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Panel del OMS</h1>
          <p className="text-sm text-slate-600 mt-1">
            Estado del motor de priorización y liberación a eFlow (datos en vivo).
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={recargar} disabled={loading}>
          <i className={`ri-refresh-line mr-1.5 ${loading ? 'animate-spin' : ''}`}></i>
          Refrescar
        </Button>
      </div>

      {loading && (
        <div className="flex items-center justify-center h-64">
          <i className="ri-loader-4-line animate-spin text-teal-600 text-2xl"></i>
        </div>
      )}

      {!loading && error && (
        <Card className="border-amber-200 bg-amber-50">
          <div className="flex items-center gap-3 text-amber-800">
            <i className="ri-wifi-off-line text-xl"></i>
            <div>
              <p className="text-sm font-medium">No se pudieron cargar los datos del motor.</p>
              <p className="text-xs mt-1">{error}</p>
            </div>
          </div>
        </Card>
      )}

      {!loading && !error && pipeline && (
        <>
          {/* Señal real de error: filas level=error en oms_logs (últimas 24 h). */}
          {actividad && actividad.erroresRecientes > 0 && (
            <Card className="border-red-200 bg-red-50">
              <div className="flex items-center gap-3 text-red-800">
                <i className="ri-error-warning-line text-xl"></i>
                <p className="text-sm font-medium">
                  {actividad.erroresRecientes} error(es) del motor en las últimas 24 h. Revisa la bitácora en Auditoría → Detalle.
                </p>
              </div>
            </Card>
          )}

          {/* Bloque 1 — el embudo del día. */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <StatCard title="En cola" value={pipeline.enCola} icon="ri-inbox-line" color="teal" />
            <StatCard title="Priorizados" value={pipeline.priorizados} icon="ri-flag-line" color="blue" />
            <StatCard title="Liberados a eFlow (hoy)" value={pipeline.liberadosHoy} icon="ri-send-plane-line" color="emerald" />
          </div>
          <p className="-mt-2 text-xs text-slate-500">
            {pipeline.abiertos} pedidos abiertos en total · En cola = esperan la próxima ejecución ·
            Priorizados = con prioridad, esperando su ventana de salida · Liberados = enviados a eFlow hoy.
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Bloque 2 — Historial OMS (corridas automáticas + acciones manuales). */}
            <Card className="lg:col-span-2">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-slate-900">Historial OMS</h2>
                {actividad?.ultima && (
                  <span className="text-xs text-slate-500">
                    Última ejecución {haceCuanto(actividad.ultima.createdAt)}
                  </span>
                )}
              </div>

              {/* Snapshot de la última corrida automática (barrido). */}
              {actividad?.ultima && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                  <Resumen label="Leídos" value={n(actividad.ultima.total)} />
                  <Resumen label="Priorizados" value={n(actividad.ultima.priorizados)} />
                  <Resumen label="Liberados" value={n(actividad.ultima.liberados)} />
                  <Resumen
                    label="Pendientes"
                    value={n(actividad.ultima.pendientes)}
                    warn={(actividad.ultima.pendientes ?? 0) > 0}
                  />
                </div>
              )}

              {!actividad || actividad.corridas.length === 0 ? (
                <p className="text-sm text-slate-500 py-6 text-center">
                  Aún no hay actividad registrada (el OMS escribe aquí cuando corre en vivo).
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-slate-500 border-b border-slate-200">
                        <th className="py-2 pr-3 font-medium">Fecha</th>
                        <th className="py-2 px-3 font-medium">Acción</th>
                        <th className="py-2 px-3 font-medium text-right">Prior.</th>
                        <th className="py-2 px-3 font-medium text-right">Liber.</th>
                        <th className="py-2 px-3 font-medium text-right">Pend.</th>
                        <th className="py-2 pl-3 font-medium">Actor</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {actividad.corridas.map((c) => (
                        <tr key={c.id} className="text-slate-700">
                          <td className="py-2 pr-3">
                            <div className="flex items-center gap-2">
                              <span className={`w-2 h-2 rounded-full shrink-0 ${LEVEL_DOT[c.level]}`} aria-hidden="true"></span>
                              <span className="text-slate-500">{formatFechaHora(c.createdAt, timeZone)}</span>
                            </div>
                          </td>
                          <td className="py-2 px-3">{actionLabel(c.action)}</td>
                          <td className="py-2 px-3 text-right tabular-nums">{n(c.priorizados)}</td>
                          <td className="py-2 px-3 text-right tabular-nums font-medium text-emerald-700">{n(c.liberados)}</td>
                          <td className={`py-2 px-3 text-right tabular-nums ${(c.pendientes ?? 0) > 0 ? 'text-amber-600 font-medium' : ''}`}>{n(c.pendientes)}</td>
                          <td className="py-2 pl-3 text-slate-500">{c.actor}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            {/* Bloque 3 — por liberar pronto (agenda de salidas). */}
            <Card>
              <div className="flex items-center gap-2 mb-4">
                <i className="ri-calendar-schedule-line text-teal-600 text-lg"></i>
                <h2 className="text-lg font-semibold text-slate-900">Por liberar pronto</h2>
              </div>

              {proximas.length === 0 ? (
                <p className="text-sm text-slate-500 py-6 text-center">
                  No hay pedidos priorizados esperando salida.
                </p>
              ) : (
                <ul className="space-y-2">
                  {proximas.map((p) => (
                    <li key={p.dispatchDate} className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-900">Salida {p.dispatchDate}</p>
                        <p className="text-xs text-slate-500">
                          {p.pedidos} pedido(s) · {p.viajes} viaje(s) · ventana {p.ventanaAbre}
                        </p>
                      </div>
                      {p.abreHoy
                        ? <Badge variant="warning" size="sm">Ventana abierta</Badge>
                        : <Badge variant="default" size="sm">Programado</Badge>}
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-4 pt-3 border-t border-slate-100 text-xs text-slate-500">
                La ejecución automática libera cada viaje al abrir su ventana (salida − 1 día).
              </p>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

// Celda de resumen numérico de la última corrida.
function Resumen({ label, value, warn }: { label: string; value: number | string; warn?: boolean }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`text-xl font-bold ${warn ? 'text-amber-600' : 'text-slate-900'}`}>{value}</p>
    </div>
  );
}
