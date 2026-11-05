# 03 — Vínculo usuario Cliente → punto de entrega

**Estado:** pendiente por implementar. Hoy el vínculo vive en `tracking_client_access` (m07) y se carga **por SQL**; sin fila, el cliente no ve nada.

## Qué falta
- Una pantalla (o un paso en la alta de usuario) para asignar a un usuario con rol `Cliente` su punto de entrega o cliente destino. Eso está en `backend/admin` / Configuración, **fuera del alcance de Tracking**: hay que acordarlo con quien administre ese módulo.
- Alternativa dentro de Tracking: un endpoint administrativo `POST /api/v1/tracking/accesos-cliente` (permiso `tracking:edit`) y una pantalla pequeña en `/tracking` solo para administradores.
- `user_scopes` solo llega a la compañía (`customer_id`): sin vínculo a nivel punto, el cliente vería todas las tiendas de EPA.

## Ejemplo de carga manual
La tabla real es `tbl_tracking_client_access` y la vista `tracking_client_access` acepta el `insert` (ver [02](./02-aplicar-migraciones-y-prueba-e2e.md)). `app_users` y `delivery_points` también son vistas sobre `tbl_*`, pero se pueden consultar igual.
```sql
insert into tracking_client_access (organization_id, app_user_id, delivery_point_id)
select u.organization_id, u.id, dp.id
from app_users u, delivery_points dp
where u.email = 'cliente@tienda.com' and dp.name = 'EPA Escazú';
```

## También pendiente
- Notificación en la cuenta TMS del cliente (campana) cuando salga su pedido: hoy la campana (`NotificationsMenu`) solo lee vencimientos de `backend/alerts`.
