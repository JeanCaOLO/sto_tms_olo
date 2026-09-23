import { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import PaisSelector from './components/PaisSelector';
import PlanAutomatico from './components/PlanAutomatico';
import { useCatalogos } from './use-catalogos';
import { getPais, setPais, type Pais } from './eflow-api';

// Planificación automática: toma los pedidos con entrega para mañana (los que
// el OMS dejó alistados en la base intermedia), los agrupa por destino y arma
// los viajes asignando vehículo por capacidad. Sin armado manual de viajes —
// el planificador solo revisa/confirma la propuesta del motor.
export default function PlanificacionPage() {
  const { appUser } = useAuth();
  const [pais, setPaisState] = useState<Pais>(getPais());
  const { vehiculos, conductores, loading } = useCatalogos(appUser, pais);

  const cambiarPais = (p: Pais) => {
    setPais(p);
    setPaisState(p);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <i className="ri-loader-4-line animate-spin text-teal-600 text-2xl"></i>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-slate-800">Planificación de Rutas</h1>
          <p className="text-sm text-slate-500 mt-1">
            Los pedidos con entrega para mañana se agrupan por destino y se asignan a la flota por capacidad, automáticamente.
          </p>
        </div>
        <div className="flex-shrink-0">
          <PaisSelector pais={pais} onChange={cambiarPais} />
        </div>
      </div>

      <PlanAutomatico vehiculos={vehiculos} conductores={conductores} />
    </div>
  );
}
