import Card from '../../../components/base/Card';
import Badge from '../../../components/base/Badge';
import Input from '../../../components/base/Input';
import Select from '../../../components/base/Select';
import { WEEK_DAYS, WEEK_DAY_LABELS, companyOptions, type WeekDay } from '../types';
import { useRutasController } from './useRutasController';

// Pantalla Calendario de Rutas y Días de Despacho (FR1).
// Cuadrícula semanal: un check teal en las columnas de los días de salida.
// Por ahora es SOLO DE CONSULTA: no permite crear ni actualizar rutas desde
// la UI (el CRUD gated a administrador de FR1.1 queda pendiente de definir).
export default function OmsRutasDespachoPage() {
  const { country, companies, company, setCompany, routes, loading, error, query, setQuery } = useRutasController();

  const dayCell = (route: { loadDays: WeekDay[]; byAppointment: boolean }, day: WeekDay) => {
    const on = route.loadDays.includes(day);
    return (
      <td key={day} className="py-3 px-2 text-center">
        {on ? (
          <span className="inline-flex w-6 h-6 items-center justify-center rounded-full bg-teal-100 text-teal-600" aria-label={`Sale ${WEEK_DAY_LABELS[day]}`}>
            <i className="ri-check-line text-sm"></i>
          </span>
        ) : (
          <span className="text-slate-300" aria-hidden="true">·</span>
        )}
      </td>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Calendario de Rutas</h1>
          <p className="text-sm text-slate-600 mt-1">
            Días de salida (carga) por ruta — fuente de la Regla 1 del motor
          </p>
        </div>
        <div className="w-full sm:w-56">
          <Select
            label="Compañía"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            options={companyOptions(companies)}
          />
        </div>
      </div>

      <Card padding={false}>
        <div className="flex items-center justify-between p-6 pb-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Calendario de Rutas — {country === 'CR' ? 'Costa Rica' : 'Venezuela'}
            </h2>
            <p className="text-sm text-slate-600 mt-0.5">Cliente: Cofersa · {routes.length} zonas</p>
          </div>
        </div>

        <div className="px-6 pb-4">
          <Input
            icon="ri-search-line"
            placeholder="Buscar zona…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="max-w-xs"
          />
        </div>

        {loading && (
          <div className="flex items-center justify-center h-48">
            <i className="ri-loader-4-line animate-spin text-teal-600 text-2xl"></i>
          </div>
        )}

        {!loading && error && (
          <div className="px-6 pb-6 text-sm text-red-600">{error}</div>
        )}

        {!loading && !error && routes.length === 0 && (
          <div className="text-center py-12 text-slate-500">
            <i className="ri-calendar-close-line text-3xl"></i>
            <p className="mt-2 text-sm">No hay rutas para este país o filtro.</p>
          </div>
        )}

        {!loading && !error && routes.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Ruta</th>
                  {WEEK_DAYS.map((d) => (
                    <th key={d} className="py-3 px-2 text-center text-sm font-semibold text-slate-700" title={WEEK_DAY_LABELS[d]}>{d}</th>
                  ))}
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Excepciones</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Estado</th>
                </tr>
              </thead>
              <tbody>
                {routes.map((r) => (
                  <tr key={r.id} className={`border-b border-slate-100 hover:bg-slate-50 ${r.active ? '' : 'opacity-50'}`}>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-slate-900">{r.id} {r.name}</span>
                        <Badge variant={r.routeType === 'GAM' ? 'info' : 'default'} size="sm">{r.routeType}</Badge>
                      </div>
                    </td>
                    {r.byAppointment ? (
                      <td className="py-3 px-2 text-center" colSpan={WEEK_DAYS.length}>
                        <Badge variant="warning" size="sm">Cita previa (sin días fijos)</Badge>
                      </td>
                    ) : (
                      WEEK_DAYS.map((d) => dayCell(r, d))
                    )}
                    <td className="py-3 px-4">
                      {r.exceptions > 0 ? (
                        <span className="text-sm font-medium text-amber-600">{r.exceptions} activa{r.exceptions > 1 ? 's' : ''}</span>
                      ) : (
                        <span className="text-sm text-slate-400">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <Badge variant={r.active ? 'success' : 'default'}>{r.active ? 'Activa' : 'Inactiva'}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <p className="text-xs text-slate-500">
        Datos ilustrativos del calendario real de Cofersa Costa Rica. Los días de carga
        alimentan el cálculo del <code>ready_to_prep_date</code> de la Regla 1 (alistar
        un día antes de la salida). El sembrado real se hace en Construcción.
      </p>
    </div>
  );
}
