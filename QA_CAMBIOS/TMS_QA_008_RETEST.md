# TMS-QA-008 — retest puntual del contrato de evidencias

Fecha: 28/11/2026. Alcance solicitado: un solo pendiente, el más corto. Se revisó únicamente la diferencia de `photo_return`; no se probaron otros pendientes, no se modificó producto ni se consultó BD/AWS.

## Resultado

La prueba existente `test_constants_match_web[EVIDENCE_KINDS]` volvió a fallar: **1 failed, 24 deselected; salida 1**. Duración reportada por pytest: 0.24 segundos. Mobile permite `photo_invoice`, `signature`, `photo_product`, `photo_return`; Tracking web permite los tres primeros. No se declara aprobado el contrato actual.

El diagnóstico muestra una separación explícita de consumidores, y no demuestra pérdida funcional de la foto:

1. `backend/mobile/src/mobile_api/sql.py`, `RETURN_PHOTO_SQL`, obtiene la clave de la evidencia `photo_return` por guía y `client_id`.
2. `backend/mobile/src/mobile_api/stops.py`, registro de devolución, resuelve `photo_client_id` y pasa la clave a la devolución; `INSERT_RETURN_SQL` la guarda en `tbl_returns.photo_url`.
3. `backend/admin/src/admin_returns_sql.py`, `RETURNS_SQL`, devuelve `rt.photo_url`. `admin_returns.py` firma su lectura con `admin_media.signed_photo_url`.
4. `src/pages/devoluciones/parts/ReturnLinesTable.tsx` muestra esa foto con `PhotoPreview`.
5. Tracking limita su consulta `EVIDENCES_SQL` y su tipo `EvidenceKind` a factura, firma y producto. `components/ParadaItem.tsx` ofrece factura/firma para entrega y producto/firma para recolecta.
6. `docs/tracking/mobile/evidencias-y-devoluciones.md` documenta expresamente `photo_return` para contracamión y el consumo de `tbl_returns` desde Devoluciones.

Por tanto, la igualdad estricta entre todos los tipos aceptados por ambos endpoints no representa el diseño documentado vigente. Añadir `photo_return` solamente al backend Tracking tampoco bastaría para cambiar su UI, ni es necesario para el consumidor de Devoluciones existente.

## Tarea concreta para el corrector

Corregir el contrato de pruebas para exigir exactamente los tres tipos comunes y la única extensión mobile permitida, `photo_return`. No sustituirlo por una comprobación genérica de subconjunto que admita extensiones futuras sin revisar. Mantener el rechazo de tipos desconocidos.

Acompañar el ajuste con regresión de la cadena `photo_client_id → photo_return.storage_key → tbl_returns.photo_url → respuesta firmada de Devoluciones`, usando mocks o entorno aislado. No eliminar `photo_return`, ampliar Tracking sin requisito de producto, omitir la prueba ni relajar el resto de las constantes. El probador no implementa una solución paralela al agente corrector.

Estado: **diagnóstico y reproducción completados; corrección del test y retest verde pendientes**. La trazabilidad por código no acredita apertura real de imagen ni permisos S3 actuales.

## Ejecución y límites del entorno

Se seleccionó el único caso `EVIDENCE_KINDS` del archivo `backend/mobile/tests/test_web_contract.py`. El alias Windows de Python no era ejecutable y el launcher del venv tampoco funcionó en el sandbox. Se usó el Python 3.12 ya instalado por uv, agregando al proceso `backend/.venv/Lib/site-packages` para reutilizar pytest y dependencias existentes. No se instaló nada ni se cambiaron permisos o configuración.

Invocación equivalente realizada desde la raíz del workspace mediante entrada estándar de Python:

```python
import sys
sys.path.insert(0, 'TMS AHORA SI/backend/.venv/Lib/site-packages')
import pytest
sys.exit(pytest.main([
    'TMS AHORA SI/backend/mobile/tests/test_web_contract.py',
    '-q', '-k', 'EVIDENCE_KINDS', '-ra',
]))
```

Pytest emitió tres advertencias por no poder escribir su caché. La prueba sí se ejecutó y falló por la aserción indicada; no fue un fallo de colección. Registro local: `%TEMP%/qa-photo-return-contract-20261128.log`. No se alteraron permisos para escribir caché.

Documento local, sin commit ni push, conforme a AGENTS.md vigente.


## Autorización posterior de publicación

El usuario autorizó después el commit y push de esta documentación a `QA_CAMBIOS/`: mobile a `origin/QA` y TMS a `origin/dylan-tarifas`. Las notas anteriores de estado local describen el momento de las pruebas. Esta publicación contiene solo documentos QA, sin código de producto ni cambios de datos.
