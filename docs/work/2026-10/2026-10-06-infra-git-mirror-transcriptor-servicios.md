# Bitácora de infraestructura y operaciones — 2026-10-06

> **Autor:** Jesús Araujo
> Registro de lo NO-código: transcriptor local, servicios de demo, Git/mirror,
> sincronización de ramas, poblado de datos y documentación. Complementa la
> bitácora de features del mismo día (regenerar plan, alerta, contexto en vivo).

---

## 0. Resumen

- **Transcriptor local** de reuniones (audio/video → mp3 → texto .txt/.srt).
- **Servicios de demo** (túnel Aurora + backend + frontend) y por qué se caen.
- **Maté el mirror GitLab→GitHub** y definí la nueva política de sincronización.
- **Sincronicé ramas** GitLab ↔ GitHub y arreglé el incidente de `dylan-tarifas`.
- **Poblé octubre** con pedidos concentrados por zona para la demo.
- **Documenté reuniones** en Notion.

---

## 1. Transcriptor local de reuniones

Ubicación: `C:\Users\jaraujo\Documents\DesarrolloExterno\convertidor-mp3\any-to-mp3`.

- **Qué hace:** convierte cualquier audio/video a **mp3** (Node + `fluent-ffmpeg`, binario embebido con `@ffmpeg-installer/ffmpeg`, sin instalar FFmpeg en el SO) y luego transcribe a **`.txt` + `.srt`**. Todo sale en la carpeta `output/`.
- **Mejora que hice:** `script.js` ahora acepta la ruta por argumento:
  `node script.js "ruta\al\archivo.mkv" [otro.mp4 ...]` — `convertToMp3` devuelve Promise, crea `output/` si no existe, procesa varios archivos y termina con código de salida. Sin rutas hardcodeadas.
- **Uso real:** con esto pasé los dailies y reuniones a texto para resumirlos y subirlos a Notion.

## 2. Servicios de demo (local)

Tres procesos para mostrar Planificación:
1. **Túnel SSM a Aurora** → `localhost:15432`
   `aws ssm start-session --target i-062fc98e8e26c0f79 --document-name AWS-StartPortForwardingSessionToRemoteHost --parameters '{"host":["db-tms-olo.cluster-cjo2ss6io0lb.us-east-2.rds.amazonaws.com"],"portNumber":["5432"],"localPortNumber":["15432"]}' --profile ext-claude --region us-east-2`
   (el plugin `session-manager-plugin` está en `C:\Users\jaraujo\smp`).
2. **Backend** en `:4000` — corrido **desde el repo TMS-Backend propio** (su `src/` es idéntico al `backend-planif/` del monorepo; el repo es SAM/Lambda, se usa un runner HTTP local para dev).
3. **Frontend** Vite (`pnpm dev`) — suele quedar en `:3000/3001/3002`.

> **Se caen solos:** el túnel SSM se desconecta por inactividad (lado AWS) y los procesos en background se matan a las ~2h. Para demos estables conviene correrlos en **terminales de PowerShell propias**, no desde el agente.

## 3. Git — mirror y política de sincronización

- **Había un push-mirror GitLab→GitHub** que forzaba GitHub a igualar GitLab. Cuando GitHub iba adelante (PRs mergeados ahí), el mirror **revertía** ramas (le pisó un commit a Dylan en `dylan-tarifas`). Nada se destruyó, pero causaba confusión.
- **Lo matamos** (Jesús lo quitó en GitLab: *Settings → Repository → Mirroring repositories → 🗑️*,
  URL `https://git.intelix.biz/olo/tms/TMS-Frontend/-/settings/repository`).
- **Nueva política (acordada):** **GitHub es la fuente de verdad** (normalmente adelantada). GitLab se pone al día **desde** GitHub por **fast-forward**, nunca `--force`. Si una rama divergiera, se avisa y se resuelve a mano (no se fuerza).

## 4. Sincronización de ramas (hecho hoy)

- `dylan-tarifas` **restaurado** a `628c083` (commit de Dylan) en GitLab y GitHub por fast-forward.
- Todas las ramas quedaron **iguales** GitLab = GitHub: `main cb45c6a`, `planificacion-2 bbd7fb0`, `oms 1c09851`, `dylan-tarifas 628c083`, `dev 4276d9f`, `jesus-planificacion e2381ab`, `Andrey 388671d`, `backup/dev-pre-wmh-2026-09-29 f12bf27`.
- **Merge de `main` → `planificacion-2`** limpio (`bbd7fb0`): planificacion-2 ya trae lo de main (OMS/sandbox) + mi feature del día.

## 5. Datos de demo (Aurora)

- **Poblé octubre** con pedidos **concentrados por zona** (prefijo `SEEDC-`, idempotente): 796 pedidos + 1575 items, cada día con una zona foco de 16-20 paradas en puntos de entrega reales con coordenadas. Objetivo: que un viaje muestre 15-20 paradas (COFERSA lleva 17-20 facturas/camión).
- Helper de demo `agregar_viajes_para_recalcular.js` para disparar la alerta de "regenerar".

## 6. Documentación (Notion)

Subidas al espacio INTELIX:
- Reuniones: **28-sep** (modelo de datos EFLOW/WMH), **5-oct 4pm** (IPRAC, simulador→perfil dev, reglas de viaje/liquidación), **sesión AIDLC** (en *Estándares Intelix*, no en el proyecto).
- Revisé el doc **"Fuentes de datos reales EFLOW/WMH"** para lo que hay que consultar/migrar.

---

## Pendientes abiertos (operativos)

- Guardar el **daily 2026-10-06** en Notion.
- Correr los 3 servicios en terminales propias para demos estables.
- Cuando GitHub avance, sincronizar GitLab (lo mantengo yo, por FF).
