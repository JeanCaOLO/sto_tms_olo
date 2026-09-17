# Módulo Tarifador — Guía del módulo y roadmap

**Fecha:** 2026-09-16 (Fase 9)

**Alcance:** `src/lib/tarifas/`, `src/pages/reglas-tarifa/`, `src/pages/liquidaciones/`,
`src/pages/companias/`

**Cifras:** 42 archivos de lógica · 41 de test · **637 tests verdes** · 25 componentes de pantalla ·
19 entidades en el esquema.

**Verificación al momento de escribir:** type-check sin errores en el módulo, lint sin errores,
build pasa.

> **Nota metodológica.** Todo lo afirmado acá está verificado contra el código, no recordado. Donde
> hay una duda o una decisión pendiente, está marcada como tal.
>
> Las secciones **1 a 3** explican el módulo para quien lo abre por primera vez. La **4** dice qué
> está construido. La **5**, qué falta. La **6**, qué se supuso y qué queda por decidir.

---

# 1 · Qué es y qué problema resuelve

El tarifador responde **una** pregunta: *¿cuánto hay que pagarle al transportista por este viaje, y
por qué exactamente ese número?*

El proceso real que automatiza: al liquidador le llega en físico una lista de facturas y una **guía
de viaje** con el número de viaje, la ruta (`CAR-CCS`), el conductor y su cédula. Con eso tiene que
producir un monto, y tiene que poder defenderlo — ante el transportista que reclama, ante su jefe y
ante una auditoría.

De ahí salen las tres obsesiones del módulo:

1. **Cada número se desglosa.** El total nunca es un número suelto: es una lista de líneas, cada una
   con la regla que la produjo, la condición que la hizo aplicar y las cantidades que entraron.
2. **Cada regla es editable sin programar.** Las tarifas cambian por país, por transportista y por
   acuerdo comercial. Si cada cambio necesita un programador, el sistema muere.
3. **Nada se decide en silencio.** Cuando falta un dato, el motor avisa; cuando el número no es
   confiable, **bloquea** la emisión en vez de emitir algo plausible y falso.

**Lo que el módulo NO hace:** no cobra al cliente final (calcula el pago al transportista, no la
venta), no planifica rutas, no hace picking ni despacho, y no es dueño de los catálogos operativos
del TMS.

---

# 2 · Las piezas, una por una

Cada ficha dice **para qué sirve**, **por qué existe así** y **cómo se usa**.

## 2.1 País

**Para qué.** Es el ámbito global: todo lo demás cuelga de un país. Define la moneda, con cuántos
decimales se redondea y cómo, y a partir de cuántas horas un viaje cuenta como pernocta.

**Por qué.** El redondeo no es cosmético: Colombia liquida sin decimales y Costa Rica con dos, y
truncar o redondear cambia el importe que se paga. Que sea un dato del país —y no una constante del
código— es lo que permite operar en varios países sin bifurcar la lógica.

**Cómo se usa.** La barra superior de Reglas de Tarifa elige el país activo y **todas** las pestañas
lo respetan. Antes cada pestaña tenía su propio selector y se podían ver los costos de Venezuela
junto a la política de margen de Colombia.

## 2.2 Zona y grupo de zona

**Para qué.** La unidad geográfica con la que se tarifa. Una zona es un código corto (`CCS`, `CAR`)
con nombre; un grupo reúne varias (`CENTRO`, `OCCIDENTE`) para escribir reglas más generales.

**Por qué.** Un tarifario real no dice "de la tienda 4837 al punto 991": dice "de Caracas a
Carabobo". La zona es el nivel al que la gente piensa el precio.

**Cómo se usa.** Reglas de Tarifa → Zonas. Después, una regla puede condicionar por `Zona de
origen`, `Zona de destino` o sus grupos, y un tarifario puede usarlas como clave.

## 2.3 Compañía a liquidar

**Para qué.** A quién se le paga. Dos clasificaciones: **flota propia** y **tercero**.

**Por qué una sola entidad y no dos.** La diferencia entre propia y tercera es de *datos exigidos* y
de *pantalla*, no de modelo: el cálculo es el mismo. Modelarlas por separado habría duplicado
reglas, tarifarios y costos. Por eso hay una entidad con dos vistas y distintos campos obligatorios:
a un tercero se le exigen datos fiscales, a la flota propia no.

**Cómo se usa.** Es el **pivote** del módulo: de la compañía cuelgan sus vehículos, sus variables
personalizadas, sus tarifarios, su estructura de costos y sus reglas propias.

## 2.4 Catálogo de vehículos por compañía

**Para qué.** Declara qué camiones tiene cada compañía y cuánto carga cada uno (m³ y toneladas).

**Por qué existe.** Las variables `Volumen del camión` y `Capacidad del camión` existían en el motor
desde el principio, pero no había de dónde sacarlas: se tecleaban viaje por viaje y, como en la
práctica nadie las carga, **toda regla condicionada por capacidad valía cero sin avisar**. Una regla
*"m³ del camión × 10"* daba 0,00 en vez de 120,00.

**Cómo se usa.** Compañías → una compañía → Vehículos. El **código** de cada vehículo es el mismo
que usa su tarifa, así que después de importar un tarifario desde Excel los códigos ya están: el
modal muestra los que tienen tarifa pero no capacidad como fichas en las que se toca para
completarlos. La baja es lógica: borrar un tipo dejaría viajes sin capacidad y sin señal.

## 2.5 Variables personalizadas

**Para qué.** Cada compañía puede declarar variables propias que el sistema no conoce de antemano —
`horas de espera`, `bono de zona peligrosa`, `material averiado`— y usarlas en sus reglas.

**Por qué.** El sistema va a ser internacional y los conceptos cambian por país y por contrato. Un
vocabulario cerrado obligaría a tocar código cada vez que un transportista introduce un concepto
nuevo. El prefijo `custom:` no es decorativo: separa el vocabulario del sistema —que el compilador
verifica— del que cada compañía agrega en caliente, y hace **imposible** que una variable
personalizada pise a una del sistema.

**Cómo se usa.** Compañías → una compañía → Variables. Cada una declara:

| Campo | Qué significa |
|---|---|
| **Tipo** | *Número* (sirve para multiplicar o dividir) o *Texto* (sólo para condiciones) |
| **Origen** | *Constante* (mismo valor en todos los viajes de esa compañía) o *Por viaje* (se carga en cada liquidación) |
| **Valor** | La constante, o el valor por defecto de la variable por viaje |

Después aparecen en el constructor de reglas junto a las del sistema, marcadas como "(propia)".

> ⚠️ **Hoy las variables *por viaje* no funcionan de punta a punta**: ninguna pantalla carga su
> valor, así que siempre resuelven a su valor por defecto. Ver **B3** en §5.

## 2.6 Regla de tarifa

Es el corazón del módulo. Una regla dice: *bajo qué condición* se aplica, *cuánto* suma o resta, *en
qué momento* del cálculo entra y *cómo convive* con las demás.

### Condición — cuándo aplica

Se arma eligiendo variable, comparador y valor; varias condiciones se combinan con "y". El
vocabulario del motor admite además "o", "no", "está en la lista" y "entre A y B", pero hoy **sólo
se alcanzan escribiendo JSON** (ver **A2**).

### Expresión — cuánto

Se arma en el constructor visual: **variable → operador → valor → aumenta/disminuye**, y la
descripción se escribe sola en castellano mientras se construye.

| Operador | Qué hace | Ejemplo |
|---|---|---|
| **Monto fijo** | Un importe, sin depender de nada | Recargo de 30 por servicio express |
| **Por cada (×)** | Multiplica una variable por un importe | Por cada peaje, 20 |
| **Cada N unidades (÷)** | Cuenta bloques completos | Cada 10 bultos, 15 — con 25 bultos son 2 bloques |
| **Porcentaje (%)** | Un porcentaje sobre una base **declarada explícitamente** | 8% del subtotal acumulado |
| **Por escalones** | Tramos por cantidad, con tres lecturas posibles | ver abajo |
| **Tarifa de tabla** | El importe lo dice una fila de un tarifario | ver §2.7 |

**El importe se guarda sin signo**: el signo lo pone el efecto (*aumenta* / *disminuye*). Aceptar un
negativo además del efecto daría dos maneras de expresar lo mismo, y reglas que dicen una cosa y
hacen la contraria.

**Todo porcentaje declara su base.** Un "+8%" sin base es la causa número uno de discrepancias
irreproducibles en motores de tarifas: ¿8% de qué? Acá hay que elegir: del subtotal de una etapa,
del acumulado, o del monto de otra regla concreta.

**Los escalones tienen tres modos, y la diferencia es plata.** Con el contrato *"hasta 100 km: 2,00
· 101-300: 1,50 · +300: 1,20"* y un viaje de **250 km**:

| Modo | Cálculo | Total |
|---|---|---|
| Importe fijo del tramo | el tramo fija un importe | **1,50** |
| Tarifa del tramo | 250 × 1,50 | **375** |
| Marginal | 100×2 + 150×1,50 | **425** |

Los tres existen en contratos reales. El editor no pide el "desde" de cada tramo —es el "hasta" del
anterior— para que no queden huecos ni solapes, y exige que el último tramo quede sin límite: sin
tramo abierto, una cantidad que se pase no cobra nada.

### Etapa — en qué momento entra

El orden es fijo y cada etapa suma sobre la anterior:

**BASE** → **VARIABLE** → **MODIFICADOR** → **RECARGO** → **AJUSTE** → **IMPUESTO**

**Por qué importa.** Un porcentaje sobre el acumulado da distinto si se aplica antes o después de un
recargo. La etapa hace explícito ese orden en vez de dejarlo al azar de la base de datos.

### Convivencia

- **Suma** — se acumula con las demás de su etapa.
- **Compite** — dentro de un grupo, sólo se aplica la de mayor importe. Se resuelve con los montos
  reales, no antes de calcularlos.
- **Exclusiva** — dentro de su etapa gana una sola: la de menor prioridad.

### Prioridad y orden determinista

Cuando dos reglas empatan, el orden es total: **etapa → prioridad → alcance → código**. El último
criterio existe porque sin él dos reglas empatadas se aplicaban en el orden en que las devolvía la
base, y **el mismo viaje podía dar dos totales distintos**.

### Alcance — país o compañía

Las reglas de país son la base compartida. Una regla de compañía **con el mismo código** que una de
país la reemplaza para esa compañía; con código nuevo, se suma. Un solo mecanismo cubre heredar,
agregar, sobrescribir, desactivar y reactivar.

### Vigencia

`Rige desde` / `Rige hasta`, ambos días **incluidos**, comparados contra la **fecha del viaje**, no
contra hoy. Es lo que permite que un viaje de agosto se siga liquidando con la tarifa de agosto
aunque el acuerdo ya haya cambiado — y lo que hace que una liquidación vieja se pueda volver a
derivar en vez de sólo quedar congelada.

La forma correcta de registrar un aumento pasa a ser **vencer la vieja y abrir la nueva**, en vez de
editar la vieja en el lugar.

**Vencer no es desactivar.** Una regla vencida sigue liquidando correctamente los viajes de su
período; una inactiva no aplica a ninguno.

### Cómo se usa

Reglas de Tarifa → Reglas → Nueva. El formulario simple alcanza para casi todo; el modo avanzado
(JSON) queda para lo que el constructor todavía no expone. Una regla creada en el formulario simple
**se reabre en el formulario simple**: la forma visual se guarda junto a la regla.

## 2.7 Tarifario

**Para qué.** Una planilla de precios indexada por combinaciones: zona origen × zona destino × tipo
de camión → importe.

**Por qué.** Con una regla por combinación, **5 zonas × 4 camiones son 20 reglas** para mantener.
Acá son 20 **filas**, que es como el tarifario llega del transportista y como la gente lo piensa.

| | |
|---|---|
| **Clave** | Cada tarifario declara qué variables la forman y en qué orden. Cada fila trae un valor por cada una |
| **Comodín `*`** | Una celda vacía acepta cualquier valor: se escriben las excepciones más una fila general, en vez de la matriz completa |
| **Quién gana** | La fila **más específica** — la que resuelve más columnas con un valor exacto. El orden de carga no cambia el resultado |
| **Sólo variables categóricas** | Una clave por kilómetros casaría por igualdad exacta (181 no casa con 180) y el tarifario quedaría mudo. Para magnitudes está *Por escalones* |
| **Alcance** | Del país o de una compañía; una de compañía con el mismo código reemplaza a la del país |

**Cómo se usa.** Se crea el tarifario y se cargan sus filas a mano o **importando un CSV/XLSX**, con
mapeo automático de columnas (reconoce *Origen*, *Desde*, *Zona origen*, con acentos y sinónimos) y
elección de formato numérico: `20.000` son veinte mil en español y veinte en inglés.

Para usarlo, una regla lo elige con el operador **"Tarifa de tabla"** y declara un **importe de
respaldo**, que es lo que se cobra si el viaje no casa ninguna fila. Sin respaldo, ese viaje se
liquidaría en cero — y ese cero no se distingue de una tarifa real de cero.

**Tres trampas se cierran al guardar, no al calcular.** Ante dos filas igual de específicas el motor
avisa y elige una: útil como red, pero tardísimo — el número ya salió mal. Por eso se rechazan al
guardar las claves repetidas, se reacomodan las filas cuando cambia la clave del tarifario, y se
valida el código sin espacios ni acentos, porque es el texto con el que una regla lo nombra.

## 2.8 Estructura de costos

**Para qué.** El costo real de operar un viaje, fila por fila, como la planilla que usa
administración.

**Por qué separado de las reglas.** El costo no se le paga a nadie: se calcula con su propio modelo
y sólo sirve para derivar el margen. Meterlo en el vocabulario de las reglas habría obligado a
forzar conceptos de costo dentro de un lenguaje pensado para tarifas.

**Cómo se usa.** Compañías → una compañía → Estructura de costos. Cada fila declara un importe y
**cómo se convierte en plata del viaje**:

| Prorrateo | Qué significa |
|---|---|
| Fijo por viaje | tal cual |
| Por kilómetro | × km |
| Por día de viaje | × días (1 + noches de pernocta) |
| Mensual prorrateado | × días ÷ días operativos del mes |
| Por parada, por bulto, por hora | × la cantidad correspondiente |

Es el mecanismo natural para la **flota propia**: nómina del conductor como mensual prorrateado,
viáticos por día, combustible y depreciación por kilómetro.

Si una compañía tiene estructura cargada, manda sobre todo lo demás. Si no, se usan los parámetros
del país (§2.9) o la tarifa plana del transportista.

## 2.9 Parámetros de costo por país

Tres campos —costo por km, depreciación por km, chofer por día— como respaldo para las compañías que
todavía no cargaron su estructura. Para terceros existe además una **tarifa plana** por compañía y
tipo de camión, importable desde Excel.

## 2.10 Política de margen

**Para qué.** Decide qué pasa cuando lo liquidado queda demasiado cerca del costo, o por debajo.

**Cómo se usa.** Un umbral para avisar, otro para marcar crítico, otro para exigir un motivo escrito
y un interruptor para bloquear cuando hay pérdida. Es por país.

El resultado marca la liquidación como **OK / Atención / Crítico / Pérdida**, y la acción puede ser
*ninguna*, *exigir motivo* o *bloquear*.

## 2.11 Plantilla de viaje

Un viaje guardado con nombre, para cargarlo de un toque en el Probador. Sirve como escenario de
demostración y como caso de prueba repetible.

## 2.12 Bitácora

Registro **sólo-agregar** de quién cambió qué y por qué. La restricción no es una convención: está
declarada en el esquema, así que la capa de datos rechaza un update o un delete sobre la bitácora
aunque alguien lo intente desde otro lado.

## 2.13 La capa de datos

**Para qué.** Que el día que exista Postgres, el módulo se mude sin tocar ni la interfaz ni el motor.

**Cómo está hecho.** Hay un **registro de esquema único** del que se derivan el almacenamiento
local, el DDL de Postgres, la integridad referencial y los prefijos de id. Agregar una entidad es
agregar una entrada; no hay dos listas que mantener sincronizadas.

- Dos implementaciones de la misma interfaz: local (hoy) y HTTP contra una API.
- **Transacciones reales**: guardar 40 filas importadas entra completo o no entra.
- **Integridad referencial** derivada de las claves declaradas.
- **Migración no destructiva**: antes, cualquier forma inesperada en el almacenamiento local volvía
  a la semilla entera y borraba en silencio todo lo configurado.
- **DDL generado** (`npm run tarifas:ddl`): no puede desfasarse del modelo.

**El cambio a Postgres, completo:** correr el DDL, levantar la API y poner dos variables en el
`.env`. Nada más.

---

# 3 · Cómo se calcula un viaje

```
      viaje
        │
        ▼
 ┌─────────────────┐   km, paradas, bultos, zona origen/destino,
 │ derivar         │   noches de pernocta, día de la semana,
 │ variables       │   capacidad del camión, variables de la compañía
 └────────┬────────┘
          ▼
 ┌─────────────────┐   ¿qué reglas aplican? condición, alcance,
 │ resolver reglas │   vigencia, exclusividad, orden determinista
 └────────┬────────┘
          ▼
 ┌─────────────────┐   BASE → VARIABLE → MODIFICADOR →
 │ pipeline por    │   RECARGO → AJUSTE → IMPUESTO
 │ etapas          │   (cada línea deja su rastro)
 └────────┬────────┘
          ▼
 ┌─────────────────┐   estructura de la compañía, o parámetros
 │ costo           │   del país, o tarifa plana
 └────────┬────────┘
          ▼
 ┌─────────────────┐   liquidado − costo, contra la política
 │ margen          │
 └─────────────────┘
```

**Ejemplo.** Caracas → Carabobo, 180 km, 40 clientes, servicio express, 3 peajes:

| Etapa | Regla | Por qué aplicó | Cómo se calculó | Importe | Acumulado |
|---|---|---|---|---|---|
| BASE | Tarifa de zona | origen = CCS y destino = CAR | fila del tarifario `CCS \| CAR` | 400,00 | 400,00 |
| VARIABLE | Por cliente | clientes > 0 | 40 × 2,00 | 80,00 | 480,00 |
| MODIFICADOR | Express | servicio = EXPRESS | monto fijo | 30,00 | 510,00 |
| RECARGO | Peajes | peajes > 0 | 3 × 20,00 | 60,00 | 570,00 |

**Base 400 + variables 170 = 570,00.** Además quedan registradas las reglas que **no** aplicaron y
por qué, los avisos, y el desglose del costo — todo lo necesario para defender el número.

---

# 4 · Estado actual

## 4.1 Construido y funcionando

| Pieza | Estado |
|---|---|
| Capa de datos con driver intercambiable y DDL generado | ✅ |
| Compañías: flota propia / terceros, una entidad, dos pantallas | ✅ |
| Reglas con alcance país → compañía | ✅ |
| Constructor visual de reglas con descripción automática | ✅ |
| Modos de escalón (fijo / tarifa / marginal) | ✅ |
| Tarifarios N-dimensionales con importación CSV/XLSX | ✅ |
| Operador visual "Tarifa de tabla" | ✅ |
| Catálogo de vehículos por compañía | ✅ |
| Vigencia por regla, medida contra la fecha del viaje | ✅ |
| Buscador conductor ↔ compañía por cédula o nombre | ✅ |
| País como ámbito global | ✅ |
| Estructura de costos por filas (siete prorrateos) | ✅ construida, con datos (flota propia VE, §4.12) |
| Política de margen con bloqueo | ✅ |
| Bitácora sólo-agregar | ✅ |

## 4.2 Endurecimiento tras simulaciones adversariales

Se escribieron 15 situaciones realistas como tests. **10 fallaban.** Las más graves:

| Falla | Antes | Ahora |
|---|---|---|
| Dos reglas con igual prioridad | El mismo viaje daba **dos totales distintos** según el orden de la base | Orden total determinista |
| Porcentaje sobre una regla posterior | Cobraba 0, sólo un aviso | **Bloquea** la emisión |
| Ciclo entre reglas | Resolvía 0: total plausible y falso | Detecta el ciclo y **bloquea** |
| Grupo que compite, con porcentaje | Se comparaba con subtotales en cero: el porcentaje **perdía siempre** | Se resuelve con montos reales |
| Total negativo | Se emitía | **Bloquea** (configurable por país) |
| Regla con variable inexistente | Tumbaba la liquidación entera | Vale 0 y avisa |
| Compañía de baja o sin perfil | Indistinguible de flota propia | Problema explícito |

De ahí sale la separación entre **avisos** (informativos) y **problemas bloqueantes**, que impiden
guardar la liquidación.

## 4.3 Dos unificaciones que corrigieron cálculos mal

**Zonas.** En la llamada al motor había, literal, `zone_id: null`. Toda liquidación resolvía la zona
comodín, así que **una regla por zona funcionaba en el Probador y nunca en producción**, sin ninguna
señal.

**Tarifas zona-a-zona absorbidas por los tarifarios.** Eran una tabla con la clave fija en dos
columnas: un caso particular del tarifario. Mantener las dos era tener dos pantallas para cargar lo
mismo y dos lugares donde buscar por qué un viaje cobró lo que cobró.

## 4.4 Una sola moneda por país

Cada país tenía **dos** monedas —la de liquidación y una de consolidación en dólares— y cada
importe declaraba en cuál de las dos estaba escrito. Se eliminó la segunda.

Qué costaba tenerla:

- **Un bug de plata silencioso.** El modal de regla ad-hoc fijaba "moneda de referencia" sin
  ninguna etiqueta en pantalla: en Venezuela, quien tecleaba `50` cargaba **2.000 VES**.
- **Símbolos falsos.** El formateador tenía el `$` incrustado, y peor: la función que arma
  *"40 × 2,00"* anteponía `$` a **cualquier** importe, así que un tarifario en colones se mostraba
  con signo de dólar.
- **Un campo que el motor ignoraba.** Los tarifarios declaraban moneda y el motor nunca la leía: la
  conversión la decidía sólo la regla.

**Venezuela pasa a operar en dólares.** Los importes de la semilla se reexpresaron: los de Colombia
×4.000 y los de Costa Rica ×520, **de los dos lados** —lo que se cobra y lo que cuesta—, porque 27
de las 30 reglas y los 12 tramos de zona también estaban escritos en dólares. Convertir un solo
lado habría dado un margen absurdo sin ningún error a la vista.

Que ningún número se movió está verificado, no supuesto:

| País | Total antes | Total después | Margen |
|---|---|---|---|
| Venezuela | 20.400,00 VES (consolidado 510,00) | **510,00 USD** | 0,4796 → **0,4796** |
| Colombia | 1.710.000 COP | **1.710.000 COP** | −0,1333 → **−0,1333** |
| Costa Rica | 232.440,00 CRC | **232.440,00 CRC** | 0,2953 → **0,2953** |

Para quien ya tenía datos en el navegador hay una migración de una sola pasada: la semilla sólo se
usa cuando no hay nada guardado, y sin convertir esos importes se releerían 4.000 veces más chicos.
Su test de idempotencia **encontró un defecto real** —la conversión se aplicaba dos veces porque las
tasas viejas sobrevivían a la copia— antes de que llegara a ningún dato.

## 4.5 Ruta, conductor y liquidación propios del módulo

El tarifador leía rutas, conductores y transportistas de la base del TMS, y guardaba la liquidación
en una tabla de allá **que no tiene columnas para el desglose**. Dos consecuencias:

- Sin rutas cargadas en el TMS no había nada que liquidar acá, así que el módulo no se podía probar.
- La traza, los descartes, los subtotales y los avisos **se perdían al guardar**: una liquidación
  emitida quedaba reducida a un total, imposible de volver a explicar.

Ahora las tres entidades son del módulo.

**La ruta** es la lane comercial de un transportista —`CAR-CCS`, "Carabobo → Caracas"— con sus dos
zonas y los siete números del viaje: kilómetros, paradas, bultos, peso, cantidad y monto de peajes,
duración. Elegirla los aporta todos. **No lleva importe**: la tarifa sale del tarifario de su
compañía, con clave (zona origen, zona destino) — dos lugares donde buscar el precio de una ruta es
exactamente el problema que costó desarmar en §4.3.

Un viaje excepcional puede corregir cualquiera de esos números sin tocar la ruta, y el módulo sabe
**cuáles se corrigieron**, para poder mostrarlo. Un cero explícito también manda: *"este viaje no
tuvo peajes"* es un dato, y dejar que la ruta lo pise cobraría peajes que no hubo.

**El conductor** existe porque la guía física trae nombre y cédula y casi nunca la compañía. El
buscador que resuelve eso estaba escrito y probado desde hacía tiempo, pero la lista se leía del
TMS: se le da de comer sin tocarlo, con un adaptador que arma exactamente la forma que ya consumía.

**La liquidación** guarda ahora el desglose entero —traza, descartes, subtotales, avisos, el viaje
con sus variables personalizadas, los montos corregidos a mano con su motivo, las reglas ad-hoc y
las líneas que se destildaron—, desnormalizado y sin referencia a las reglas **a propósito**: una
liquidación emitida tiene que poder releerse tal cual se emitió aunque después la regla se edite o
se borre. No se borra: se **anula**, porque borrarla dejaría un hueco en la numeración y borraría la
prueba de lo que se pagó.

Tres cosas que dejaron de ser imposibles de probar:

- **El motor puede frenar una emisión.** Antes eran tres `alert()` dentro de un modal de 1.400
  líneas. Ahora un ciclo entre reglas devuelve *bloqueado* —y no *inválido*, porque quien liquida no
  puede arreglarlo corrigiendo un campo— y tiene precedencia sobre la validación del formulario.
- **La numeración.** Vivía dentro del modal y ya produjo un `LIQ-0NaN`; ahora es una función pura
  que ignora en silencio lo que no tenga la forma esperada.
- **El margen en pérdida** no se aprueba ni al emitir ni al cambiar el estado desde la lista.

Y lo que da sentido a toda la fase: **una regla por zona ahora aplica sin que nadie teclee la
zona**. Era el defecto de §4.3 en su forma más cara — la regla funcionaba en el Probador y nunca en
producción.

De paso se recupera una protección: el tarifario guarda el **código** de la zona y por eso no impide
borrarla; la ruta guarda el **id**, con clave foránea, así que una zona en uso vuelve a estar
protegida por el esquema y no por un chequeo a mano.

## 4.6 El armado, partido en dos

`repository.ts` armaba de una sola vez todo lo que el motor necesita, y su contrato exigía una ruta,
tiendas y tipos de ruta del TMS. Un viaje inventado no tiene nada de eso, **así que el Probador del
motor se escribió aparte** — y desde entonces las dos pantallas divergían.

No era hipotético. Ya había pasado con las zonas (la regla funcionaba en la prueba y nunca en
producción) y casi se repite con los tarifarios. Peor: el Probador **no pasaba las variables
personalizadas ni la estructura de costos**, o sea que mentía justo sobre las dos capacidades que
había que demostrar — una regla con una variable propia evaluaba cero, y el costo se calculaba
siempre con los tres campos del país en vez de con la planilla de la compañía.

Ahora hay dos piezas:

- **Cargar** (impuro): trae todo lo del país y de la compañía, y **falla con un mensaje que dice
  dónde configurarlo** en vez de devolver un catálogo a medias — un catálogo incompleto produce un
  total plausible calculado sobre huecos.
- **Combinar** (puro): recibe el catálogo y un viaje, y produce la entrada del motor. No toca el
  almacén, no lee la hora, no consulta nada.

Las dos pantallas llaman a las mismas dos piezas. Lo único que legítimamente difiere —de dónde sale
el viaje— sigue siendo propio de cada una.

**El cambio de fondo: la compañía llega como argumento**, no se deriva de la ruta. Sonaba a detalle
y era el defecto que hacía que cambiar de transportista en el formulario no recalculara nada: el
selector decidía a quién se le paga, pero el cálculo seguía usando el transportista de la ruta, con
sus reglas, su tarifario y sus variables.

`repository.ts` bajó de 540 a 277 líneas y quedó como adaptador del camino heredado: sólo conserva
lo que hace falta para cruzar la frontera con el TMS. Un **test de equivalencia** comprueba que el
mismo viaje por los dos caminos da el mismo total, el mismo costo, el mismo margen y la misma traza
línea por línea.

Cierra **I6**.

## 4.7 Zonas y precios, por compañía

Cuatro cosas, una sola idea: **el precio de una ruta es de la compañía que la hace**.

**Fuera "Orígenes y destinos".** Era una pantalla para decir a qué zona pertenece cada tienda y cada
tipo de ruta del TMS. Con rutas propias que declaran sus dos zonas, ese puente no tiene sentido.
Desaparecen la pantalla, la entidad de mapeo y la zona comodín que la acompañaba.

**Fuera la tabla zona-a-zona.** Ya la habían absorbido los tarifarios: era la misma cosa con la
clave fija en dos columnas. Se eliminaron la entidad, su CRUD y el operador `LOOKUP_ZONE` del motor.
El tarifario `ZONAS` queda **horneado en la semilla** con los doce tramos convertidos, y la
migración sigue leyendo la clave heredada para convertir lo que alguien tenga guardado — el mismo
patrón que se usó con la moneda.

**Los tarifarios se abren desde la ficha del transportista.** La pantalla es la misma que la global,
acotada a esa compañía: una segunda versión divergiría al primer cambio. Muestra los suyos **más los
del país**, que también la alcanzan.

**Las rutas, también.** Cada compañía carga sus lanes con código (`CAR-CCS`), sus dos zonas y los
siete números del viaje. Al elegir una ruta en una liquidación, esos siete se completan solos.

El esquema baja de 22 entidades a 20, y el motor pierde un operador: el tarifario hace lo mismo con
N columnas en vez de dos.

## 4.8 La lógica del formulario, fuera del formulario

El modal de liquidación tiene 1.459 líneas mezclando carga de datos, derivación, cálculo y
presentación. Nada de eso se podía probar sin montar React, así que los defectos que vivían ahí
adentro sólo aparecían usándolo.

Cinco módulos puros, con 81 tests:

**La máquina de dependencias.** Las tres puertas de entrada llevan al mismo lugar: elegir la ruta
arrastra su compañía, elegir el conductor también, y elegir el transportista filtra las tres cosas y
**descarta lo que ya no pertenece, diciendo qué descartó**. Es el defecto más caro del formulario:
cambiar de transportista no recalculaba, porque el selector decidía a quién se le paga mientras el
cálculo seguía usando el transportista de la ruta.

Además detecta el **conflicto de compañía** —conductor de una, ruta de otra— y lo bloquea: el viaje
se tarifaría contra una de las dos, y cuál depende del orden en que se tocaron los campos.

**Los campos de las variables por viaje.** Cierra el agujero más silencioso del módulo. Un número
ilegible da **error, no cero**: un cero silencioso es indistinguible de "cargué cero", y la
diferencia son las horas de espera que nadie va a cobrar. Las constantes de la compañía se muestran
aparte, de sólo lectura, para que se vea por qué una suma y la otra no.

**El total con líneas destildadas.** Estaba calculado en **dos lugares** del mismo modal —uno para
el total, otro para los subtotales por etapa— con coma flotante y `toFixed`, cuando todo el resto
del módulo usa decimales exactos justamente para no perder centavos ahí. Ahora sale de un solo
recorrido, y avisa cuando el total dejó de coincidir con el del motor: eso es una decisión de una
persona, no del cálculo.

**La explicación del total.** Junta lo que el motor produce y la interfaz tiraba: por qué aplicó
cada regla (en castellano), cómo se calculó (`180 × 2,50`), el acumulado línea por línea, qué fila
del tarifario ganó, los descartes **agrupados por motivo** y —lo más útil para una auditoría— **qué
números del viaje miró el motor**, que convierte "cargué el peso y no cambió nada" en una pregunta
con respuesta. También abre el desglose del costo, que hoy sólo muestra su total.

**Las devoluciones.** Informativas: no cambian lo que se le paga. Se serializan a la nota de la
liquidación reemplazando el bloque anterior, en vez de acumular dos contradictorios.

## 4.9 El alta de liquidación, reconstruida

Se teclea lo que trae la guía física —**nro de viaje, ruta, conductor**— y el resto se deriva.

| Elegir… | Completa |
|---|---|
| **la ruta** | transportista, las dos zonas, km, paradas, bultos, peso, peajes, duración |
| **el conductor** (por cédula o nombre) | su transportista |
| **el transportista** | filtra rutas, conductores y vehículos, y **recalcula** |

El tipo de vehículo pasa a ser un desplegable del catálogo de la compañía, no texto libre: de ahí
salen el volumen y la capacidad. Las zonas se **muestran**, no se eligen.

**Campos que antes no existían:** recolectas, cantidad de peajes, minutos de atraso e incidentes.
Las recolectas eran imposibles de cobrar aunque el motor las soportara.

**Las variables por viaje ya tienen dónde cargarse**, generadas desde las que declaró la compañía.
Las constantes se muestran al lado, de sólo lectura, para que se vea por qué una suma y la otra no.

**Un viaje excepcional puede corregir lo que dice la ruta** —más kilómetros, menos paradas— sin
tocar la ruta, que sigue sirviendo a los demás viajes. Corregir **exige un motivo** y el formulario
marca qué campos se tocaron: es la diferencia entre heredar un dato y decidirlo.

**Al guardar** se persiste la proforma entera —traza, descartes, subtotales, avisos, el viaje con
sus variables, las líneas destildadas y las devoluciones— y **queda registro en la bitácora**, que
era la única pantalla del módulo que no dejaba ninguno. El detalle de una liquidación emitida se
relee del snapshot, **sin recalcular**: tiene que poder explicarse tal como se emitió aunque la
regla haya cambiado después.

### Lo que se pudo borrar

El modal viejo tenía **1.454 líneas**. El nuevo tiene menos de la mitad, porque la lógica vive en
los módulos puros de §4.8. Y con él se fueron, por quedar sin un solo consumidor:

- `repository.ts` — el puente con el TMS
- la resolución de compañía desde un transportista del TMS
- la resolución de zona por tienda y tipo de ruta
- el snapshot de margen, que existía **sólo** porque el módulo no podía escribir el desglose en la
  tabla del TMS

El esquema baja a 19 entidades. El módulo dejó de leer y de escribir en la base del TMS.

---

## 4.10 El Probador, y escenarios que se verifican solos

El Probador tenía un defecto que lo volvía peor que inútil: **mentía**. No le pasaba al motor las
variables personalizadas de la compañía ni su estructura de costos, así que una regla por variable
daba cero ahí y su valor real en la liquidación. Quien probaba una regla nueva veía un número y
quien liquidaba veía otro.

Ahora las dos pantallas pasan por el **mismo** armado (`catalogLoader` + `buildCalculateInput`). Si
el Probador mostrara otra cosa que la liquidación, sería un defecto del motor y no de una copia
divergida — que es justamente lo que ya había pasado dos veces.

**Dos modos, porque son dos trabajos distintos:**

| Modo | Para qué |
|---|---|
| **Desde una ruta** | La misma cascada del alta de liquidación: compañía ⇄ ruta ⇄ conductor ⇄ vehículo. Se prueba lo que la gente va a liquidar de verdad |
| **Viaje libre** | Inventar combinaciones que ninguna ruta produce, para ver qué reglas se despiertan y cuáles no |

Además ahora manda el **conductor** —antes mandaba `driverId: null` fijo, con lo cual ninguna regla
por conductor podía probarse— y el vehículo elegido aporta su **volumen y capacidad**, un hueco que
quedó abierto en la fase anterior: se elegía el vehículo y las reglas por volumen seguían valiendo
cero en silencio.

La tabla de tres columnas —etapa, regla, monto— se reemplazó por el **mismo panel plegable** de la
liquidación.

### Escenarios que se verifican solos

Una plantilla de viaje demostraba que el motor **corre**, no que sigue calculando **lo mismo que
ayer**. Cambiar el orden de una etapa o la condición de una regla movía los totales de la
demostración y nadie se enteraba hasta abrirla delante de alguien.

Cada plantilla declara ahora su **total esperado**, y un test recorre las de la semilla: si un total
se movió, el build se pone rojo con el nombre del escenario y la diferencia. Un total que se movió a
propósito se acepta explícitamente —hay un botón para fijar el nuevo—, y eso es deliberado: la única
forma de distinguir una mejora de una regresión es que alguien mire el número y lo acepte.

El número vive dentro del `jsonb` del viaje, así que **no hizo falta tocar el esquema**; pero se
separa del viaje apenas se lee la fila, porque una expectativa no es un dato de entrada y mezclar
las dos cosas es cómo se terminan calculando totales a partir de totales.

**El total solo no alcanza:** un escenario podría seguir dando 474,00 con las recolectas apagadas y
otra cosa compensando. Por eso las comprobaciones fijan también **qué reglas lo componen** — que las
2 recolectas sumen 50,00, que las 3 horas de espera sumen 24,00, que la base salga del tarifario de
zonas y no del respaldo por kilómetro.

Al hacerlo apareció un agujero en los datos: la lane **CAR-CCS existía como ruta y no tenía precio**
en el tarifario, así que caía al respaldo por kilómetro. Se le puso precio.

---

## 4.11 La falla que no se podía atribuir

Encontrada en uso real, no por un test. Al abrir el alta de liquidación:

```
Uncaught Error: [DecimalError] Invalid argument: undefined
```

y la pantalla entera desaparecía.

**La causa:** los tres `switch` del evaluador —condiciones, expresiones y bases de porcentaje— no
tenían rama por defecto. Una regla con un operador que el kernel no conoce, o con la expresión
vacía, devolvía `undefined`; ese `undefined` viajaba por el pipeline y recién explotaba tres marcos
más adelante, dentro de la librería de decimales. El mensaje no decía **qué** regla ni **por qué**.

Es la peor forma de falla posible en este módulo: la que **no se puede atribuir**. En el caso de las
condiciones era aún más callada — una condición ilegible se leía como "no aplica" y la regla
desaparecía del cálculo sin dejar rastro.

**Lo que se hizo:**

| | |
|---|---|
| El evaluador **falla nombrando el operador** en vez de devolver `undefined` | Un `undefined` que viaja es un fallo que se descubre lejos de su causa |
| El pipeline lo **atrapa y descarta la regla con su código**, con motivo *"Regla ilegible"* | Para poder arreglarla hay que saber cuál es |
| Y **frena la emisión** con un bloqueo | Un total al que le falta una línea es plata mal pagada, no un detalle de presentación |
| El resto del cálculo **sigue en pie** | Hay que poder ver qué sí se calculó para entender qué falta |
| Una fila de costo con condición ilegible **avisa** en vez de desaparecer | Callarla cambiaría el costo —y con él el margen— sin que nadie pudiera ver por qué |
| El alta de liquidación **atrapa cualquier excepción del motor** | Que el motor falle es un problema; que se lleve puesta la pantalla es otro |

---

## 4.12 La semilla, exhaustiva (Fase 8 · C8)

Hasta acá la demostración era casi toda de Venezuela: Colombia y Costa Rica tenían país, moneda y
zonas, pero ni una regla de compañía, ni rutas, ni conductores propios, y la estructura de costos
por filas (§2.8) estaba "construida, sin datos" — el módulo la sabía calcular pero nadie la había
cargado nunca. Ocho escenarios nuevos en `seed.json`, verificados por el mismo mecanismo que
§4.10 (`expectedTotal` + anti-regresión), cierran eso:

| Qué se agregó | Dónde |
|---|---|
| **Flota propia con estructura de costos real**: 10 filas cubriendo los 7 prorrateos del §2.8 (nómina y prestaciones mensual-prorrateadas, viáticos por día, combustible y depreciación por km, gastos por viaje, mantenimiento por parada, empaque por bulto, coordinación por hora), más una fila condicionada por tipo de camión (`appliesWhen`) | `SP_VE_OWN` — `CSTR_VE_OWN` |
| **Escalones en sus tres modos**: `FLAT` ya existía (penalización por atraso); se agregan `RATE` (tarifa por peso) y `PROGRESSIVE` (recargo marginal por parada) | `CARRIER_CO_1` |
| **Variable personalizada por viaje, numérica, con descuento**: "unidades con material averiado" — 15.000 COP menos por unidad. Confirmado como patrón correcto: la política de materiales averiados la define una regla, y varía por compañía — no es un caso especial del motor | `CARRIER_CO_1` — `custom:material_averiado` |
| **Variable personalizada de texto**, en una condición (`EQ`) que dispara un recargo fijo | `CARRIER_CO_1` — `custom:zona_riesgo` |
| **Vigencia vencida, con contraste**: una regla vigente sólo en nov-dic 2025 sigue liquidando el viaje de esa fecha y ya no el de 2026 — dos plantillas hermanas prueban las dos fechas y su diferencia exacta (8.000 CRC) | `CARRIER_CR_2` — `R_PROMO_LANZAMIENTO` |
| **Lane sin fila en el tarifario**: Medellín → Bogotá no tiene fila propia ni regla de zona específica — cae al respaldo por km, no a cero | `RT_CO_A1` |
| **Tarifario con comodín `*`**: una zona nueva (Táchira) sin fila propia hacia Caracas resuelve por `["*", "CCS"]` en vez del respaldo por km | `Z_VE_TAC` — `RTR_ZLR_VE_7` |
| **Compañía sin catálogo de vehículos**: ya era el estado real de las tres compañías de flota propia fuera de Venezuela; queda cubierto con un test que confirma que no rompe el cálculo | `SP_CO_OWN` |
| **Multi-país**: Colombia y Costa Rica pasan de "sólo país y zonas" a tener rutas, conductores, catálogo de vehículos y reglas de compañía propias | `CARRIER_CO_1`, `CARRIER_CR_2` |

**Un hueco encontrado y cerrado en la misma sesión.** El aviso "el vehículo no está en el catálogo"
(§2.4) sólo se disparaba cuando el catálogo de la compañía tenía ALGO y el código no estaba entre
sus filas — un catálogo enteramente **vacío** no avisaba nada, y una regla por volumen o tonelaje
valía cero en silencio en ese caso particular. Mismo bug que motivó §2.4, sobreviviendo en un borde
que esa corrección no cubría. Corregido en `settlementInput.ts` (`buildCalculateInput`): catálogo
vacío y catálogo con código no encontrado ahora avisan, cada uno con su mensaje. Test actualizado en
`escenariosVerificados.test.ts` ("una compañía sin catálogo de vehículos no rompe el cálculo y
avisa"). 621 tests verdes, tsc y eslint limpios.

## 4.13 Motor más flexible (Fase 9 · A1-A3)

Del §5.1, A1-A3 quedaron cerrados; A4 se dejó como estaba, con su propio workaround. Nada de esto
tocó el evaluador ni el resolvedor: los cuatro operadores que hicieron falta (OR, NOT, IN, BETWEEN,
CLAMP) ya existían en el motor desde antes — era, otra vez, un límite del formulario, no del kernel.

| Qué se corrigió | Cómo |
|---|---|
| **A1 — la condición ya se reabre en el formulario visual**: antes, editar cualquier regla forzaba el modo JSON para la condición aunque se hubiera armado en "Si se cumple…", el mismo defecto que ya se había corregido del lado del cálculo | Nueva `ConditionBuilderForm` (`types.ts`), guardada junto a la regla (`condition_builder`) igual que `builder` — mismo patrón, no una reconstrucción a partir del `Pred` guardado, que sería ambigua |
| **A2 — el constructor expone O, NO, "está en la lista" y "está entre"** | `ConditionRowForm` por fila: negación (NOT), operador (las seis comparaciones + IN + BETWEEN), y un combinador AND/OR para el conjunto. Compila con `compileConditions` (`rule-builder.ts`) |
| **A3 — tope y piso como operador visual**: "el recargo no puede pasar de X" ya no exige JSON | Dos campos (`clamp.min`/`clamp.max`) en `RuleBuilderForm`, aplicables a CUALQUIER operador — envuelven la expresión compilada en un `CLAMP` |
| **A4 — no se tocó**: se evaluó extender `PER_UNIT.rate` para aceptar una variable, y se decidió no hacerlo — el workaround que ya menciona la fila de A4 (regla por compañía o tarifario) alcanza, y tocar el kernel por un caso sin pedido real no se justificaba | — |

Reglas de antes de esta fase, armadas en JSON o sin `condition_builder` guardado, se siguen abriendo
en modo avanzado — ninguna se reescribe sola. Sólo lo nuevo, y lo que se vuelva a guardar desde acá,
queda en el formulario visual.

---

# 5 · Lo que falta

Ordenado según las prioridades acordadas.

## 5.1 Prioridad A — Motor más flexible, intuitivo y preciso

**A1-A3 — cerrados** (Fase 9, ver §4.13). **A4 — evaluado y descartado**, ver misma sección: el
workaround que la fila ya proponía alcanza.

| # | Qué | Por qué importa |
|---|---|---|
| ~~**A1**~~ | ~~Las condiciones siempre se reabren en JSON. Al editar cualquier regla, el formulario fuerza el modo avanzado para la condición~~ | Es el mismo defecto que ya se corrigió para la expresión —que sí se reabre en el formulario simple—, todavía vivo en la otra mitad. Hace inservible el constructor guiado a la segunda edición |
| ~~**A2**~~ | ~~Faltan "o", "no", "está en la lista" y "entre A y B" en el constructor de condiciones~~ | El motor los ejecuta desde siempre; hoy sólo se alcanzan escribiendo JSON |
| ~~**A3**~~ | ~~Faltan tope y piso, mínimo, máximo y condicional como operadores visuales~~ (condicional quedó afuera a propósito, ver §4.13) | *"El recargo no puede pasar de X"* es un pedido corriente de cualquier contrato, y hoy exige JSON |
| **A4** | **La tarifa de un "por cada" no puede ser una variable** — se decidió NO tocar el kernel para esto | Hoy `20 × custom:tarifa_recolecta` no se puede escribir: la tarifa debe ser constante en la regla. Se resuelve con una regla por compañía o con un tarifario |

## 5.2 Prioridad B — Unificar el liquidador con el motor

**Cerrada.** Era el problema central —no se podía probar nada porque los datos que el motor necesita
no existían dentro del módulo— y está resuelto en §4.5 a §4.10: las rutas, los conductores y las
liquidaciones son del módulo, el alta deriva lo que antes se tecleaba, y el Probador y la liquidación
pasan por el mismo armado.

## 5.3 Prioridad C — Demostrar el cálculo

El desglose ya se muestra en las dos pantallas (§4.9, §4.10) y los escenarios se verifican solos.

**C8 — cerrada** (Fase 8, ver §4.12). Era de datos, no de código: no se tocó `evaluator.ts`,
`resolver.ts` ni `cost.ts`, que ya soportaban todo esto sin excepción.

## 5.4 Deuda técnica y riesgos

| # | Qué |
|---|---|
| **D1** | **Control de acceso decorativo.** Cualquiera lo saltea desde las herramientas del navegador. Bloqueado por el backend |
| **D2** | **Sin control de concurrencia.** Dos pestañas abiertas se pisan; la última gana sin avisar |
| **D4** | **Multi-tenancy no aplicada.** El identificador de organización se pasa por todas las funciones y se ignora |
| **D5** | **Suma de líneas ≠ total, por un centavo.** El acumulador es exacto y la presentación redondea. Documentado y con test |
| **D6** | **Diez `alert()` y `confirm()`.** Existe un sistema de notificaciones en el proyecto y sólo Planificación lo usa |

---

# 6 · Supuestos y decisiones

## 6.1 Supuestos documentados

- **Flota propia.** El módulo calcula *cuánto se liquida* y *cuánto cuesta*. Para un tercero eso es
  el pago y su costo. Para la flota propia se asume que "liquidado" es el valor del viaje —lo que
  costaría tercerizarlo— y "costo" es la estructura real (nómina, viáticos, combustible), de modo
  que el margen responde si conviene hacerlo en casa. **Es un supuesto, no una regla de negocio
  confirmada.**
- **Devoluciones.** Informativas: se anotan en la descripción de la liquidación (número de factura y
  código de producto) y **no afectan el pago**, porque el viaje se le paga igual al transportista.
  Pueden ser parciales (un producto de la factura) o totales (todos).
- **Recolectas.** Sí se pagan: son un servicio que el transportista hace al pasar por un punto de su
  zona a buscar una devolución posterior a la entrega. Se modelan con una regla por transportista
  sobre la cantidad de recolectas del viaje.
- **Venezuela opera en dólares.**

## 6.2 Decisiones tomadas

| Decisión | Elegido |
|---|---|
| Moneda | Eliminar la de referencia del motor; una sola por país — ✅ **hecho**, ver §4.4 |
| Tarifa de la ruta | Es la **base del pago**, y sale del tarifario de la compañía |
| Persistencia | Todo local al módulo — ✅ **entidades hechas**, ver §4.5; falta conectar las pantallas |
| Origen de una ruta | También una zona, del mismo catálogo que el destino |
| Tabla de tarifas N-dimensional | Se terminó |
| Estructura de costos | Se retoma: es el mecanismo de la flota propia |

## 6.3 Todavía abiertas

- ¿El número de viaje de la guía física reemplaza al número interno de liquidación, o conviven?
- ¿La estructura de costos es sólo para flota propia, o también para terceros que la quieran cargar?
- ¿Siguen existiendo las reglas sin país? Contradicen el modelo de "el país es el diferenciador".

---

# 7 · Cómo probar el módulo

**Reglas de Tarifa** es el centro de configuración; **Liquidaciones**, el de operación; **Compañías**,
el de datos por transportista.

1. **Elegir el país** en la barra superior. Todo lo que sigue queda acotado a él.
2. **Zonas** → cargar las zonas y sus grupos.
3. **Compañías** → crear un transportista y, dentro de su ficha: sus **vehículos**, sus **variables
   personalizadas** y su **estructura de costos**.
4. **Tarifarios** → crear uno con clave (zona origen, zona destino) y cargar sus filas, a mano o
   importando una planilla.
5. **Reglas** → una regla base con el operador *Tarifa de tabla* apuntando a ese tarifario, más un
   par de reglas variables (por cliente, por peaje).
6. **Probador del motor** → armar un viaje y verificar el desglose: cada línea debe decir por qué
   aplicó y cuánto sumó.
7. **Liquidaciones → Nueva** → registrar el viaje real y comprobar que el total coincide con el del
   Probador. **Si difieren, hay una divergencia que reportar** — es el defecto que más veces apareció
   en este módulo.

**Verificación del código:**

```bash
npx tsc -b --noEmit
npx vitest run src/lib/tarifas     # 637 tests
npx eslint src/lib/tarifas src/pages/reglas-tarifa src/pages/liquidaciones
npx vite build
npm run tarifas:ddl                # tras tocar el esquema
```

> `src/pages/planificacion/eflow-api.test.ts` falla de forma intermitente en la suite completa. Es
> un defecto preexistente de otro módulo (pasa 17/17 corrido aislado), ajeno al tarifador.

## Cómo mantener esto

`src/lib/tarifas/__tests__/simulaciones.test.ts` es el mecanismo que encontró 10 de las fallas del
§4.2. **Cada situación nueva que se sospeche se escribe ahí primero, se ve fallar, y recién después
se arregla.** Es lo que evita que una corrección tape un síntoma en vez de la causa.
