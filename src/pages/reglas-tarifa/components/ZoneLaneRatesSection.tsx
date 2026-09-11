import { useState, useEffect } from 'react';
import Card from '../../../components/base/Card';
import Button from '../../../components/base/Button';
import Input from '../../../components/base/Input';
import Select from '../../../components/base/Select';
import { deleteZoneLaneRate, listZoneLaneRates, saveZoneLaneRate } from '../../../lib/tarifas/localRulesDataSource';
import HelpButton from './HelpButton';

interface ZoneLaneRatesSectionProps {
  organizationId: string;
  zones: any[];
}

// Alimenta el operador LOOKUP_ZONE: una regla puede buscar acá el monto de la ruta zona-a-zona en
// vez de calcularlo con una fórmula, con un fallback si no hay cobertura para el par.
export default function ZoneLaneRatesSection({ organizationId, zones }: ZoneLaneRatesSectionProps) {
  const [rates, setRates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ originZoneId: '', destZoneId: '', amount: '0', currency: 'USD' });

  const load = async () => {
    setLoading(true);
    setRates(await listZoneLaneRates(organizationId));
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId]);

  const zoneLabel = (id: string) => {
    const z = zones.find((zone) => zone.id === id);
    return z ? `${z.code} - ${z.name}` : id;
  };

  const handleAdd = async () => {
    if (!form.originZoneId || !form.destZoneId) return;
    await saveZoneLaneRate(organizationId, {
      origin_zone_id: form.originZoneId, dest_zone_id: form.destZoneId,
      amount: form.amount, currency: form.currency,
    });
    setForm({ originZoneId: '', destZoneId: '', amount: '0', currency: 'USD' });
    await load();
  };

  return (
    <Card>
      <div className="flex items-center gap-2 mb-3">
        <h3 className="text-sm font-semibold text-slate-700">Tarifas por zona (LOOKUP_ZONE)</h3>
        <HelpButton
          title="Tarifas por zona"
          steps={[
            'Una regla con expresión LOOKUP_ZONE busca acá el monto para el par zona origen → zona destino.',
            'Si no hay una fila que cubra el par, la regla usa el "fallback" que se definió al crearla (por ejemplo, un PER_KM) y queda un aviso en el desglose.',
            'Es útil cuando la tarifa no sigue una fórmula (km × tasa) sino que es un acuerdo comercial fijo por ruta.',
          ]}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end mb-3">
        <Select label="Zona origen" value={form.originZoneId} onChange={(e) => setForm({ ...form, originZoneId: e.target.value })} options={[{ value: '', label: 'Elegir...' }, ...zones.map((z) => ({ value: z.id, label: z.code }))]} />
        <Select label="Zona destino" value={form.destZoneId} onChange={(e) => setForm({ ...form, destZoneId: e.target.value })} options={[{ value: '', label: 'Elegir...' }, ...zones.map((z) => ({ value: z.id, label: z.code }))]} />
        <Input label="Monto" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
        <Button variant="secondary" onClick={handleAdd}><i className="ri-add-line"></i>Agregar</Button>
      </div>

      {loading ? (
        <div className="text-center py-6 text-slate-400"><i className="ri-loader-4-line animate-spin"></i></div>
      ) : (
        <table className="w-full text-sm">
          <thead><tr className="border-b border-slate-200"><th className="text-left py-2">Ruta</th><th className="text-left py-2">Monto</th><th></th></tr></thead>
          <tbody>
            {rates.map((r) => (
              <tr key={r.id} className="border-b border-slate-100">
                <td className="py-2">{zoneLabel(r.origin_zone_id)} → {zoneLabel(r.dest_zone_id)}</td>
                <td className="py-2">${r.amount}</td>
                <td className="py-2 text-right">
                  <button onClick={async () => { await deleteZoneLaneRate(r.id); await load(); }} className="text-red-500 hover:bg-red-50 rounded-lg p-1">
                    <i className="ri-delete-bin-line"></i>
                  </button>
                </td>
              </tr>
            ))}
            {rates.length === 0 && <tr><td colSpan={3} className="py-3 text-center text-slate-400">Sin tarifas por zona configuradas.</td></tr>}
          </tbody>
        </table>
      )}
    </Card>
  );
}
