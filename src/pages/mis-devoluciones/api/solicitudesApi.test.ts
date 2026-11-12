import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {apiFetch} from '../../../lib/api-client';
import {createRequest,getClientAssignment,getRequest,getFileUrl,uploadFile,RequestApiError,listRequestInbox,approveRequest,rejectRequest} from './solicitudesApi';
vi.mock('../../../lib/api-client',()=>({apiFetch:vi.fn()}));
beforeEach(()=>{vi.resetAllMocks();vi.mocked(apiFetch).mockResolvedValue({ok:true,status:200,body:{data:{id:'req-a'},error:null}});});
afterEach(()=>vi.unstubAllGlobals());
it('envia clave idempotente y articulos sin un destino elegible en el cuerpo',async()=>{
 const items=[{product_code:'MANUAL',product_name:'Producto',quantity:1,reason_code:'danado' as const,files:[]}];
 await createRequest(items,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
 const [path,init]=vi.mocked(apiFetch).mock.calls[0];
 expect(path).toBe('/v1/solicitudes-devolucion');
 expect(JSON.parse(init!.body as string)).toEqual({items,idempotency_key:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'});
});
it('consulta asignacion, detalle y URL por ID sin cache y sin firmar llaves libres',async()=>{
 await getClientAssignment();await getRequest('req/a');await getFileUrl('req/a','file/b');
 expect(vi.mocked(apiFetch).mock.calls.map(([path])=>path)).toEqual([
  '/v1/solicitudes-devolucion/asignacion','/v1/solicitudes-devolucion/req%2Fa',
  '/v1/solicitudes-devolucion/req%2Fa/archivos/file%2Fb/url']);
 expect(vi.mocked(apiFetch).mock.calls.every(([,init])=>init?.cache==='no-store')).toBe(true);
});
it('preserva el estado HTTP para distinguir rechazo confirmado de resultado incierto',async()=>{
 vi.mocked(apiFetch).mockResolvedValue({ok:false,status:403,body:{data:null,error:{message:'Sin acceso'}}});
 await expect(getRequest('other')).rejects.toMatchObject({status:403,message:'Sin acceso'});
 await expect(getRequest('other')).rejects.toBeInstanceOf(RequestApiError);
});
it('una subida S3 fallida no se presenta como completada',async()=>{
 vi.mocked(apiFetch).mockResolvedValue({ok:true,status:200,body:{data:{url:'https://s3.invalid',fields:{key:'own'},key:'own'}}});
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:false,status:503}));
 await expect(uploadFile(new File(['x'],'foto.jpg',{type:'image/jpeg'}))).rejects.toThrow('No se pudo subir');
});
it('bandeja envia filtros y paginacion sin cache',async()=>{
 await listRequestInbox({estado:'pendiente_asignacion',empresa:'company-a',pais:'country-a',limit:25,offset:50});
 const [path,init]=vi.mocked(apiFetch).mock.calls[0];const url=new URL(path,'https://test.invalid');
 expect(Object.fromEntries(url.searchParams)).toEqual({estado:'pendiente_asignacion',empresa:'company-a',pais:'country-a',limit:'25',offset:'50'});
 expect(init?.cache).toBe('no-store');
});
it('decisiones usan rutas de solicitud y rechazo conserva motivo',async()=>{
 await approveRequest('req/a');await rejectRequest('req/a','Motivo');
 expect(vi.mocked(apiFetch).mock.calls[0]).toEqual(['/v1/solicitudes-devolucion/req%2Fa/aprobar',{method:'POST'}]);
 expect(vi.mocked(apiFetch).mock.calls[1]).toEqual(['/v1/solicitudes-devolucion/req%2Fa/rechazar',{method:'POST',body:JSON.stringify({reason:'Motivo'})}]);
});
