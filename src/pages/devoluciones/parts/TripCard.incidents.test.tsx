// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import type {ReturnLine,ReturnTrip} from '../../../lib/devoluciones/types';
import {isReadyToSettle,statusLabel} from '../../../lib/devoluciones/trips';
import {useTripDetail} from '../hooks/useTripDetail';
import * as api from '../api/devolucionesApi';
import TripCard from './TripCard';

vi.mock('../hooks/useTripDetail',()=>({useTripDetail:vi.fn()}));
vi.mock('../api/devolucionesApi',async importOriginal=>({
 ...await importOriginal<typeof import('../api/devolucionesApi')>(),
 getForm:vi.fn(),receiveAll:vi.fn(),receiveReturn:vi.fn(),rejectReturn:vi.fn(),recordIncident:vi.fn(),
}));
const trip:ReturnTrip={route_id:'route-a',route_number:'TEST-A',route_date:'2026-11-12',plan_trip_id:null,route_status:'completed',
 driver_name:null,carrier_name:null,country_id:'country-a',total_returns:1,received_returns:0,pending_returns:1,last_return_at:null,forms_count:0};
const line:ReturnLine={id:'return-a',return_number:'RET-A',return_type:'recolecta',return_date:null,reason:'danado',
 product_code:'TEST',product_name:'Producto',quantity:3,photo_url:'https://evidence.invalid/photo.jpg',notes:null,status:'pending',
 received_at:null,received_by:null,received_quantity:null,received_condition:null,dispatch_guide_id:'guide-a',sequence_number:1,
 order_number:'ORDER-A',invoice_number:null,form_id:null,form_number:null};
const reload=vi.fn();
beforeEach(()=>{
 vi.clearAllMocks();
 vi.mocked(useTripDetail).mockReturnValue({detail:{trip,returns:[line],sections:[],forms:[],defaults:{transport:null}},loading:false,error:null,reload});
 vi.mocked(api.recordIncident).mockResolvedValue({incident:{id:'incident-a',explanation:'Faltan dos cajas.'},trip});
});
afterEach(cleanup);
function open(canEdit=true,filter?:'novedades',value=trip){
 const onChanged=vi.fn();render(<TripCard trip={value} canEdit={canEdit} canPrint={false} onChanged={onChanged} filter={filter}/>);
 fireEvent.click(screen.getByRole('button',{name:/Viaje TEST-A/}));return onChanged;
}
it('registra una novedad usando solo texto y una clave estable',async()=>{
 const changed=open();fireEvent.click(screen.getByRole('button',{name:'Registrar novedad'}));
 const dialog=screen.getByRole('dialog',{name:'Registrar novedad'});
 expect(within(dialog).getAllByRole('textbox')).toHaveLength(1);
 expect(within(dialog).queryByRole('combobox')).toBeNull();
 fireEvent.change(within(dialog).getByLabelText('Explique la novedad'),{target:{value:'  Faltan dos cajas.  '}});
 fireEvent.click(within(dialog).getByRole('button',{name:'Guardar novedad'}));
 await waitFor(()=>expect(api.recordIncident).toHaveBeenCalledWith('return-a','Faltan dos cajas.',expect.any(String)));
 await waitFor(()=>expect(changed).toHaveBeenCalledTimes(1));expect(reload).toHaveBeenCalledTimes(1);
});
it('rechaza texto vacio antes de llamar al servidor',()=>{
 open();fireEvent.click(screen.getByRole('button',{name:'Registrar novedad'}));
 fireEvent.click(screen.getByRole('button',{name:'Guardar novedad'}));
 expect(screen.getByRole('alert').textContent).toMatch(/Escriba/);expect(api.recordIncident).not.toHaveBeenCalled();
});
it('Novedades muestra la explicacion y no ofrece recibir ni aceptar',()=>{
 vi.mocked(useTripDetail).mockReturnValue({detail:{trip,returns:[{...line,status:'in_review',incident_explanation:'Llegó averiada.'}],
  sections:[],forms:[],defaults:{transport:null}},loading:false,error:null,reload});
 open(true,'novedades');expect(screen.getByText('Llegó averiada.')).toBeTruthy();
 expect(screen.queryByRole('button',{name:'Recibir'})).toBeNull();
 expect(screen.queryByRole('button',{name:/Aceptar|Resolver/})).toBeNull();
 expect(screen.queryByRole('button',{name:'Registrar novedad'})).toBeNull();
});
it('una novedad bloquea listo para liquidar aunque la lista normal de pendientes sea cero',()=>{
 expect(isReadyToSettle({total_returns:1,pending_returns:0,incident_returns:1})).toBe(false);
 expect(statusLabel('in_review')).toBe('En revisión');
});
it('una novedad no se cuenta en la etiqueta de recepcion normal pendiente',()=>{
 open(true,'novedades',{...trip,open_returns:0,incident_returns:1});
 expect(screen.getByText('1 en revisión')).toBeTruthy();
 expect(screen.queryByText('1 por recibir')).toBeNull();
});
it('solo lectura no ofrece registrar novedades',()=>{
 open(false);expect(screen.queryByRole('button',{name:'Registrar novedad'})).toBeNull();
});
it('reintenta una respuesta incierta con la misma clave y texto sin duplicar el envio simultaneo',async()=>{
 vi.mocked(api.recordIncident).mockRejectedValueOnce(new Error('Respuesta perdida'));
 const changed=open();fireEvent.click(screen.getByRole('button',{name:'Registrar novedad'}));
 fireEvent.change(screen.getByLabelText('Explique la novedad'),{target:{value:'Faltan dos cajas.'}});
 fireEvent.click(screen.getByRole('button',{name:'Guardar novedad'}));
 await screen.findByText('Respuesta perdida');
 expect(screen.getByLabelText('Explique la novedad')).toHaveProperty('disabled',true);
 expect(screen.getByRole('button',{name:'Cancelar'})).toHaveProperty('disabled',true);
 fireEvent.click(screen.getByRole('button',{name:'Guardar novedad'}));
 fireEvent.click(screen.getByRole('button',{name:'Guardando…'}));
 await waitFor(()=>expect(changed).toHaveBeenCalledTimes(1));
 expect(api.recordIncident).toHaveBeenCalledTimes(2);
 expect(vi.mocked(api.recordIncident).mock.calls[1]).toEqual(vi.mocked(api.recordIncident).mock.calls[0]);
});
