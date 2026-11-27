# Handoff del probador para TMS-QA-001

Corte: 27/11/2026. Responde al diagnóstico del corrector e6f41525. El probador confirma que **terminó el uso de las dos cuentas de QAFL-20261127-HTTP-590570**: no se volverán a usar ni se necesita conservar acceso. No son la sesión histórica del navegador (viaje QAFL-20261127-04). Coordinar el retiro por IDs y preservar auditoría. No se dispone de sus contraseñas, que solo existieron en memoria.

## Evidencia que faltaba al corrector

- **Actualización 21:40:38 UTC del 27/11:** el probador retiró el acceso temporal ya sin uso. Ambos usuarios están inactivos, con 0 scopes, 0 credenciales y 0 refresh tokens sin revocar, verificados en BD. Evidencia qa-mobile-retirar-acceso.json; salida 0. Los usuarios, la devolución y tres evidencias se conservan. No hace falta repetir el retiro de acceso ni esperar nuevas cuentas; sigue pendiente el retiro compatible del historial y la regresión del helper. Sin tokens originales no se acredita retest HTTP de su revocación; el contexto móvil tiene TTL máximo de 60 segundos. No tocar la sesión histórica del navegador.

- Se consultó S3 con el perfil ya existente y autorizado, sin copiar ni modificar credenciales. Cuenta y propietario verificados. Las tres claves exactas dieron cero versiones y cero delete markers. Evidencia local qa-reanudacion-s3.json, salida 0. Esto supera el bloqueo de comprobación S3 por credenciales de la otra sesión; no autoriza cambiar proveedores o credenciales en ella.
- El probe de BD confirma las tres referencias de evidencia y la devolución recibida 954aed29-67ce-439d-9f3d-03f01610f846. Los usuarios seguían activos al consultarlos. No se mutó nada en esta ronda.
- Error exacto de la limpieza original: `update or delete on table "tbl_order_items" violates foreign key constraint "tbl_returns_order_item_id_fkey" on table "tbl_returns"`. Salida del script: 1. Los DELETE reportados en removed_children se revirtieron; no son confirmación de limpieza.
- La tabla tbl_returns no tiene route_id. El filtro por columnas del helper omite esa tabla y deja la devolución referenciando la línea del pedido.
- La prueba funcional anterior terminó: 30 comprobaciones aprobadas, incluida recepción. No reejecutar el generador de fixtures. El retiro compatible y el retest siguen pendientes; este handoff no los certifica.

## Extracto original del helper

Transcripción del bloque clean() de `.test/pruebasGenerales/qa-mobile-http.py`. **Contiene el fallo diagnosticado; no es una solución ni debe ejecutarse tal cual.** No incluye credenciales ni sesiones. report procede del manifiesto publicado por IDs; image era el PNG QA. s3_client usa el perfil existente. BUCKET y ACCOUNT corresponden al entorno de evidencias autorizado; no sustituirlos por destinos nuevos. Se omite deliberadamente la creación de fixtures y autenticación.

```python
def clean():
    owned = report['owned']
    route_ids = owned.get('tbl_routes', [])
    guide_ids = owned.get('tbl_dispatch_guides', [])
    user_ids = owned.get('tbl_app_users', [])
    auth_ids = owned.get('tbl_auth_credentials', [])
    # Solo versiones de llaves aleatorias propias. No se borran prefijos ni objetos ajenos.
    for item in report['objects']:
        assert item['key'].endswith(item['client_id'] + '.png')
        assert '/' + owned['tbl_orders'][0] + '/' in item['key']
        try:
            head = s3_client.head_object(Bucket=BUCKET, Key=item['key'], ExpectedBucketOwner=ACCOUNT)
            assert head['Metadata'].get('pedido-id') == owned['tbl_orders'][0]
            assert head['ContentLength'] == len(image)
        except ClientError as error:
            if error.response['Error']['Code'] not in ('404', 'NoSuchKey', 'NotFound'):
                raise
        versions = s3_client.list_object_versions(Bucket=BUCKET, Prefix=item['key'], ExpectedBucketOwner=ACCOUNT)
        assert not versions.get('IsTruncated'), 'Listado inesperado: no se amplía el borrado'
        for version in [*versions.get('Versions', []), *versions.get('DeleteMarkers', [])]:
            if version['Key'] == item['key']:
                s3_client.delete_object(Bucket=BUCKET, Key=item['key'], VersionId=version['VersionId'], ExpectedBucketOwner=ACCOUNT)
        left = s3_client.list_object_versions(Bucket=BUCKET, Prefix=item['key'], ExpectedBucketOwner=ACCOUNT)
        assert not any(row['Key'] == item['key'] for row in [*left.get('Versions', []), *left.get('DeleteMarkers', [])])
    with pg.transaction() as run:
        # No se borra auditoría. Se limita cada tabla derivada a rutas, guías o usuarios propios.
        linked = {'tbl_returns': ('route_id', route_ids), 'tbl_tracking_evidences': ('route_id', route_ids),
                  'tbl_tracking_events': ('route_id', route_ids), 'tbl_tracking_positions': ('route_id', route_ids),
                  'tbl_tracking_last_positions': ('route_id', route_ids),
                  'tbl_tracking_stop_visits': ('dispatch_guide_id', guide_ids),
                  'tbl_mobile_refresh_tokens': ('app_user_id', user_ids), 'tbl_driver_presence': ('app_user_id', user_ids)}
        columns = {(row['table_name'], row['column_name']) for row in run(
            "SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public'")}
        for table, (column, ids) in linked.items():
            if ids and (table, column) in columns:
                rows = run(f'DELETE FROM {table} WHERE "{column}"::text=ANY(%s) RETURNING *', [ids])
                report.setdefault('removed_children', {})[table] = len(rows)
        for table in ('tbl_dispatch_guides', 'tbl_routes', 'tbl_order_items', 'tbl_orders', 'tbl_drivers', 'tbl_vehicles'):
            ids = owned.get(table, [])
            if ids:
                rows = run(f'DELETE FROM {table} WHERE id::text=ANY(%s) RETURNING id', [ids])
                assert len(rows) == len(ids), f'No coinciden IDs al retirar {table}'
        if user_ids:
            run('DELETE FROM tbl_user_scopes WHERE app_user_id::text=ANY(%s)', [user_ids])
            run('DELETE FROM tbl_app_users WHERE id::text=ANY(%s)', [user_ids])
        if auth_ids:
            run('DELETE FROM tbl_auth_credentials WHERE auth_user_id::text=ANY(%s)', [auth_ids])
    for table, ids in owned.items():
        key = 'auth_user_id' if table == 'tbl_auth_credentials' else 'id'
        assert not pg.query(f'SELECT 1 FROM {table} WHERE "{key}"::text=ANY(%s)', [ids]), f'Residuo en {table}'
    report['cleanup'] = 'removed_and_verified'
    save()
```

## Continuidad mobile si la otra sesión no puede acceder a TRACKING_TMS

No cambiar credenciales, remotos ni permisos para sortear el bloqueo. El canal canónico sigue siendo origin/QA de DylanOLO5/TRACKING_TMS. El probador publicó allí:

- MOB-QA-004, P2: selector permite 2 unidades y avanzar a paso 2 con remaining=1; quantity=2. Reproducción UI real con línea 112d5f85-39c2-447c-bf1b-dd9e24d3b00f del lote histórico. return-form.tsx usa item.quantity como máximo. No se envió la devolución.
- MOB-QA-003, P2: entrada manual sin código acepta el nombre ficticio QAFL-20261127-MANUAL-INEXISTENTE y avanza con un solo artículo a foto/motivo. Handler rechaza producto desconocido con 422 en prueba existente con BD simulada; no se guardó ni encoló nada por UI. Un nombre/código que identifique exactamente una línea real es un caso distinto.
- MOB-QA-001: el usuario autorizó después el reintento específico de las tres acciones. Se intentó y falló porque Chrome no encuentra el blob de la imagen (`ERR_FILE_NOT_FOUND`). La UI oculta la causa bajo un mensaje genérico. Antes/después en BD: 0 evidencias y 0 eventos de la primera guía; parada pendiente y ruta 1/3 sin cambio. Las tres acciones siguen conservadas. No descartarlas ni tocarlas desde la sesión correctora. MOB-QA-007 añade un aviso de foco/aria-hidden observado al abrir el modal; no se certifica lector de pantalla.

Este resumen facilita coordinación; no duplica propiedad ni reemplaza el canal mobile. Para corregir mobile hace falta un checkout autorizado con la base vigente disponible. Registrar el bloqueo si no existe, sin fingir corrección sobre una versión antigua.
