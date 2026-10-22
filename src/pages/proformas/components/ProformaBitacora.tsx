// Bitácora de proformas (solo lectura). Con `proformaId` muestra solo el historial de esa proforma.
// Se consulta al montar: la pestaña o la sección se abre cuando el usuario la pide.

import { useCallback, useEffect, useState } from 'react';
import DataTable, { type DataTableColumn } from '../../../components/base/DataTable';
import { listProformaEvents, type ProformaEvent } from '../../../lib/tarifas/proformas';

const ACTIONS: Record<string, string> = { CREATE: 'Creación', UPDATE: 'Cambio', AUTHORIZE: 'Decisión de fase' };

const when = (iso: string) => new Date(iso).toLocaleString('es-ES');
const detailOf = (ev: ProformaEvent) => JSON.stringify({ antes: ev.before, despues: ev.after, motivo: ev.reason }, null, 2);

interface Props {
  proformaId?: string;
  /** id de proforma → número (PRO-…), para mostrar algo legible en la lista general. */
  numbers?: Map<string, string>;
}

export default function ProformaBitacora({ proformaId, numbers }: Props) {
  const [events, setEvents] = useState<ProformaEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setEvents(await listProformaEvents(proformaId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar la bitácora.');
    } finally {
      setLoading(false);
    }
  }, [proformaId]);

  useEffect(() => { void load(); }, [load]);

  const label = (ev: ProformaEvent) => (ev.entity_id.startsWith('config:') ? 'Configuración' : numbers?.get(ev.entity_id) ?? '—');

  const columns: DataTableColumn<ProformaEvent>[] = [
    { key: 'date', header: 'Fecha', sortable: true, accessor: (ev) => ev.created_at, render: (ev) => <span className="text-slate-600">{when(ev.created_at)}</span>, exportValue: (ev) => when(ev.created_at) },
    { key: 'user', header: 'Usuario', sortable: true, filterable: true, accessor: (ev) => ev.user_name },
    { key: 'role', header: 'Rol', filterable: true, accessor: (ev) => ev.role },
    ...(proformaId ? [] : [{
      key: 'proforma', header: 'Proforma', sortable: true, accessor: (ev: ProformaEvent) => label(ev),
      render: (ev: ProformaEvent) => <span className="font-mono text-xs text-teal-700">{label(ev)}</span>,
    }]),
    { key: 'action', header: 'Acción', filterable: true, accessor: (ev) => ACTIONS[ev.action] ?? ev.action },
    { key: 'reason', header: 'Motivo', accessor: (ev) => ev.reason ?? '' },
    {
      key: 'detail', header: 'Antes → Después', accessor: detailOf, cellClassName: 'text-xs text-slate-500 max-w-md',
      render: (ev) => (
        <details>
          <summary className="cursor-pointer text-teal-700">Ver detalle</summary>
          <pre className="mt-1 whitespace-pre-wrap break-all rounded border border-slate-200 bg-slate-50 p-2">{detailOf(ev)}</pre>
        </details>
      ),
    },
  ];

  if (error) return <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>;
  return (
    <DataTable
      data={events}
      columns={columns}
      getRowId={(ev) => String(ev.id)}
      loading={loading}
      maxVisibleRows={5}
      pageSize={25}
      searchPlaceholder="Buscar por usuario o acción"
      exportFileName={proformaId ? 'historial_proforma' : 'bitacora_proformas'}
      columnsKey={proformaId ? 'proformas.historial' : 'proformas.bitacora'}
      emptyMessage="Todavía no hay eventos registrados"
    />
  );
}
