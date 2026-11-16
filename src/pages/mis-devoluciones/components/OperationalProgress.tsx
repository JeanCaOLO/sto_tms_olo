import type {MyReturnRequest} from '../api/solicitudesApi';

const labels:Record<string,string>={legacy:'Sin integración histórica',pending_send:'Pendiente de envío a Planificación',
  awaiting_ack:'Esperando acuse de Planificación',delivery_failed:'Error de envío a Planificación',
  planning:'En Planificación',no_candidate:'Sin viaje candidato',planning_failed:'Fallo de Planificación',
  tracking:'En Tracking',partially_delivered:'Entregada parcialmente',delivered:'Entregada'};

export default function OperationalProgress({request}:{request:Omit<MyReturnRequest,'items'>}) {
  return <div className="space-y-1 text-sm text-slate-600">
    <p className="font-medium">{labels[request.operational_status??'legacy']??'Seguimiento no disponible'}</p>
    {request.origin&&<p>{request.origin.order_number} · {request.origin.final_customer_name} · {request.origin.address} · {request.origin.zone_name}</p>}
    {(request.item_progress??[]).map(item=><p key={item.request_item_id}>
      {item.product_code} · {item.presentation??'Unidad del pedido'} · Solicitado {item.requested} · Asignado pendiente {item.assigned}
      {' · '}Recogido {item.collected} · Entregado {item.delivered} · Recibido {item.received}
    </p>)}
    {(request.tracking??[]).map(row=><p key={row.assignment_id}>Viaje {row.route_id} · Parada {row.stop_id}</p>)}
    {request.operational_updated_at&&<p>Última actualización: {new Date(request.operational_updated_at).toLocaleString('es-CR')}</p>}
    {request.planning_issue==='planning.no_candidate'&&request.operational_status!=='no_candidate'&&<p>Planificación reportó saldo sin viaje candidato.</p>}
    {request.planning_issue==='planning.failed'&&request.operational_status!=='planning_failed'&&<p>Planificación reportó un fallo para el saldo pendiente.</p>}
  </div>;
}
