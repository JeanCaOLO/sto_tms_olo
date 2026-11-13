// @vitest-environment jsdom
import {act,cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import DevolucionesPage from '../page';
import * as api from '../../mis-devoluciones/api/solicitudesApi';
const state=vi.hoisted(()=>({user:{id:'operator-a'},canEdit:true,canView:true,country:null as string|null,
 canCreateClient:false,canCreateOperator:false,isAdmin:false,role:'Devoluciones'}));
vi.mock('../../../hooks/useAuth',()=>({useAuth:()=>({user:state.user,loading:false})}));
vi.mock('../../../hooks/usePermissions',()=>({usePermissions:()=>({loading:false,countries:{all:true,ids:[]},
 isAdmin:state.isAdmin,permissions:{role:{name:state.role}},
 can:(module:string,action:string)=>module==='devoluciones_solicitud'?(action==='view'||action==='create')&&state.canCreateClient:
 module==='devoluciones'&&(action==='view'?state.canView:action==='create'?state.canCreateOperator:action==='edit'&&state.canEdit)})}));
vi.mock('../../../hooks/useOperationalContext',()=>({useOperationalContext:()=>({selectedCountryId:state.country})}));
vi.mock('../hooks/useReturnTrips',()=>({useReturnTrips:()=>({summary:null,trips:[],loading:false,error:null,reload:vi.fn()})}));
vi.mock('../../mis-devoluciones/api/solicitudesApi',async(original)=>({
 ...await original<typeof import('../../mis-devoluciones/api/solicitudesApi')>(),
 listRequestInbox:vi.fn(),approveRequest:vi.fn(),rejectRequest:vi.fn(),getRequest:vi.fn(),getFileUrl:vi.fn(),
 getCreationCompanies:vi.fn(),getClientAssignment:vi.fn(),createRequest:vi.fn(),listMyRequests:vi.fn(),uploadFile:vi.fn(),
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
async function open(){fireEvent.click(screen.getByRole('button',{name:'Revisar SOL-A'}));await screen.findByText('CODE');}
beforeEach(()=>{
 vi.clearAllMocks();state.user={id:'operator-a'};state.canEdit=true;state.canView=true;state.country=null;
 state.canCreateClient=false;state.canCreateOperator=false;state.isAdmin=false;state.role='Devoluciones';
 vi.mocked(api.listRequestInbox).mockResolvedValue(inbox);
 vi.mocked(api.getRequest).mockResolvedValue(detail);
 vi.mocked(api.approveRequest).mockResolvedValue({...row,status:'aprobada'});
 vi.mocked(api.rejectRequest).mockResolvedValue({...row,status:'rechazada'});
 vi.mocked(api.getFileUrl).mockResolvedValue({url:'https://evidence.invalid/file',kind:'photo',mime_type:'image/jpeg',expires_in:300});
 vi.mocked(api.getCreationCompanies).mockResolvedValue([{id:company,name:'Empresa A'}]);
 vi.mocked(api.getClientAssignment).mockResolvedValue({id:company,name:'Empresa A'});
 vi.mocked(api.createRequest).mockResolvedValue({id:'req-new',request_number:'SOL-NUEVA',status:'pendiente_asignacion'});
 vi.mocked(api.listMyRequests).mockResolvedValue([]);
});
afterEach(()=>{cleanup();vi.useRealTimers();});
it('es solo seguimiento incluso con permiso edit: no ofrece aprobar ni rechazar',async()=>{
 await ready();fireEvent.click(screen.getByRole('button',{name:'Revisar SOL-A'}));await screen.findByText('CODE');
 expect(screen.queryByRole('button',{name:'Aprobar solicitud'})).toBeNull();
 expect(screen.queryByRole('button',{name:'Rechazar solicitud'})).toBeNull();
 expect(screen.getByText(/integración de Planificación está pendiente/)).toBeTruthy();
});
it.each(['Gerente','SuperUsuario'])('permite a %s crear desde Solicitudes para una empresa autorizada',async(role)=>{
 state.role=role;state.isAdmin=role==='SuperUsuario';state.canCreateOperator=true;
 await ready();fireEvent.click(screen.getByRole('button',{name:'Crear solicitud'}));
 expect(await screen.findByRole('dialog',{name:'Crear solicitud'})).toBeTruthy();
 const companySelect=await screen.findByRole('combobox',{name:'Empresa destinataria'});
 await within(companySelect).findByRole('option',{name:'Empresa A'});fireEvent.change(companySelect,{target:{value:company}});
 fireEvent.change(await screen.findByLabelText(/Código del artículo/),{target:{value:'TEST-1'}});
 fireEvent.change(screen.getByLabelText(/Nombre del artículo/),{target:{value:'Producto'}});
 fireEvent.change(screen.getByLabelText(/Cantidad a devolver/),{target:{value:'2'}});
 fireEvent.change(screen.getByLabelText(/Motivo \*/),{target:{value:'danado'}});
 fireEvent.click(screen.getByRole('button',{name:'Enviar solicitud'}));
 await screen.findByText('Solicitud registrada');
 expect(api.createRequest).toHaveBeenCalledWith(expect.any(Array),expect.any(String),company);
 await waitFor(()=>expect(api.listRequestInbox).toHaveBeenCalledTimes(2));
});
it('Cliente entra a Solicitudes y crea con empresa fija sin abrir la bandeja operativa',async()=>{
 state.canView=false;state.canCreateClient=true;state.role='Cliente';render(<DevolucionesPage/>);
 expect(screen.queryByRole('tab',{name:'Recepción por viajes'})).toBeNull();
 fireEvent.click(await screen.findByRole('button',{name:'Crear solicitud'}));
 await screen.findAllByText('Empresa A');
 expect(screen.queryByRole('combobox',{name:'Empresa destinataria'})).toBeNull();
 expect(api.listRequestInbox).not.toHaveBeenCalled();expect(api.getCreationCompanies).not.toHaveBeenCalled();
});
it('el rol Devoluciones sin permiso de captura no obtiene el boton',async()=>{
 await ready();expect(screen.queryByRole('button',{name:'Crear solicitud'})).toBeNull();
});
it('conserva clave y borrador al reabrir tras un envio incierto y cambiar pais',async()=>{
 state.role='Gerente';state.canCreateOperator=true;
 const pending=deferred<api.CreatedRequest>();vi.mocked(api.createRequest).mockReturnValueOnce(pending.promise);
 const page=render(<DevolucionesPage/>);fireEvent.click(screen.getByRole('tab',{name:'Solicitudes'}));
 await screen.findByText('SOL-A');fireEvent.click(screen.getByRole('button',{name:'Crear solicitud'}));
 let companySelect=await screen.findByRole('combobox',{name:'Empresa destinataria'});
 await within(companySelect).findByRole('option',{name:'Empresa A'});fireEvent.change(companySelect,{target:{value:company}});
 fireEvent.change(await screen.findByLabelText(/Código del artículo/),{target:{value:'TEST-ORIGINAL'}});
 fireEvent.change(screen.getByLabelText(/Nombre del artículo/),{target:{value:'Producto original'}});
 fireEvent.change(screen.getByLabelText(/Cantidad a devolver/),{target:{value:'2'}});
 fireEvent.change(screen.getByLabelText(/Motivo \*/),{target:{value:'danado'}});
 fireEvent.click(screen.getByRole('button',{name:'Enviar solicitud'}));
 await waitFor(()=>expect(api.createRequest).toHaveBeenCalledTimes(1));
 const key=vi.mocked(api.createRequest).mock.calls[0][1];
 state.country='11111111-1111-1111-1111-111111111111';page.rerender(<DevolucionesPage/>);
 await act(async()=>{pending.resolve({id:'req-original',request_number:'SOL-ORIGINAL',status:'pendiente_asignacion'});});
 fireEvent.click(await screen.findByRole('button',{name:'Crear solicitud'}));
 companySelect=await screen.findByRole('combobox',{name:'Empresa destinataria'});
 await within(companySelect).findByRole('option',{name:'Empresa A'});fireEvent.change(companySelect,{target:{value:company}});
 await waitFor(()=>expect((screen.getByLabelText(/Código del artículo/) as HTMLInputElement).value).toBe('TEST-ORIGINAL'));
 fireEvent.click(screen.getByRole('button',{name:'Enviar solicitud'}));await screen.findByText('Solicitud registrada');
 expect(vi.mocked(api.createRequest).mock.calls[1][1]).toBe(key);
 expect(vi.mocked(api.createRequest).mock.calls[1][0]).toEqual(vi.mocked(api.createRequest).mock.calls[0][0]);
});
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
it('cambiar pais limpia detalle/filtros e ignora resultados del pais anterior',async()=>{
 state.country='11111111-1111-1111-1111-111111111111';const old=deferred<typeof inbox>();
 vi.mocked(api.listRequestInbox).mockReturnValueOnce(old.promise).mockResolvedValue({...inbox,items:[{...row,request_number:'SOL-PAIS-B'}]});
 const page=render(<DevolucionesPage/>);fireEvent.click(screen.getByRole('tab',{name:'Solicitudes'}));
 state.country='33333333-3333-3333-3333-333333333333';page.rerender(<DevolucionesPage/>);
 await screen.findByText('SOL-PAIS-B');await act(async()=>{old.resolve(inbox);});
 expect(screen.queryByText('SOL-A')).toBeNull();
 expect(api.listRequestInbox).toHaveBeenLastCalledWith(expect.objectContaining({pais:state.country,offset:0}));
});
