# 2026-11-13 — Motor de ruteo, fase 2: OSRM propio y cliente en el backend

Rama `motor-ruteo-fase2` (desde `motor-ruteo-fase1`). Sin migraciones. La planificación no
cambia de resultado: la heurística sigue en línea recta; el OSRM queda disponible para el
solver (fase 3) y el T-n por carretera (fase 5).

## Qué cambió
- **Stack nuevo `dev-tms-osrm`** (`infra/osrm/template.yaml`, se despliega con
  `python scripts/sandbox/deploy_backend.py osrm`): EC2 `t3.medium` con OSRM y el mapa de
  Costa Rica dentro de la VPC de Aurora, security group que solo abre el puerto 5000 a las
  Lambdas, y dos schedules que la encienden y apagan con el horario de Aurora (L-V 04:45–17:00
  CR). Detalle e identificadores: `docs/reference/aws-inventario-tms.md` §2c.
- **`backend/planning/src/matriz_distancias.py`**: `construir(puntos)` pide la matriz N×N al
  OSRM (`/table`, una llamada, 5 s de espera) y devuelve `{"km", "min", "fuente"}`. Sin
  `OSRM_URL`, sin respuesta o con matriz incompleta cae a línea recta × 1,35 a 30 km/h (los
  mismos supuestos del frontend). Todavía no la consume `motor_ruteo`.
- **`app.handler`**: acción `estado_ruteo` (invocación directa, sin ruta HTTP) para comprobar
  que la Lambda llega al OSRM.
- **`backend/planning/template.yaml`**: parámetro `OsrmUrl` (por defecto vacío) → variable
  `OSRM_URL`. QA y producción no cambian mientras no se les pase el parámetro.
- **`scripts/sandbox/deploy_backend.py`**: stack `osrm` (antes de `planning`) y paso
  automático de su URL a `planning`.

## Por qué
Las Lambdas están en subnets privadas sin NAT: no pueden usar un OSRM público. El servidor
tiene que vivir en la VPC. La instancia está en una subnet pública solo para descargar la
imagen y el mapa en el primer arranque; no acepta entrada desde internet.

## Verificación
- Backend: 647 → 659 tests en verde (`tests/test_matriz_distancias.py`: OSRM responde, URL
  por entorno, respuesta inválida o incompleta, OSRM caído, sin red con menos de dos puntos, y
  la acción de la Lambda).
- Sandbox, invocando la Lambda desplegada (`{"accion": "estado_ruteo"}`):
  - Antes de que OSRM terminara de procesar el mapa: `fuente: haversine` (el respaldo
    funciona). San José–Liberia: 225,5 km y 451 min estimados.
  - Con OSRM listo: `fuente: osrm`. San José–Cartago 23,7 km y 32 min; San José–Liberia
    213,2 km y 243 min.
  - Tras apagar y encender la instancia a mano: misma IP privada (`172.31.36.131`) y
    `fuente: osrm` sin intervención.
- El primer arranque (instalar Docker, bajar y procesar el mapa) tardó unos minutos.
- No se probó el encendido y apagado por schedule (primera corrida: hoy 17:00 y el lunes
  04:45), ni la matriz con el tamaño real de un día de pedidos.

## Desplegado
`dev-tms-osrm` (nuevo) y `dev-tms-planning` (redesplegado con `OSRM_URL`). El redespliegue de
`planning` salió de esta rama, así que el sandbox ya corre también la fase 1 (refactor sin
cambio de comportamiento).

## Pendiente
El frontend sigue usando el OSRM público de demostración: el propio no es alcanzable desde el
navegador. Ver `docs/planificacion/pendientes/06-motor-de-ruteo-fases.md`.
