import { useState, useEffect } from 'react';
import Card from '../../../components/base/Card';
import Button from '../../../components/base/Button';
import { listarEventos } from '../../../lib/liquidador/auditLog';
import type { FilaAuditoria } from '../../../lib/liquidador/auditLog';
import HelpButton from './HelpButton';

const ACCION_LABELS: Record<string, string> = {
  CREATE: 'Creación', UPDATE: 'Edición', DELETE: 'Eliminación', AUTHORIZE: 'Autorización',
};

export default function BitacoraTab() {
  const [eventos, setEventos] = useState<FilaAuditoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  const load = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      setEventos(await listarEventos());
    } catch (error: any) {
      console.error('Error cargando bitácora:', error);
      setErrorMsg('No se pudo cargar la bitácora de auditoría.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-slate-700">Bitácora de auditoría</h3>
          <HelpButton
            title="Bitácora"
            steps={[
              'Registro de solo lectura, append-only: cada alta/edición/eliminación de reglas y zonas queda acá con quién, con qué rol simulado, y el valor anterior/nuevo.',
              'No se puede editar ni borrar desde acá ni desde la app — solo se agregan filas nuevas.',
            ]}
          />
        </div>
        <Button variant="secondary" size="sm" onClick={load}>
          <i className="ri-refresh-line"></i>
          Recargar
        </Button>
      </div>

      {errorMsg && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mb-3">
          <i className="ri-error-warning-line mt-0.5 shrink-0"></i>
          <span>{errorMsg}</span>
        </div>
      )}

      {loading ? (
        <div className="text-center py-10 text-slate-500"><i className="ri-loader-4-line animate-spin text-2xl"></i></div>
      ) : eventos.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-10">Todavía no hay eventos registrados.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left py-2 px-2">Fecha</th>
                <th className="text-left py-2 px-2">Usuario</th>
                <th className="text-left py-2 px-2">Rol</th>
                <th className="text-left py-2 px-2">Entidad</th>
                <th className="text-left py-2 px-2">Acción</th>
                <th className="text-left py-2 px-2">Antes → Después</th>
              </tr>
            </thead>
            <tbody>
              {eventos.map((ev) => (
                <tr key={ev.id} className="border-b border-slate-100 align-top">
                  <td className="py-2 px-2 text-slate-600 whitespace-nowrap">{new Date(ev.created_at).toLocaleString('es-ES')}</td>
                  <td className="py-2 px-2 text-slate-800">{ev.user_name}</td>
                  <td className="py-2 px-2 text-slate-600">{ev.role}</td>
                  <td className="py-2 px-2 text-slate-600">{ev.entity} <span className="text-xs text-slate-400">({ev.entity_id})</span></td>
                  <td className="py-2 px-2 text-slate-600">{ACCION_LABELS[ev.action] || ev.action}</td>
                  <td className="py-2 px-2 text-xs text-slate-500 max-w-md">
                    <details>
                      <summary className="cursor-pointer text-teal-700">Ver detalle</summary>
                      <pre className="whitespace-pre-wrap break-all mt-1 bg-slate-50 rounded p-2 border border-slate-200">
{JSON.stringify({ antes: ev.before, despues: ev.after, motivo: ev.reason }, null, 2)}
                      </pre>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
