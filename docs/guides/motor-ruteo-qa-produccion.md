# Motor de ruteo en QA y producción (guía para Intelix)

El motor de ruteo de Planificación (OR-Tools + OSRM propio) corre hoy en el sandbox. Esta
guía dice qué hace falta para llevarlo a QA y producción. Cómo funciona:
`docs/arquitectura-tms-oms/06-adr/ADR-005-routing-engine.md` y la presentación "Motor de ruteo
TMS OLO".

## Qué se despliega

| Pieza | Dónde | Notas |
|---|---|---|
| Migraciones | `sql/71`, `sql/72`, `sql/73`, `sql/74` | 71: país del vehículo. 72: registro de corridas. 73: coordenadas (datos del sandbox; revisar antes en otro ambiente). 74: retención. Rollback de cada una al lado. |
| Stack `planning` | `backend/planning/` | Lleva `ortools==9.14.6206` (`src/requirements.txt`). |
| Stack OSRM | `infra/osrm/template.yaml` | Una EC2 con los mapas de Costa Rica (:5000) y Venezuela (:5001) dentro de la VPC de las Lambdas. |
| Frontend | `src/` | Pide los trazos y matrices al OSRM propio por la ruta `GET /api/v1/planificacion/osrm/{proxy+}`. |

## 1. Migraciones
Aplicar en orden con el runner (dueño de las tablas), primero en seco:

```bash
node --env-file=<env del ambiente> scripts/run-migration.mjs sql/71_vehiculos_pais.sql
node --env-file=<env del ambiente> scripts/run-migration.mjs sql/71_vehiculos_pais.sql --execute
# ídem 72, 74. La 73 carga coordenadas de almacenes y tiendas de EPA: aplicarla solo si los
# códigos (MICHELENA, SAN-DIEGO, tiendas 002–008 de EPA) existen en ese ambiente.
```

`sql/71` supone que la flota propia (vehículos sin transportista) opera en Costa Rica:
revisarlo en cada ambiente. Un vehículo propio sin país no entra en ningún plan.

## 2. OSRM
El template trae por defecto la red del sandbox. Por ambiente, pasar los de ese ambiente:

```bash
aws cloudformation deploy --template-file infra/osrm/template.yaml --stack-name qa-tms-osrm \
  --capabilities CAPABILITY_IAM --parameter-overrides \
  VpcId=<vpc de las Lambdas> SubnetId=<subnet con salida a internet> \
  LambdaSecurityGroupId=<SG de las Lambdas> ImageId=<AMI Amazon Linux 2023 x86_64 de la región>
```

- La instancia necesita salida a internet solo en el primer arranque (imagen de Docker Hub y
  mapas de Geofabrik). Si la subnet no la tiene, usar una con NAT o precargar los mapas.
- El primer arranque tarda unos minutos (Costa Rica) más unos 6 (Venezuela). Registro:
  `aws ec2 get-console-output --instance-id <id> --latest`, buscar `[osrm-setup] LISTO`.
- El output `OsrmUrl` (`CR=http://<ip>:5000;VN=http://<ip>:5001`) es el parámetro `OsrmUrl`
  del stack planning.
- El horario de encendido (L-V 04:45–17:00 hora de Costa Rica) se cambia con `StartCron` y
  `StopCron`. En producción probablemente convenga dejarlo siempre encendido: quitar los
  schedules o ampliar el horario.

## 3. Stack planning
`backend/planning/samconfig.toml` ya trae los parámetros por ambiente:

- **QA**: igual que el sandbox (solver activo, T-n por carretera con tope de 3 días, costos
  reales, terceros y una vuelta por camión propio). Completar `OsrmUrl`.
- **Producción**: el comportamiento anterior (heurística, T-n en línea recta, sin costos ni
  terceros). Copiar los valores de QA cuando QA esté validado.

Empaquetado: `ortools` solo publica ruedas `manylinux_2_27/2_28` (glibc de Amazon Linux 2023,
el runtime python3.13). `sam build` con contenedor lo resuelve; sin contenedor, instalar con
`--platform manylinux_2_28_x86_64 --only-binary=:all:`. numpy y pandas los arrastra ortools pero
el motor no los importa: se pueden quitar del paquete (lo hace `scripts/sandbox/deploy_backend.py`,
`PODAR`) para bajar de ~178 MB a ~75 MB.

## 4. Verificación
1. `aws lambda invoke --function-name <stack>-planning-api --payload '{"accion":"estado_ruteo"}'`
   → `motor`, `ortools.ok: true` y `regiones.CR.fuente` / `regiones.VN.fuente` = `osrm`.
2. `{"accion":"comparar_motores","dias_atras":45}` → comparación sin errores (solo lee).
3. Después del primer replan, `SELECT motor, fuente_matriz, pedidos, viajes, km FROM tbl_routing_runs
   ORDER BY created_at DESC LIMIT 5` (motor `ortools`, matriz `osrm`).
4. En el frontend, el mapa de un viaje de Planificación dibuja el trazo por calles (red: una
   llamada a `/api/v1/planificacion/osrm/route/...` con 200).

## Volver atrás
- Motor: `MotorRuteo=heuristico` y redesplegar planning (sin cambio de datos).
- T-n: `TnModo=linea`. Costos y terceros: `CostosModo=fijo`, `UsarTerceros=no`, `PropiosUnaVuelta=no`.
- OSRM: borrar el stack; el backend cae solo a línea recta y el frontend al OSRM público.
