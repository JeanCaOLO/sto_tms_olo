# Reprueba completa con el backend nuevo en local (2026-10-08)

Entorno: backend del repo en `127.0.0.1:4010` (`backend/local/serve.py`, con `TMS_PERMS_TTL_SECONDS=30`, `TMS_STATEMENT_TIMEOUT_MS=10000`, `TMS_LOCK_TIMEOUT_MS=5000`, como la plantilla), segundo Vite en `localhost:3001`, Aurora por el túnel, Chrome con la extensión. Nada se desplegó ni se subió. Los tiempos locales sirven para comparar versiones y contar llamadas: el servidor local atiende una petición a la vez y cada consulta pasa por el túnel (~85 ms).

## 1. Los 16 viajes liquidables (el 17.º, RT-DEMO-2, ya tiene liquidación)
Todos calculan, ninguno con error. Totales idénticos a los verificados antes (OLO propia 52 571,29; Transmajori 55 000; etc.).

| Viaje | Transportista | ms | Total | Llamadas |
|---|---|---|---|---|
| RT-DEMO-3 | Mora | 4 998 | 28 224,00 | 6 (2 de lote) |
| RT-DEMO-4 | Acuña y Salazar | 5 001 | 33 000,00 | 6 |
| RT-DEMO-5 | Acuña y Salazar | 1 010 | 33 000,00 | 3 |
| RT-DEMO-6 | Transosa | 5 005 | 34 200,00 | 6 |
| RT-DEMO-7 | Transosa | 1 998 | 30 844,80 | 3 |
| RT-DEMO-8 | Transosa | 1 008 | 36 000,00 | 3 |
| RT-DEMO-9 | Transosa | 1 009 | 58 725,00 | 3 |
| RT-DEMO-10 | Transosa | 814 | 55 800,00 | 3 |
| RT-DEMO-11 | Transosa | 822 | 95 760,00 | 3 |
| RT-DEMO-12 | Hernández | 4 448 | 99 960,00 | 6 |
| RT-DEMO-13 | Hernández | 813 | 98 000,00 | 3 |
| RT-DEMO-14 | Edison | 4 149 | 169 800,00 | 6 |
| RT-DEMO-15 | Edison | 809 | 78 600,00 | 3 |
| RT-DEMO-16 | Jiménez | 4 549 | 37 273,60 | 6 |
| RT-DEMO-17 | OLO (propia) | 4 040 | 52 571,29 | 6 |
| RT-DEMO-18 | Transmajori | 4 242 | 55 000,00 | 6 |

Primera vez por transportista: 4,0–5,0 s (antes 13–15 s). Transportista ya visto: 0,8–2,0 s (antes ~6 s).

## 2. Comparación de versiones (mismo equipo, misma base)
| Escenario | Backend desplegado | Nuevo sin caché de permisos | Nuevo con variables de la plantilla |
|---|---|---|---|
| Modal, transportista visto | 6,0 s / 9 llamadas | 2,0 s / 3 | **1,0 s / 3** |
| Modal, transportista nuevo | 14–15 s / 23–28 | 7,0 s / 6 | **5,0 s / 6** |
| Marcar un pedido y verlo | 4–7 s / ~8 | — | **2,0 s / 4** |
| Cursor sobre "Liquidar" y abrir (transportista nuevo) | — | — | **0,84 s / 3** (sin cursor 4,2 s / 6) |
| Duración por llamada | ~0,6 s | ~0,6 s | ~0,27 s |

## 3. Funciones evaluadas en esta pasada
| Función | Resultado |
|---|---|
| Pestañas Listos (16) / Incompletos (11) / Todos (27) | OK, sin llamadas (0,7 s) |
| Incompletos: botón Liquidar | 11 de 11 deshabilitados, con el motivo "no está completado (estado: planned)" |
| Búsqueda | "Transosa" 6; placa `C162414` 1; "Mora" 2; texto sin coincidencias 0; vacío 16 |
| Selector de columnas | Abre |
| Exportar Excel | 23 553 bytes |
| Filtro Desde/Hasta en la bandeja | Filtra (1 registro) PERO muestra `operator does not exist: text >= date` (ver hallazgo 1) |
| Modal: Resumen, Detalle, Auditoría | Las tres pestañas existen y se abren |
| Variables del viaje | Visibles (Peajes, Horas de espera en Transosa) |
| Devolución: Agregar | Abre 2 campos; el total no cambia (informativa) |
| Liquidar después | 2,0 s; aparece "Parcial / para después" en el reparto |
| Incluir (revertir) | 1,7 s |
| Anular | Pide motivo, no anula sin motivo; con motivo 1,7 s; reparto Cofersa 44 % / EPA 56 % |
| Emitir (RT-DEMO-9) | 2,5 s, LIQ-CR-006, indicador "Listos" 16 → 15 |
| Estados Borrador → En Revisión → Aprobado → Pagado | OK; los indicadores reaccionan (Sin aprobar 158 840,20 → 100 115,20) |
| Re-liquidar con motivo | 4,3 s; LIQ-CR-006 queda "reemplazada por LIQ-CR-007" y bloqueada |
| Anular LIQ-CR-007 | OK; el viaje vuelve a la bandeja (16) |
| Aviso "sin lógica" (OLO, simulado vaciando las estructuras de costo del lote) | "La flota propia "OLO" no tiene con qué calcular este viaje: falta estructura de costos." |
| Enlace a `/tarifas/transportistas?carrier=…&open=rates` | Abre "Tarifarios de Edison Miguel Ureña Ureña" (4,7 s) |
| Enlace a `/tarifas/flota-propia?carrier=…&open=costs` | Abre "Estructura de costos — OLO" (3,1 s) |

No verificado de nuevo en esta pasada: el rechazo de la re-liquidación con motivo vacío (el botón seguía deshabilitado mientras recalculaba, el clic no hizo nada; sí se verificó en la auditoría anterior), el texto interno de Detalle y Auditoría (se comprobó que las pestañas abren; el contenido se verificó el 2026-10-07) y las métricas EMF (no salen en el log local).

## 4. Hallazgos nuevos
1. **Backend nuevo + `settlement_date` en `text`**: el filtro Desde/Hasta devuelve `operator does not exist: text >= date`. Confirma que la migración 28 debe reaplicarse justo después de desplegar (y no antes). Lo demás funciona con `text`, incluida la emisión.
2. **Lista de arranque**: sigue en ~5,5 s en local, pero no es medible aquí porque el servidor local serializa las llamadas (`HANDLER_LOCK`). En AWS corren en paralelo.

## 5. Estado de los datos tras las pruebas
Liquidaciones creadas por estas pruebas, todas Anuladas: LIQ-CR-005 (RT-DEMO-7), LIQ-CR-006 (RT-DEMO-9, reemplazada) y LIQ-CR-007 (RT-DEMO-9). Los pedidos de RT-DEMO-9 quedaron "Incluido". LIQ-CR-004 (RT-DEMO-2, 100 115,20) no es de estas pruebas y no se tocó. `settlement_date` sigue en `text`. Hay registros nuevos en la bitácora.
