// @vitest-environment jsdom
import {cleanup,render,screen} from '@testing-library/react';
import {afterEach,expect,it} from 'vitest';
import OperationalProgress from './OperationalProgress';
const request={id:'r1',request_number:'SOL-1',status:'aprobada',created_at:'2026-11-13T15:00:00Z',items:1};
afterEach(cleanup);
it.each([
 ['needs_data','Datos pendientes para planificar'],['pending_planning','Pendiente de evaluación por Planificación'],
 ['scheduled','Programada en un viaje'],['no_candidate','Sin viaje candidato'],['planning_failed','Fallo de Planificación'],
 ['tracking','En Tracking'],['partially_delivered','Entregada parcialmente'],['delivered','Entregada'],
])('representa el hecho del servidor %s', (status,label)=>{
 render(<OperationalProgress request={{...request,operational_status:status}}/>);
 expect(screen.getByText(label)).toBeTruthy();
});
it('muestra viaje y parada planificados antes de existir ejecución',()=>{
 render(<OperationalProgress request={{...request,operational_status:'scheduled',tracking:[{
  assignment_id:'a',attempt_id:'t',request_item_id:'i',route_id:null,stop_id:null,
  plan_trip_id:'plan-viaje-1',plan_stop_id:'plan-parada-1',assigned_quantity:2,
  collected_quantity:null,delivered:false,return_id:null,
 }]}}/>);
 expect(screen.getByText(/Viaje planificado plan-viaje-1.*Parada plan-parada-1/)).toBeTruthy();
});
it('separa presentaciones, muestra origen, viaje, parada y actualización',()=>{
 render(<OperationalProgress request={{...request,operational_status:'tracking',operational_updated_at:request.created_at,
  origin:{order_number:'PED-1',address:'Calle A',final_customer_name:'Destino A',zone_name:'Zona A'},
  item_progress:[{request_item_id:'i1',product_code:'SKU',presentation:'CAJA',requested:5,assigned:0,collected:3,delivered:0,received:0}],
  tracking:[{assignment_id:'a1',attempt_id:'t1',request_item_id:'i1',route_id:'viaje-1',stop_id:'parada-1',assigned_quantity:5,collected_quantity:3,delivered:false,return_id:null}],
 }}/>);
 expect(screen.getByText(/CAJA.*Solicitado 5.*Recogido 3/)).toBeTruthy();
 expect(screen.getByText(/PED-1.*Calle A/)).toBeTruthy();expect(screen.getByText(/Viaje viaje-1.*Parada parada-1/)).toBeTruthy();
 expect(screen.getByText(/Última actualización/)).toBeTruthy();
});
