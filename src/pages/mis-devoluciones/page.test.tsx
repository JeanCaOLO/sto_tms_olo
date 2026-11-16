// @vitest-environment jsdom
import {act,cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import MisDevolucionesPage from './page';
import * as api from './api/solicitudesApi';

const state=vi.hoisted(()=>({user:{id:'client-a'},canCreate:true}));
vi.mock('../../hooks/useAuth',()=>({useAuth:()=>({user:state.user,loading:false})}));
vi.mock('../../hooks/usePermissions',()=>({usePermissions:()=>({loading:false,
 can:(module:string,action:string)=>module==='devoluciones_solicitud'&&(action==='view'||state.canCreate)})}));
vi.mock('./api/solicitudesApi',async(importOriginal)=>({
 ...await importOriginal<typeof import('./api/solicitudesApi')>(),
 getClientAssignment:vi.fn(),createRequest:vi.fn(),uploadFile:vi.fn(),listMyRequests:vi.fn(),getRequest:vi.fn(),getFileUrl:vi.fn(),
}));
const created={id:'req-a',request_number:'SOL-2026-11-0001',status:'pendiente_asignacion'};
const summary={...created,created_at:'2026-11-12T13:00:00Z',items:1};
const detail={request:{...summary,customer_id:'company-a',customer_name:'Empresa A',requested_by:'client-a',
 decided_by:'operator-a',decided_by_name:'Operador de prueba',decided_at:'2026-11-12T13:10:00Z',status:'rechazada',rejection_reason:'Falta evidencia del empaque'},
 items:[{id:'item-a',line_number:1,product_code:'COD-1',product_name:'Producto',quantity:2,reason_code:'danado',description:'Roto',
 files:[{id:'file-photo',kind:'photo',mime_type:'image/jpeg',size_bytes:12},{id:'file-video',kind:'video',mime_type:'video/mp4',size_bytes:20}]}]};
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(r=>{resolve=r;});return {promise,resolve};}
async function ready(){render(<MisDevolucionesPage/>);await screen.findByText('Empresa A');}
function fill(){
 fireEvent.change(screen.getByLabelText(/Código del artículo/),{target:{value:'COD-1'}});
 fireEvent.change(screen.getByLabelText(/Nombre del artículo/),{target:{value:'Producto'}});
 fireEvent.change(screen.getByLabelText(/Cantidad a devolver/),{target:{value:'2'}});
 fireEvent.change(screen.getByLabelText(/Motivo \*/),{target:{value:'danado'}});
}
function submit(){fireEvent.submit(screen.getByRole('button',{name:/Enviar solicitud|Enviando/}).closest('form')!);}
async function openDetail(){
 fireEvent.click(screen.getByRole('tab',{name:'Mis solicitudes'}));
 fireEvent.click(await screen.findByRole('button',{name:`Ver detalle ${created.request_number}`}));
 await screen.findByText('Falta evidencia del empaque');
}
beforeEach(()=>{
 vi.clearAllMocks();state.user={id:'client-a'};state.canCreate=true;
 vi.mocked(api.getClientAssignment).mockResolvedValue({id:'company-a',name:'Empresa A'});
 vi.mocked(api.listMyRequests).mockResolvedValue([summary]);
 vi.mocked(api.createRequest).mockResolvedValue(created);
 vi.mocked(api.getRequest).mockResolvedValue(detail as Awaited<ReturnType<typeof api.getRequest>>);
 vi.mocked(api.uploadFile).mockResolvedValue({key:'uploaded-key'});
 vi.mocked(api.getFileUrl).mockResolvedValue({url:'https://evidence.invalid/file',kind:'photo',mime_type:'image/jpeg',expires_in:300});
});
afterEach(()=>{cleanup();vi.useRealTimers();});

describe('Cliente T05',()=>{
 it('muestra empresa asignada fija y etiqueta recolecta',async()=>{
  await ready();expect(screen.getByText('Recolecta')).toBeTruthy();
  expect(screen.queryByRole('combobox',{name:/Empresa/})).toBeNull();
  expect(screen.getByText(/código se ingresa manualmente/i)).toBeTruthy();
 });
 it('exige nombre antes de subir archivos o crear',async()=>{
  await ready();fill();fireEvent.change(screen.getByLabelText(/Nombre del artículo/),{target:{value:' '}});submit();
  expect(await screen.findByText('Escribe el nombre del artículo.')).toBeTruthy();
  expect(api.createRequest).not.toHaveBeenCalled();expect(api.uploadFile).not.toHaveBeenCalled();
 });
 it('bloquea envio sin asignacion valida y permite reintentar su consulta',async()=>{
  vi.mocked(api.getClientAssignment).mockRejectedValueOnce(new Error('No tienes empresa asignada.'));
  render(<MisDevolucionesPage/>);await screen.findByText('No tienes empresa asignada.');submit();
  expect(api.createRequest).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'Reintentar empresa'}));await screen.findByText('Empresa A');
 });
 it('impide doble envio aun con dos eventos submit antes de terminar',async()=>{
  const pending=deferred<typeof created>();vi.mocked(api.createRequest).mockReturnValue(pending.promise);
  await ready();fill();act(()=>{submit();submit();});
  await waitFor(()=>expect(api.createRequest).toHaveBeenCalledTimes(1));
  expect((screen.getByLabelText(/Código del artículo/) as HTMLInputElement).disabled).toBe(true);
  await act(async()=>{pending.resolve(created);});await screen.findByText(/Recibimos su solicitud/);
 });
 it.each([undefined,408,409,500])('conserva clave ante resultado incierto %s; nuevo envio cambia la clave',async(status)=>{
  vi.mocked(api.createRequest).mockRejectedValueOnce(status?new api.RequestApiError(status,'Tiempo agotado'):new Error('Tiempo agotado')).mockResolvedValue(created);
  await ready();fill();submit();await screen.findByText('Tiempo agotado');
  const first=vi.mocked(api.createRequest).mock.calls[0];
  expect(first[1]).toMatch(/^[0-9a-f-]{36}$/);
  expect((screen.getByLabelText(/Nombre del artículo/) as HTMLInputElement).disabled).toBe(true);
  submit();await screen.findByText(/Recibimos su solicitud/);
  expect(vi.mocked(api.createRequest).mock.calls[1]).toEqual(first);
  fireEvent.click(screen.getByRole('button',{name:'Nueva solicitud'}));fill();submit();
  await waitFor(()=>expect(api.createRequest).toHaveBeenCalledTimes(3));
  expect(vi.mocked(api.createRequest).mock.calls[2][1]).not.toBe(first[1]);
 });
 it('no confirma si falla una subida y conserva los archivos subidos al reintentar',async()=>{
  vi.mocked(api.uploadFile).mockResolvedValueOnce({key:'photo-key'}).mockRejectedValueOnce(new Error('Fallo de video')).mockResolvedValueOnce({key:'video-key'});
  await ready();fill();fireEvent.change(screen.getByLabelText('Archivos del artículo 1'),{target:{files:[
   new File(['x'],'foto.jpg',{type:'image/jpeg'}),new File(['x'],'video.mp4',{type:'video/mp4'})]}});
  submit();await screen.findByText('Fallo de video');expect(api.createRequest).not.toHaveBeenCalled();
  expect(screen.queryByText(/Recibimos su solicitud/)).toBeNull();submit();await screen.findByText(/Recibimos su solicitud/);
  expect(api.uploadFile).toHaveBeenCalledTimes(3);
  expect(vi.mocked(api.createRequest).mock.calls[0][0][0].files).toEqual([{key:'photo-key'},{key:'video-key'}]);
 });
 it('un error 403 de captura no se presenta como solicitud enviada',async()=>{
  vi.mocked(api.createRequest).mockRejectedValue(new api.RequestApiError(403,'Destino no autorizado'));
  await ready();fill();submit();await screen.findByText('Destino no autorizado');
  expect(screen.queryByText(/Recibimos su solicitud/)).toBeNull();
 });
 it('muestra detalle historico, empresa y motivo de rechazo sin acciones de operador',async()=>{
  await ready();await openDetail();const modal=screen.getByRole('dialog');
  expect(within(modal).getByText('Empresa A')).toBeTruthy();expect(within(modal).getByText('COD-1')).toBeTruthy();
  expect(within(modal).getByText(/Operador de prueba/)).toBeTruthy();
  expect(within(modal).queryByRole('button',{name:/Aprobar|Rechazar/})).toBeNull();
 });
 it('firma fotos y videos por ID y renueva tras un error de imagen',async()=>{
  await ready();await openDetail();fireEvent.click(screen.getByRole('button',{name:'Ver foto 1'}));
  const image=await screen.findByAltText('Evidencia foto 1');expect(api.getFileUrl).toHaveBeenLastCalledWith('req-a','file-photo');
  fireEvent.error(image);fireEvent.click(screen.getByRole('button',{name:'Renovar foto 1'}));
  await waitFor(()=>expect(api.getFileUrl).toHaveBeenCalledTimes(2));
  fireEvent.click(screen.getByRole('button',{name:'Ver video 2'}));
  await waitFor(()=>expect(screen.getByLabelText('Evidencia video 2').tagName).toBe('VIDEO'));
  expect(api.getFileUrl).toHaveBeenLastCalledWith('req-a','file-video');
 });
 it('deniega detalle ajeno sin mostrar datos anteriores ni firmar archivos',async()=>{
  await ready();await openDetail();fireEvent.click(screen.getByRole('button',{name:'Cerrar detalle'}));
  vi.mocked(api.getRequest).mockRejectedValue(new Error('Solicitud no encontrada.'));
  fireEvent.click(screen.getByRole('button',{name:`Ver detalle ${created.request_number}`}));
  await screen.findByText('Solicitud no encontrada.');expect(screen.queryByText('Falta evidencia del empaque')).toBeNull();
  expect(api.getFileUrl).not.toHaveBeenCalled();
 });
 it('sin permiso create solo consulta y no muestra formulario de captura',async()=>{
  state.canCreate=false;await ready();expect(screen.queryByRole('button',{name:'Enviar solicitud'})).toBeNull();
  fireEvent.click(screen.getByRole('tab',{name:'Mis solicitudes'}));expect(await screen.findByText(created.request_number)).toBeTruthy();
 });
 it('al cambiar de usuario elimina borrador y resultados de la sesion anterior',async()=>{
  const page=render(<MisDevolucionesPage/>);await screen.findByText('Empresa A');fill();
  state.user={id:'client-b'};vi.mocked(api.getClientAssignment).mockResolvedValue({id:'company-b',name:'Empresa B'});
  page.rerender(<MisDevolucionesPage/>);await screen.findByText('Empresa B');
  expect((screen.getByLabelText(/Código del artículo/) as HTMLInputElement).value).toBe('');
  expect(screen.queryByText('Empresa A')).toBeNull();
 });
 it('no completa un envio pendiente si el usuario cambia durante la subida',async()=>{
  const upload=deferred<{key:string}>();vi.mocked(api.uploadFile).mockReturnValue(upload.promise);
  const page=render(<MisDevolucionesPage/>);await screen.findByText('Empresa A');fill();
  fireEvent.change(screen.getByLabelText('Archivos del artículo 1'),{target:{files:[new File(['x'],'foto.jpg',{type:'image/jpeg'})]}});
  submit();await waitFor(()=>expect(api.uploadFile).toHaveBeenCalledTimes(1));
  state.user={id:'client-b'};vi.mocked(api.getClientAssignment).mockResolvedValue({id:'company-b',name:'Empresa B'});
  page.rerender(<MisDevolucionesPage/>);await screen.findByText('Empresa B');
  await act(async()=>{upload.resolve({key:'old-user-key'});});
  expect(api.createRequest).not.toHaveBeenCalled();
 });
 it('un enlace vencido se retira y puede renovarse sin usar la llave S3',async()=>{
  await ready();await openDetail();vi.useFakeTimers();
  vi.mocked(api.getFileUrl).mockResolvedValue({url:'https://evidence.invalid/photo',kind:'photo',mime_type:'image/jpeg',expires_in:1});
  await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'Ver foto 1'}));});
  expect(screen.getByAltText('Evidencia foto 1')).toBeTruthy();
  await act(async()=>{vi.advanceTimersByTime(1000);});
  expect(screen.queryByAltText('Evidencia foto 1')).toBeNull();expect(screen.getByText(/El enlace venció/)).toBeTruthy();
  await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'Renovar foto 1'}));});
  expect(api.getFileUrl).toHaveBeenCalledTimes(2);
 });
});
