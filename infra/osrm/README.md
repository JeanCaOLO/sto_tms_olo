# OSRM auto-hospedado (Docker)

Reemplazo del demo público de OSRM (`router.project-osrm.org`) que usa el módulo de Planificación
(`src/pages/planificacion/distance-matrix.ts`, `route-geometry.ts`, `osrm-config.ts`) para distancias
y trayectos reales de manejo.

## Por qué montar el propio

El demo público **no tiene SLA** — "Service Level Agreement", es decir nadie garantiza que esté
disponible, rápido, ni que siga funcionando mañana. Es gratis y funciona bien para prototipar, pero
tiene rate-limit y se puede caer sin aviso. Montar tu propio OSRM en Docker sigue siendo **gratis**
(sin licencia, sin API key) y le quita esa incertidumbre — vos controlás el uptime.

## Cómo funciona este compose

`docker-compose.yml` se auto-prepara al primer arranque: descarga el extracto OSM de Costa Rica
(Geofabrik) y corre el preprocesamiento de OSRM (`osrm-extract` → `osrm-partition` → `osrm-customize`)
dentro del propio contenedor, sin pasos manuales previos ni SSH. El resultado se guarda en el volumen
Docker `osrm-data`, así que solo pasa una vez — los reinicios y redeploys posteriores arrancan al
instante porque el volumen ya tiene los `.osrm` generados.

**Techo conocido:** el primer arranque tarda varios minutos (depende del tamaño del extracto y de la
máquina) y necesita que el contenedor tenga salida a internet para bajar el `.osm.pbf` de Geofabrik.
Si el panel de despliegue marca el servicio como "unhealthy" en ese primer minuto, es normal — todavía
está preparando los datos, no revisar logs como si fuera un error.

## Desplegar

### Localmente (Docker Compose directo)

```bash
cd infra/osrm
docker compose up -d
docker compose logs -f   # ver el progreso del primer arranque
```

Verificar que responde una vez listo:

```bash
curl "http://localhost:5000/route/v1/driving/-84.0833,9.9333;-84.1436,9.9189?overview=false"
```

Debería devolver un JSON con `"code":"Ok"`.

### En un panel Dokploy (u otro orquestador de compose)

Crear una aplicación tipo **Compose**, apuntarla a este `docker-compose.yml` (por Git o pegando el
contenido), y desplegar — no requiere ningún paso previo en el servidor. El propio contenedor se
prepara solo la primera vez.

## Cambiar de región (Venezuela, otro país)

Editar las variables de entorno del servicio en `docker-compose.yml`:

```yaml
environment:
  OSRM_PBF_URL: "https://download.geofabrik.de/south-america/venezuela-latest.osm.pbf"
  OSRM_DATASET_NAME: "venezuela-latest"
```

Si necesitás Costa Rica **y** Venezuela sirviendo al mismo tiempo, duplicá el servicio en el compose
(otro nombre, otro puerto, otro volumen) — son dos datasets separados, OSRM no cruza fronteras entre
extractos de todas formas.

## Apuntar la app a tu servidor

En tu `.env.local` (no versionado):

```
VITE_OSRM_URL="http://localhost:5000"
```

O, con tu servidor propio:

```
VITE_OSRM_URL="https://osrm.tu-dominio.com"
```

Sin esta variable, la app usa el demo público automáticamente (comportamiento actual, sin cambios).

## Actualizar el mapa más adelante

El volumen `osrm-data` persiste entre despliegues — para forzar un reproceso con un mapa más reciente,
borrar el volumen (`docker compose down -v`) y volver a levantar; el contenedor vuelve a descargar y
procesar desde cero.

## En AWS (sandbox del TMS)

El backend de Planificación corre en Lambdas dentro de la VPC, sin salida a internet, así que su
OSRM vive en la misma VPC: stack `dev-tms-osrm` (`template.yaml` en esta carpeta).

```bash
python scripts/sandbox/deploy_backend.py osrm       # crea o actualiza la instancia
python scripts/sandbox/deploy_backend.py planning   # le pasa las URLs (variable OSRM_URL)
```

- Un contenedor por país: **Costa Rica en :5000 y Venezuela en :5001**. El backend elige el mapa
  por el país del almacén (`OSRM_URL = "CR=http://<ip>:5000;VN=http://<ip>:5001"`).
- Hace lo mismo que el compose (bajar el mapa, procesarlo, servir), pero con comandos de Docker
  en el primer arranque de la instancia. Costa Rica tarda unos minutos; Venezuela, más.
- Solo lo alcanzan las Lambdas del TMS (security group). No sirve para el frontend ni para el
  desarrollo local: esos siguen con `VITE_OSRM_URL` o con el compose.
- Se enciende y apaga con el horario de Aurora (L-V 04:45–17:00 hora de Costa Rica).
- Comprobar: invocar la Lambda de planning con `{"accion": "estado_ruteo"}` y ver
  `regiones.CR.fuente` y `regiones.VN.fuente` = `"osrm"`.
- **Agregar un país o actualizar un mapa:** editar la función `mapa` del `UserData` y renombrar
  el recurso lógico de la instancia (el `UserData` solo corre en el primer arranque). Se crea una
  instancia nueva y la IP cambia: redesplegar `planning` después. Si el país es nuevo, sumarlo a
  `REGIONES` en `backend/planning/src/ruta_geo.py`.

Identificadores, costo y detalle: `docs/reference/aws-inventario-tms.md` §2c.
