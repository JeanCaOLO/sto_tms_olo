// @vitest-environment jsdom
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import DevolucionesPage from '../page';
import * as api from '../../mis-devoluciones/api/solicitudesApi';
const state=vi.hoisted(()=>({user:{id:'operator-a'},canEdit:true,canView:true,country:null as string|null}));
vi.mock('../../../hooks/useAuth',()=>({useAuth:()=>({user:state.user,loading:false})}));
vi.mock('../../../hooks/usePermissions',()=>({usePermissions:()=>({loading:false,countries:{all:true,ids:[]},
 can:(module:string,action:string)=>module==='devoluciones'&&(action==='view'?state.canView:action==='edit'&&state.canEdit)})}));
vi.mock('../../../hooks/useOperationalContext',()=>({useOperationalContext:()=>({selectedCountryId:state.country})}));
vi.mock('../hooks/useReturnTrips',()=>({useReturnTrips:()=>({summary:null,trips:[],loading:false,error:null,reload:vi.fn()})}));
vi.mock('../../mis-devoluciones/api/solicitudesApi',async(original)=>({
 ...await original<typeof import('../../mis-devoluciones/api/solicitudesApi')>(),
 listRequestInbox:vi.fn(),approveRequest:vi.fn(),rejectRequest:vi.fn(),getRequest:vi.fn(),getFileUrl:vi.fn(),
}));
const company='22222222-2222-2222-2222-222222222222';
const row={id:'req-a',request_number:'SOL-A',status:'pendiente_asignacion',created_at:'2026-11-12T14:00:00Z',
 customer_id:company,customer_name:'Empresa A',requested_by:'client-a',requested_by_name:'Cliente de prueba',items:1};
const detail:api.RequestDetail={request:{...row,decided_by:null,decided_at:null,rejection_reason:null},
 items:[{id:'item-a',line_number:1,product_code:'CODE',product_name:'Producto',quantity:2,reason_code:'danado',description:null,
 files:[{id:'photo-a',kind:'photo',mime_type:'image/jpeg',size_bytes:12},{id:'video-a',kind:'video',mime_type:'video/mp4',size_bytes:20}]}]};
const inbox={items:[row],companies:[{id:company,name:'Empresa A'}],limit:25,offset:0,has_more:false};
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(r=>{resolve=r;});return {promise,resolve};}
async function ready(){render(<DevolucionesPage/>);fireEvent.click(screen.getByRole('tab',{name:'Solicitudes'}));await screen.findByText('SOL-A');}
async function open(){fireEvent.click(screen.getByRole('button',{name:'Revisar SOL-A'}));await screen.findByRole('button',{name:'Aprobar solicitud'});}
beforeEach(()=>{
 vi.clearAllMocks();state.user={id:'operator-a'};state.canEdit=true;state.canView=true;state.country=null;
 vi.mocked(api.listRequestInbox).mockResolvedValue(inbox);
 vi.mocked(api.getRequest).mockResolvedValue(detail);
 vi.mocked(api.approveRequest).mockResolvedValue({...row,status:'aprobada'});
 vi.mocked(api.rejectRequest).mockResolvedValue({...row,status:'rechazada'});
 vi.mocked(api.getFileUrl).mockResolvedValue({url:'https://evidence.invalid/file',kind:'photo',mime_type:'image/jpeg',expires_in:300});
});
afterEach(()=>{cleanup();vi.useRealTimers();});
it('conserva viajes e integra solicitudes sin viaje con solicitante y empresa',async()=>{
 render(<DevolucionesPage/>);expect(screen.getByRole('tab',{name:'Por recibir'})).toBeTruthy();
 expect(api.listRequestInbox).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('tab',{name:'Solicitudes'}));
 await screen.findByText('SOL-A');expect(screen.getByText('Cliente de prueba')).toBeTruthy();expect(screen.getAllByText('Empresa A').length).toBeGreaterThan(0);
 fireEvent.click(screen.getByRole('tab',{name:'Recepción por viajes'}));expect(screen.getByRole('tab',{name:'Por recibir'})).toBeTruthy();
});
it('muestra bandeja vacia y permite reintentar errores de API',async()=>{
 vi.mocked(api.listRequestInbox).mockRejectedValueOnce(new Error('Sin acceso a la bandeja')).mockResolvedValue({...inbox,items:[]});
 render(<DevolucionesPage/>);fireEvent.click(screen.getByRole('tab',{name:'Solicitudes'}));
 await screen.findByText('Sin acceso a la bandeja');fireEvent.click(screen.getByRole('button',{name:'Reintentar solicitudes'}));
 expect(await screen.findByText('No hay solicitudes con estos filtros.')).toBeTruthy();
});
it('filtra estado/empresa y reinicia paginacion al cambiar filtros',async()=>{
 vi.mocked(api.listRequestInbox).mockResolvedValue({...inbox,has_more:true});await ready();
 fireEvent.click(screen.getByRole('button',{name:'Página siguiente'}));
 await waitFor(()=>expect(api.listRequestInbox).toHaveBeenLastCalledWith(expect.objectContaining({offset:25})));
 await screen.findByText('SOL-A');
 fireEvent.change(screen.getByLabelText('Estado de solicitud'),{target:{value:'rechazada'}});
 await waitFor(()=>expect(api.listRequestInbox).toHaveBeenLastCalledWith(expect.objectContaining({estado:'rechazada',offset:0})));
 await screen.findByText('SOL-A');fireEvent.change(screen.getByLabelText('Empresa'),{target:{value:company}});
 await waitFor(()=>expect(api.listRequestInbox).toHaveBeenLastCalledWith(expect.objectContaining({empresa:company,offset:0})));
});
it('solo lectura consulta detalle pero no muestra acciones comerciales',async()=>{
 state.canEdit=false;await ready();fireEvent.click(screen.getByRole('button',{name:'Revisar SOL-A'}));
 await screen.findByText('CODE');expect(screen.queryByRole('button',{name:'Aprobar solicitud'})).toBeNull();
 expect(screen.queryByRole('button',{name:'Rechazar solicitud'})).toBeNull();
});
it('sin permiso view no consulta ni muestra bandeja',async()=>{
 state.canView=false;render(<DevolucionesPage/>);expect(api.listRequestInbox).not.toHaveBeenCalled();
 expect(screen.queryByRole('tab',{name:'Solicitudes'})).toBeNull();
});
it('rechazo requiere motivo y no permite doble decision mientras envia',async()=>{
 const pending=deferred<typeof row>();vi.mocked(api.rejectRequest).mockReturnValue(pending.promise);
 await ready();await open();fireEvent.click(screen.getByRole('button',{name:'Rechazar solicitud'}));
 expect(await screen.findByText('Escriba el motivo de rechazo.')).toBeTruthy();expect(api.rejectRequest).not.toHaveBeenCalled();
 fireEvent.change(screen.getByLabelText('Motivo de rechazo'),{target:{value:' Falta evidencia '}});
 act(()=>{fireEvent.click(screen.getByRole('button',{name:'Rechazar solicitud'}));fireEvent.click(screen.getByRole('button',{name:'Aprobar solicitud'}));});
 expect(api.rejectRequest).toHaveBeenCalledTimes(1);expect(api.rejectRequest).toHaveBeenCalledWith('req-a','Falta evidencia');
 expect(api.approveRequest).not.toHaveBeenCalled();expect((screen.getByLabelText('Motivo de rechazo') as HTMLTextAreaElement).disabled).toBe(true);
 vi.mocked(api.getRequest).mockResolvedValue({...detail,request:{...detail.request,status:'rechazada',rejection_reason:'Falta evidencia'}});
 await act(async()=>{pending.resolve({...row,status:'rechazada'});});
 expect(await screen.findByText('Decisión registrada.')).toBeTruthy();
 await waitFor(()=>expect(screen.queryByRole('button',{name:'Aprobar solicitud'})).toBeNull());
});
it('aprueba solicitud completa y recarga detalle y bandeja',async()=>{
 await ready();await open();vi.mocked(api.getRequest).mockResolvedValue({...detail,request:{...detail.request,status:'aprobada'}});
 fireEvent.click(screen.getByRole('button',{name:'Aprobar solicitud'}));
 await screen.findByText('Decisión registrada.');expect(api.approveRequest).toHaveBeenCalledWith('req-a');
 await waitFor(()=>expect(api.listRequestInbox).toHaveBeenCalledTimes(2));
 expect(await screen.findByText(/La recepción en almacén se confirma por separado/)).toBeTruthy();
});
it('un 409 recarga el estado sin anunciar exito y retira acciones ya decididas',async()=>{
 vi.mocked(api.approveRequest).mockRejectedValue(new api.RequestApiError(409,'La solicitud ya cambió.'));
 await ready();await open();vi.mocked(api.getRequest).mockResolvedValue({...detail,request:{...detail.request,status:'rechazada',rejection_reason:'Otro operador decidió'}});
 fireEvent.click(screen.getByRole('button',{name:'Aprobar solicitud'}));
 await screen.findByText(/El estado cambió/);expect(screen.queryByText('Decisión registrada.')).toBeNull();
 expect(await screen.findByText('Otro operador decidió')).toBeTruthy();
 expect(screen.queryByRole('button',{name:'Aprobar solicitud'})).toBeNull();
});
it('ante resultado incierto conserva motivo y solo permite repetir la misma decision',async()=>{
 vi.mocked(api.rejectRequest).mockRejectedValueOnce(new Error('Tiempo agotado')).mockResolvedValue({...row,status:'rechazada'});
 await ready();await open();fireEvent.change(screen.getByLabelText('Motivo de rechazo'),{target:{value:'Motivo original'}});
 fireEvent.click(screen.getByRole('button',{name:'Rechazar solicitud'}));await screen.findByText('Tiempo agotado');
 expect((screen.getByRole('button',{name:'Aprobar solicitud'}) as HTMLButtonElement).disabled).toBe(true);
 expect((screen.getByLabelText('Motivo de rechazo') as HTMLTextAreaElement).disabled).toBe(true);
 vi.mocked(api.getRequest).mockResolvedValue({...detail,request:{...detail.request,status:'rechazada'}});
 fireEvent.click(screen.getByRole('button',{name:'Rechazar solicitud'}));await screen.findByText('Decisión registrada.');
 expect(vi.mocked(api.rejectRequest).mock.calls).toEqual([['req-a','Motivo original'],['req-a','Motivo original']]);
});
it('muestra fallo de detalle ajeno sin permitir decidir ni firmar evidencias',async()=>{
 vi.mocked(api.getRequest).mockRejectedValue(new Error('Solicitud no encontrada.'));
 await ready();fireEvent.click(screen.getByRole('button',{name:'Revisar SOL-A'}));await screen.findByText('Solicitud no encontrada.');
 expect(api.approveRequest).not.toHaveBeenCalled();expect(api.getFileUrl).not.toHaveBeenCalled();
 expect(screen.queryByRole('button',{name:'Aprobar solicitud'})).toBeNull();
});
it('reutiliza fotos/videos y renovacion sin renderizar un video como imagen',async()=>{
 await ready();await open();fireEvent.click(screen.getByRole('button',{name:'Ver foto 1'}));
 fireEvent.error(await screen.findByAltText('Evidencia foto 1'));
 fireEvent.click(screen.getByRole('button',{name:'Renovar foto 1'}));await waitFor(()=>expect(api.getFileUrl).toHaveBeenCalledTimes(2));
 fireEvent.click(screen.getByRole('button',{name:'Ver video 2'}));
 await waitFor(()=>expect(screen.getByLabelText('Evidencia video 2').tagName).toBe('VIDEO'));
 expect(api.getFileUrl).toHaveBeenLastCalledWith('req-a','video-a');
});
it('ignora respuestas antiguas al cambiar filtros',async()=>{
 const old=deferred<typeof inbox>();vi.mocked(api.listRequestInbox).mockReturnValueOnce(old.promise).mockResolvedValue({...inbox,items:[{...row,request_number:'SOL-NUEVA'}]});
 render(<DevolucionesPage/>);fireEvent.click(screen.getByRole('tab',{name:'Solicitudes'}));
 fireEvent.change(screen.getByLabelText('Estado de solicitud'),{target:{value:'aprobada'}});await screen.findByText('SOL-NUEVA');
 await act(async()=>{old.resolve(inbox);});expect(screen.queryByText('SOL-A')).toBeNull();
});
it('una solicitud ya decidida muestra actor y fecha sin acciones de decision',async()=>{
 vi.mocked(api.getRequest).mockResolvedValue({...detail,request:{...detail.request,status:'aprobada',decided_by:'op-a',
  decided_by_name:'Operador de prueba',decided_at:'2026-11-12T14:10:00Z'}});
 await ready();fireEvent.click(screen.getByRole('button',{name:'Revisar SOL-A'}));
 expect(await screen.findByText(/Decisión registrada por Operador de prueba/)).toBeTruthy();
 expect(screen.queryByRole('button',{name:'Aprobar solicitud'})).toBeNull();
 expect(screen.queryByRole('button',{name:'Rechazar solicitud'})).toBeNull();
});
it.each(['   ','x'.repeat(501)])('no envia un rechazo con motivo invalido %s',async(reason)=>{
 await ready();await open();fireEvent.change(screen.getByLabelText('Motivo de rechazo'),{target:{value:reason}});
 fireEvent.click(screen.getByRole('button',{name:'Rechazar solicitud'}));expect(api.rejectRequest).not.toHaveBeenCalled();
 expect(screen.getByRole('alert')).toBeTruthy();
});
it('cambiar pais limpia detalle/filtros e ignora resultados del pais anterior',async()=>{
 state.country='11111111-1111-1111-1111-111111111111';const old=deferred<typeof inbox>();
 vi.mocked(api.listRequestInbox).mockReturnValueOnce(old.promise).mockResolvedValue({...inbox,items:[{...row,request_number:'SOL-PAIS-B'}]});
 const page=render(<DevolucionesPage/>);fireEvent.click(screen.getByRole('tab',{name:'Solicitudes'}));
 state.country='33333333-3333-3333-3333-333333333333';page.rerender(<DevolucionesPage/>);
 await screen.findByText('SOL-PAIS-B');await act(async()=>{old.resolve(inbox);});
 expect(screen.queryByText('SOL-A')).toBeNull();
 expect(api.listRequestInbox).toHaveBeenLastCalledWith(expect.objectContaining({pais:state.country,offset:0}));
});
it('una decision que termina tras cambiar usuario no informa exito en la nueva cuenta',async()=>{
 const pending=deferred<typeof row>();vi.mocked(api.approveRequest).mockReturnValue(pending.promise);
 const page=render(<DevolucionesPage/>);fireEvent.click(screen.getByRole('tab',{name:'Solicitudes'}));await screen.findByText('SOL-A');await open();
 fireEvent.click(screen.getByRole('button',{name:'Aprobar solicitud'}));state.user={id:'operator-b'};page.rerender(<DevolucionesPage/>);
 await act(async()=>{pending.resolve({...row,status:'aprobada'});});
 expect(screen.queryByText('Decisión registrada.')).toBeNull();expect(screen.queryByRole('dialog')).toBeNull();
});
it('cerrar y reabrir durante un POST no habilita la decision contraria',async()=>{
 const pending=deferred<typeof row>();vi.mocked(api.approveRequest).mockReturnValue(pending.promise);
 await ready();await open();fireEvent.click(screen.getByRole('button',{name:'Aprobar solicitud'}));
 fireEvent.click(screen.getByRole('button',{name:'Cerrar detalle'}));await open();
 expect((screen.getByRole('button',{name:'Rechazar solicitud'}) as HTMLButtonElement).disabled).toBe(true);
 expect((screen.getByRole('button',{name:'Aprobar solicitud'}) as HTMLButtonElement).disabled).toBe(true);
 vi.mocked(api.getRequest).mockResolvedValue({...detail,request:{...detail.request,status:'aprobada'}});
 await act(async()=>{pending.resolve({...row,status:'aprobada'});});
 await screen.findByText(/La recepción en almacén se confirma por separado/);
 expect(screen.queryByRole('button',{name:'Rechazar solicitud'})).toBeNull();
});
it('un rechazo incierto conserva accion y motivo tras cerrar y cambiar de pestaña',async()=>{
 vi.mocked(api.rejectRequest).mockRejectedValueOnce(new Error('Tiempo agotado')).mockResolvedValue({...row,status:'rechazada'});
 await ready();await open();fireEvent.change(screen.getByLabelText('Motivo de rechazo'),{target:{value:'Motivo original'}});
 fireEvent.click(screen.getByRole('button',{name:'Rechazar solicitud'}));await screen.findByText('Tiempo agotado');
 fireEvent.click(screen.getByRole('button',{name:'Cerrar detalle'}));fireEvent.click(screen.getByRole('tab',{name:'Recepción por viajes'}));
 fireEvent.click(screen.getByRole('tab',{name:'Solicitudes'}));await screen.findByText('SOL-A');await open();
 expect((screen.getByLabelText('Motivo de rechazo') as HTMLTextAreaElement).value).toBe('Motivo original');
 expect((screen.getByLabelText('Motivo de rechazo') as HTMLTextAreaElement).disabled).toBe(true);
 expect((screen.getByRole('button',{name:'Aprobar solicitud'}) as HTMLButtonElement).disabled).toBe(true);
 vi.mocked(api.getRequest).mockResolvedValue({...detail,request:{...detail.request,status:'rechazada'}});
 fireEvent.click(screen.getByRole('button',{name:'Rechazar solicitud'}));await screen.findByText('Decisión registrada.');
 expect(vi.mocked(api.rejectRequest).mock.calls).toEqual([['req-a','Motivo original'],['req-a','Motivo original']]);
});
