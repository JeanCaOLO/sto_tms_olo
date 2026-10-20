# Proformas del tarifador: agrupación por transportista, aprobación por fases y envío por correo

Fecha: 2026-10-20. Alcance: solo tarifador. Sin despliegue, sin push. La migración SQL queda **sin ejecutar**.

## Qué se pidió
Un flujo nuevo: se liquidan los viajes → se genera la **proforma** → pasa por varias fases de revisión, cada una aprobada por un rol (o un usuario concreto) uno tras otro → queda aprobada → se envía por correo al transportista para que la confirme. Todo configurable por país, con excepciones por proforma y un dashboard de pendientes.

## Generación AUTOMÁTICA (decidido el 2026-10-20, reemplaza al botón "Nueva proforma")
- Al **emitir o re-liquidar**, la liquidación entra sola a la proforma **abierta** de su transportista; si no hay, se crea (`src/lib/tarifas/proformas/autoAssign.ts`, enganchado en `emitSettlement` y `reliquidateSettlement`). Un fallo al asignar nunca tumba la emisión.
- **Abierta** = En Revisión y sin ninguna fase decidida. Tras la primera decisión se cierra y la siguiente liquidación abre otra.
- **Sin fases en el país**: se liquida normal y la liquidación queda en Borrador. El **barrido** (`assignPendingSettlements`) la agrupa al guardar las fases y cada vez que se abre Proformas (si el usuario puede editar proformas). Cubre también lo liquidado antes de esta función.
- Re-liquidar una liquidación que está dentro de una proforma se bloquea con mensaje (excluirla o anular la proforma primero).
- Backend: quien liquida (`tarifas`) puede crear y sumar a proformas; el estado y las fases siguen protegidos.

## Decisiones
- **Proforma = varias liquidaciones de UN transportista** (se puede excluir una y aprobar el resto). Una liquidación está incluida en una sola proforma a la vez.
- **Mismos estados que la liquidación** (Borrador / En Revisión / Aprobado / Pagado / Anulado). La liquidación sigue a la proforma: al agruparla pasa a *En Revisión*, al aprobarse la proforma a *Aprobado*, si se excluye o anula vuelve a *Borrador*. Desde el Historial de Liquidaciones ya no se pasa a mano a *En Revisión*/*Aprobado* (lo lleva la proforma).
- "Liquidado" del flujo = estado **Aprobado** (última fase aprobada). *Pagado* queda para el pago real. Si debe ser *Pagado*, cambia `resolveStatus` (front y `proformas_flow.py`).
- Plantilla de fases **por país**; al crear la proforma se **copia** (snapshot): cambiar la plantilla no toca las proformas en curso. Cada fase = un rol (cualquier usuario con ese rol) o un usuario concreto.
- **Quitar fases de una proforma puntual: solo administradores** (`is_admin` del backend = `SuperAdministrador`, `SuperUsuario`, `Administrador`, `Admin`). El admin **no aprueba por otros**: solo quita.
- Rechazar exige motivo y devuelve la proforma a *Borrador*; "Reenviar a revisión" reinicia las fases (las quitadas siguen quitadas).
- Quién puede aprobar lo decide el **servidor** (`POST /api/tarifas/proformas/{id}/decision`); la API genérica rechaza (405) escribir fases o el estado de una proforma.

## Piezas
| Capa | Archivos |
|---|---|
| Datos | `sql/46_proformas.sql` (5 tablas `tarifas_proforma*`, módulo `tarifas.proformas`, grants y bitácora), entidades en `src/lib/tarifas/data/schema.ts`, `sql/04_tarifas.sql` y `schema_manifest.json` regenerados |
| Lógica pura | `src/lib/tarifas/proformas/` (fases, aprobación, totales, agrupación, plantilla de correo, acceso a datos) |
| Backend tarifas | `backend/tarifas/src/proformas_flow.py`, `proformas_api.py`, rutas en `app.py` y `template.yaml` |
| Backend envío | `backend/tarifas-mail/` (Lambda **fuera de la VPC**: OAuth de Google, token por usuario en Secrets Manager, envío por Gmail) |
| Frontend | `src/pages/proformas/` (dashboard, detalle, nueva proforma, configuración), ruta `/proformas`, menú y i18n |

## Correo
- **Auxiliar (siempre):** descarga el PDF y abre Gmail con destinatarios, asunto y mensaje ya armados; la persona adjunta y envía. Después marca "Ya lo envié".
- **Directo (modo configurable):** cada usuario conecta su cuenta de Google una vez (scope `gmail.send`, no lee el buzón); el refresh token se guarda y "Enviar ahora" manda el correo con el PDF adjunto.
- Destinatarios: los fijos del país + (opcional) el correo del transportista del catálogo (`carriers.email`).
- El PDF se genera en el navegador (`jspdf` + `html2canvas`, cargados bajo demanda). Es una imagen: el texto no es seleccionable.

## Probar el envío directo con Google EN LOCAL (sin desplegar)
1. Google Cloud Console → proyecto → *APIs y servicios* → habilitar **Gmail API** → *Pantalla de consentimiento* (tipo Interno si la cuenta es de un Workspace propio; si no, Externo en modo prueba y agrega tu correo como usuario de prueba) → scope `.../auth/gmail.send`.
2. *Credenciales* → Crear ID de cliente OAuth → **Aplicación web** → URI de redirección autorizada: `http://localhost:3000/api/tarifas-mail/google/callback`.
3. En `.env.local` (ignorado por git; nunca en el repo ni en el chat):
   ```
   GOOGLE_CLIENT_ID=...apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=...
   GOOGLE_TOKEN_DIR=.google-tokens.local
   ```
4. Reiniciar `npm run api:local:base`. En Proformas → Configuración → Forma de envío "Directo" → *Conectar con Google*. El token queda en `GOOGLE_TOKEN_DIR` (carpeta `*.local`, ignorada por git).
En AWS el cliente va en el secreto `/<env>/tms/google-oauth` (consola) y los tokens en Secrets Manager.

## Para poner en marcha (lo hace quien administra la BD / Intelix)
1. Aplicar `sql/46_proformas.sql` (dry-run primero: `node --env-file=.env.local scripts/run-migration.mjs sql/46_proformas.sql`, luego `--execute`). Da el módulo `tarifas.proformas` solo a administradores: asignarlo a los roles en Configuración → Roles.
2. Cargar las **fases del país** en Proformas → Configuración (sin fases no se pueden generar proformas).
3. Desplegar `backend/tarifas` (rutas nuevas y manifiesto).
4. Solo para envío directo: crear el cliente OAuth en Google Cloud, cargar `client_id`/`client_secret` en el secreto `/<env>/tms/google-oauth`, completar `GoogleRedirectUri`/`AppUrl` en `backend/tarifas-mail/samconfig.toml` y desplegar ese stack. Si la cuenta es de un Workspace propio, publicar la app como "Interna" evita la verificación de Google.

## Verificado
Front: `tsc` 0, `eslint` limpio, vitest (lib/tarifas + páginas) verde, `vite build` OK. Backend: pytest 435 verdes. Los 10 errores restantes del backend son del entorno local (falta `boto3`) y afectan a `alerts` y `documents`, no a esto.

## NO verificado
- No se corrió la migración (sin BD). El SQL sale del generador de DDL del propio registro de esquema.
- No se probó el envío real contra Google ni el flujo OAuth (requiere credenciales y despliegue). Los tests simulan Google, Secrets Manager y la invocación a la Lambda de tarifas.
- No se revisó la interfaz en un navegador.

## Límites conocidos
- Excluir/incluir una liquidación (y el total de la proforma) lo valida el front; el servidor no impide editar esos datos por la API genérica a quien tenga `tarifas.proformas`. Las **fases y el estado** sí están protegidos.
- Crear la proforma y excluir liquidaciones cambia el estado de la liquidación, que es del módulo `tarifas`: quien genera proformas necesita también editar `tarifas`.
- Cada usuario conecta su propia cuenta de Google; un envío sale desde la cuenta de quien pulsa el botón.
