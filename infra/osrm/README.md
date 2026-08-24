# OSRM auto-hospedado (Docker)

Reemplazo del demo público de OSRM (`router.project-osrm.org`) que usa el módulo de Planificación
(`src/pages/planificacion/distance-matrix.ts`, `osrm-config.ts`) para distancias reales de manejo.

## Por qué montar el propio

El demo público **no tiene SLA** — "Service Level Agreement", es decir nadie garantiza que esté
disponible, rápido, ni que siga funcionando mañana. Es gratis y funciona bien para prototipar, pero
tiene rate-limit y se puede caer sin aviso. Montar tu propio OSRM en Docker sigue siendo **gratis**
(sin licencia, sin API key) y le quita esa incertidumbre — vos controlás el uptime.

## 1. Descargar el mapa (extracto OSM)

OSRM necesita datos de OpenStreetMap ya recortados a la región que te interesa. Para Costa Rica:

```bash
mkdir -p data
curl -L -o data/costa-rica-latest.osm.pbf https://download.geofabrik.de/central-america/costa-rica-latest.osm.pbf
```

Para Venezuela (si el módulo se extiende allá):

```bash
curl -L -o data/venezuela-latest.osm.pbf https://download.geofabrik.de/south-america/venezuela-latest.osm.pbf
```

Ambos extractos se actualizan semanalmente en [Geofabrik](https://download.geofabrik.de/) — no hace
falta re-bajar seguido, solo si el mapa real cambió mucho (calles nuevas, etc.).

## 2. Preparar los datos (una sola vez por extracto)

OSRM necesita 3 pasos de preprocesamiento antes de poder servir rutas. Se corren con el mismo
contenedor, montando la misma carpeta `data/`:

```bash
docker run --rm -v "${PWD}/data:/data" osrm/osrm-backend osrm-extract -p /opt/car.lua /data/costa-rica-latest.osm.pbf
docker run --rm -v "${PWD}/data:/data" osrm/osrm-backend osrm-partition /data/costa-rica-latest.osrm
docker run --rm -v "${PWD}/data:/data" osrm/osrm-backend osrm-customize /data/costa-rica-latest.osrm
```

Esto tarda de un par de minutos a ~15-20 min dependiendo del tamaño del extracto y la máquina — para
Costa Rica (país chico) es rápido. Genera varios archivos `.osrm.*` junto al `.osm.pbf` original.

Si vas a servir Venezuela también, hay que repetir estos 3 pasos con ese `.osm.pbf` y correr un
segundo contenedor en otro puerto (o levantar dos servicios en el `docker-compose.yml`, uno por país
— el matcheo de ruta no cruza fronteras entre datasets separados de todas formas).

## 3. Levantar el servidor

```bash
cd infra/osrm
docker compose up -d
```

Verificar que responde:

```bash
curl "http://localhost:5000/route/v1/driving/-84.0833,9.9333;-84.1436,9.9189?overview=false"
```

Debería devolver un JSON con `"code":"Ok"`.

## 4. Apuntar la app a tu servidor

En tu `.env.local` (no versionado):

```
VITE_OSRM_URL="http://localhost:5000"
```

O, si el servidor está en otra máquina/tu servidor propio con dominio:

```
VITE_OSRM_URL="https://osrm.tu-dominio.com"
```

Sin esta variable, la app usa el demo público automáticamente (comportamiento actual, sin cambios).

## Actualizar el mapa más adelante

Repetir los pasos 1 y 2 con un `.osm.pbf` nuevo, y reiniciar el contenedor (`docker compose restart`).
No hay downtime evitable en este setup simple (un solo contenedor) — para eso hace falta blue/green,
fuera de alcance de este prototipo.
