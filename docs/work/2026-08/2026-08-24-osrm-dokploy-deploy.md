# 2026-08-24 — OSRM auto-hospedado desplegado en Dokploy (osrm.jesusaraujo.lat)

## What changed
Desplegado el OSRM self-hosted (diseñado antes hoy en `infra/osrm/`) al Dokploy propio del usuario, usando el subagente/skill `estibador`. Quedó corriendo en `https://osrm.jesusaraujo.lat`, proyecto "UTILES" del panel, con HTTPS de Let's Encrypt. En el camino se encontraron y arreglaron **dos bugs reales** en el `docker-compose.yml` que el deploy en un servidor remoto expuso (no aparecían en el diseño local porque nunca se habían corrido de verdad):

1. **`osrm/osrm-backend` está construida sobre Debian Stretch (EOL)** — su `apt-get install curl` de respaldo fallaba con 404 (los repos de Stretch ya no existen), y el contenedor entraba en crash-loop reintentando la descarga sin parar. Arreglado separando la descarga a un servicio nuevo (`osrm-fetch`, imagen `curlimages/curl`), que corre una vez y termina; `osrm` solo espera a que el archivo aparezca en el volumen compartido.
2. **`curlimages/curl` corre como usuario no-root por defecto** — sin permiso de escritura sobre el volumen Docker (creado con dueño root en el primer intento), fallaba con `curl: (23) Failure writing output`. Arreglado con `user: "0:0"` en el servicio `osrm-fetch`.

## Why
El usuario pidió explícitamente usar Estibador para este deploy, y aclaró que era para el servicio de mapas (OSRM), no para la app de TMS. Con su Dokploy real y su dominio (`jesusaraujo.lat`), esto deja de ser un plan en un README y pasa a ser la instancia real de OSRM que va a alimentar `distance-matrix.ts`/`route-geometry.ts` en cuanto se le apunte con `VITE_OSRM_URL`.

## How
Seguí el workflow documentado del agente `estibador` (`agents/estibador.md` del plugin): PASO 0 obligatorio fue confirmar con el usuario el uso de la API key que había pegado en el chat (ya expuesta, se le avisó que la regenere) y aclarar el objetivo real (OSRM, no el repo). Con la key, usé la API REST de Dokploy directamente vía curl (PowerShell, con los payloads JSON armados en archivos para evitar problemas de escaping) en vez del MCP oficial (`@dokploy/mcp`) — el MCP no estaba conectado en esta sesión y conectarlo hubiese requerido reiniciar la sesión de Claude Code, así que fue más rápido ir directo a la API que la skill documenta como respaldo. Flujo: `project.all` (verificar auth + ubicar el proyecto/environment de la URL que dio el usuario) → `compose.create` → `compose.update` (con el `docker-compose.yml` completo como `sourceType: raw`, sin necesitar acceso a un repo Git) → `compose.deploy` → `domain.create` (`osrm.jesusaraujo.lat`, HTTPS Let's Encrypt, mirando el `domain` ya configurado de `dozzle.irissoftware.lat` en el mismo proyecto como referencia del schema exacto) → redeploy para que Traefik tomara el dominio nuevo.

Cuando el primer deploy quedó en crash-loop, diagnostiqué con `docker.getContainersByAppNameMatch` (no encontré el endpoint de logs por contenedor, pero el exit code del contenedor —23— y el log que pegó el usuario fueron suficientes para diagnosticar sin necesitar logs completos). Cada fix se probó con un ciclo completo `compose.update` → `compose.deploy` → poll de `docker.getContainersByAppNameMatch` hasta confirmar `osrm-fetch` en `Exited (0)`, y finalmente un poll real contra `https://osrm.jesusaraujo.lat/route/v1/driving/...` hasta recibir `"code":"Ok"`.

## Promoted knowledge
`infra/osrm/docker-compose.yml` y `README.md` actualizados con el diseño de dos servicios (`osrm-fetch` + `osrm`) — el README anterior (un solo servicio con `apt-get` de respaldo) nunca hubiera funcionado en un deploy real; quedó reemplazado, no solo parchado.

## Follow-ups
- [ ] El usuario debe regenerar la API key de Dokploy que pegó en el chat (Profile → API/CLI) — se usó para este deploy pero quedó expuesta en el historial de la conversación.
- [ ] Falta que el usuario agregue `VITE_OSRM_URL="https://osrm.jesusaraujo.lat"` a su `.env.local` para que la app deje de usar el demo público de OSRM.
- [ ] Solo Costa Rica está desplegado — Venezuela (si el módulo lo necesita) requiere otro servicio en el mismo compose apuntando a `venezuela-latest.osm.pbf` (ver README actualizado).
- [ ] No se conectó el MCP oficial de Dokploy (`@dokploy/mcp`) en esta sesión — se usó la API REST directo. Si se retoma trabajo de infra seguido, vale la pena configurarlo (requiere reinicio de sesión de Claude Code) para no repetir el patrón de armar JSON a mano en cada llamada.
