# Notas de Jean Carlo — Catálogos, tarifario y planificación dinámica

> Fuente: mensajes de chat de Jean Carlo (líder técnico, ver
> `CONTEXTO_PROYECTO_TMS.md` §5.1), 16-sep-2026, 4:27 p.m. Costa Rica.
> Transcrito y estructurado sin cambiar el contenido técnico; solo se
> organiza en secciones y se referencia contra lo ya documentado en el
> espacio. Puntos marcados **[verificar]** son interpretación de notas
> sueltas, no palabras textuales confirmadas — revisar con Jean Carlo.

---

## 1. Catálogos — ajustes pedidos

### 1.1 Clientes y puntos de entrega

- **Unificar** "Clientes" y "Puntos de Entrega" en un solo concepto/catálogo
  **[verificar exactamente qué significa "unificar" aquí]** — hoy en
  `CONTEXTO_PROYECTO_TMS.md` §2.1 son dos nociones relacionadas (cliente =
  destino, centro de distribución = origen); a confirmar si esto cambia esa
  relación o solo la forma de capturarlos en un mismo formulario/pantalla.
- **Crear los clientes reales de Mayoreo como clientes propiamente dichos**:
  Cofersa, EPA, y otros ("etc.") — hoy estos nombres aparecen en el proyecto
  como *fuentes de datos/sistemas* con sus propias reglas de prioridad (ver
  `OMS_ESPECIFICACION_DETALLADA.md` §4, "EPA: prioridad especial si hay
  quiebre de stock"; "Cofersa: reglas más dinámicas"), no como filas del
  catálogo de Clientes. Esta nota pide que también existan como clientes de
  verdad en Catálogos → Clientes.

### 1.2 Transportistas

Campos/funcionalidad nuevos pedidos para el catálogo de Transportistas
(`carriers` en el esquema actual, ver `server/tms-relations.mjs`):

- **Cuenta para pagar** — cuenta bancaria/contable del transportista, para el
  ciclo de pago que ya describe `CONTEXTO_PROYECTO_TMS.md` §2.3 ("lo que OLO
  le paga al transportista").
- **Código de Softland** del transportista — Softland es un ERP; esto es la
  llave de integración contable/financiera del transportista con ese sistema
  externo. **[verificar]** si ya existe una integración Softland documentada
  en otro lado del proyecto — no aparece todavía en `CONTEXTO_PROYECTO_TMS.md`
  ni en los documentos de OMS/Liquidación revisados en este espacio.
- **Contrato y fecha de vencimiento del contrato** — esto ya tiene un hogar
  natural: el módulo "Contratos y documentos legales" (`CONTEXTO_PROYECTO_TMS.md`
  §2, sin dueño asignado todavía) y la tabla `contracts`/`contract_documents`
  que ya existen en el esquema migrado a AWS (`organization_id`, fechas,
  `contract_type`, etc.) — habría que decidir si el contrato vive colgado del
  transportista directamente (FK `carrier_id` en `contracts`, hoy no existe) o
  si se maneja por separado y solo se referencia. **Abierto.**

### 1.3 Conductores

- **Campo "licencia" (número de licencia de conducir)** en el catálogo de
  Conductores (`drivers`).
- **Catálogo nuevo de tipos/categorías de licencia** (ej. liviana, pesada,
  articulada — **[verificar]** categorías exactas de Costa Rica/Venezuela) —
  del cual el conductor toma un valor. Relevante para Planificación/OMS:
  el tipo de vehículo asignado a una ruta debería ser compatible con el tipo
  de licencia del conductor (regla de negocio implícita, no confirmada
  todavía como validación del sistema).

---

## 2. Tarifario — tipos y motor de cálculo

### 2.1 Tipos de tarifa (catálogo nuevo)

Cinco tipos de tarifa a soportar: **por kilómetro, por unidad, fija, por
volumen, y "tendering"** (licitación/subasta de tarifa entre transportistas
— **[verificar]** término y mecánica exacta, no descrita más allá del
nombre). Esto **refina** (no contradice) lo ya documentado en
`CONTEXTO_PROYECTO_TMS.md` §2.3 sobre el pedido de Ignacio/Mayoreo de un
"motor de reglas mucho más flexible: por kilómetro, volumen, bulto, tiempo,
flat rate, etc.".

### 2.2 Variable de "porcentaje de ocupación"

Un factor/variable de ocupación (del vehículo, se asume **[verificar]** —
podría ser ocupación de volumen o de peso) que entra en el cálculo de
tarifa/costo. No se especifica todavía la fórmula exacta de cómo pondera.

### 2.3 "Cluster de tarifa" — fórmula de costeo

> cluster de tarifa km, unidad, fija = costo fijo + costo variable + costo
> del diésel + utilidad

Es decir, cada tipo de tarifa (km/unidad/fija) se arma combinando cuatro
componentes: costo fijo, costo variable, costo del combustible (aislado como
su propio componente, no diluido dentro de "variable"), y margen de
utilidad. Esto es consistente con — y da la fórmula concreta que faltaba
para — la "estructura de costos (tarifario)" que `CONTEXTO_PROYECTO_TMS.md`
§2.3 ya describía en abstracto (componentes fijos vs. variables).

### 2.4 Fórmula detallada de costo por kilómetro (la parte más completa de la nota)

Metodología completa que Jean Carlo comparte para calcular el costo/km real
de un vehículo, pensada explícitamente para el motor de Liquidación/Tarifas
del TMS:

**Fórmula base:**

```
Costo por km = (Costos fijos del período / Km productivos del período) + Costos variables por km
```

**Ejemplo de desglose (valores de ejemplo, no reales de OLO):**

| Concepto | Cálculo | Costo/km |
|---|---|---|
| Combustible | ₡650/L ÷ 3 km/L | ₡216.67 |
| Llantas | ₡1,200,000 ÷ 60,000 km | ₡20 |
| Mantenimiento | histórico | ₡45 |
| Peajes | promedio | ₡15 |
| Otros variables | promedio | ₡10 |
| **Variables (subtotal)** | | **₡306.67/km** |
| Salario + cargas | ₡900,000 ÷ 6,000 km | ₡150 |
| Seguro | ₡120,000 ÷ 6,000 km | ₡20 |
| Depreciación/leasing | ₡600,000 ÷ 6,000 km | ₡100 |
| Administración | ₡180,000 ÷ 6,000 km | ₡30 |
| **Fijos distribuidos (subtotal)** | | **₡300/km** |
| **Costo real** | | **₡606.67/km** |

**Recomendación explícita: no usar un único "valor del km" para toda la
empresa** — calcular el costo por vehículo o por tipo de vehículo, porque un
cabezal, un camión de 8 toneladas y uno de 3.5 toneladas tienen estructuras
de costo muy distintas. Esto es coherente con el catálogo de `vehicle_types`
que ya existe en el esquema (migrado a AWS en esta misma sesión de trabajo).

**Kilómetros vacíos (punto crítico señalado explícitamente):**

Un viaje de 100 km cargado + 100 km de regreso vacío, a ₡607/km de costo
operativo:

```
200 km × ₡607 = ₡121,400 de costo total
```

Si solo se cobra al cliente por los 100 km cargados, el costo efectivo por
km facturable sube:

```
₡121,400 / 100 km = ₡1,214/km
```

**Tres valores distintos a manejar por separado en el TMS** (no uno solo):

1. **Costo operativo/km** — lo que realmente cuesta operar el vehículo.
2. **Costo por km facturable** — el mismo costo total, mismo total de kms
   recorridos, repartido solo sobre los km que sí se le cobran al cliente
   (ajustado por vacíos).
3. **Tarifa de venta/km** — el costo facturable más un margen objetivo.

**Fórmula de tarifa de venta con margen:**

```
Tarifa = Costo / (1 - margen)
```

Ejemplo con margen del 20% sobre venta y costo facturable de ₡1,214:

```
₡1,214 / 0.80 = ₡1,517.50/km
```

Con esto el TMS puede determinar automáticamente si un viaje es rentable.

**Variables a persistir para que el cálculo se pueda recalcular
periódicamente** (en vez de depender de un número fijo cableado), según la
nota: rendimiento real (km/L), precio actual del combustible, km cargados,
km vacíos, mantenimiento histórico, llantas, depreciación/leasing, conductor,
seguros, peajes, y utilización mensual del vehículo. La oferta explícita de
Jean Carlo: puede proponer el modelo exacto de cálculo, tablas de base de
datos y lógica para calcular automáticamente costo/km y rentabilidad por
viaje — **queda pendiente pedírselo formalmente si Dylan (dueño de
Liquidación) lo confirma como el diseño a seguir.**

**Relación con el esquema ya migrado a AWS:** las tablas `costos_fijos` y
`costos_variables` que ya existen en `tms_olo` (ver la migración de esta
sesión) son exactamente los dos primeros bloques de esta fórmula — falta
formalizar ahí el componente de combustible como línea propia (hoy podría
estar mezclado dentro de "variables") y el cálculo de margen/tarifa de
venta, que no tiene tabla propia todavía.

---

## 3. Planificación — generación automática y ruteo dinámico

- **Generación automática para la planificación, con prioridad a flota
  propia** — cuando hay flota propia disponible (Costa Rica, ver
  `CONTEXTO_PROYECTO_TMS.md` §2.3), el sistema debería preferirla sobre
  transporte tercerizado al generar la planificación automáticamente.
- **Prioridad por fecha de entrega** — otro criterio de priorización para la
  planificación/ruteo, a nivel de pedido. **[verificar]** cómo se relaciona
  esto exactamente con la Regla 1 del OMS (fecha de despacho + día de ruta,
  ver `OMS_ESPECIFICACION_DETALLADA.md` §4) — podrían ser el mismo concepto
  visto desde dos módulos (OMS decide *cuándo alistar*; Planificación
  decidiría *en qué orden entregar* dado ya el conjunto priorizado), o dos
  reglas distintas que hay que conciliar. No asumir que son lo mismo sin
  confirmar con Jean Carlo/Jesús/Eduardo.
- **Ruteo dinámico multi-fuente**: el sistema "recibe la cantidad de pedidos
  de todo lado" y aplica reglas para generar el *routing dinámico*, tomando
  todos los factores para generar la ruta y las entregas. Esto amplía el
  alcance de Planificación (Jesús, `CONTEXTO_PROYECTO_TMS.md` §2.2) más allá
  de "Fase 1" (clustering + Google Maps con datos ya asignados a
  ruta/transportista/vehículo) hacia algo que decide la ruta misma de forma
  dinámica según todos los pedidos entrantes — **a confirmar si esto es una
  Fase 2/3 de Planificación, o una expansión del alcance de Fase 1 que hay
  que replantear con Jesús.**

---

## 4. Preguntas para cerrar con Jean Carlo antes de construir sobre esto

- [ ] ¿Qué significa exactamente "unificar" Clientes y Puntos de Entrega —
      un solo formulario, una sola tabla, o solo una relación más estrecha?
- [ ] ¿Existe ya una integración con Softland en algún otro sistema de OLO, o
      es nueva para este proyecto?
- [ ] ¿El contrato del transportista vive en el módulo "Contratos" ya
      existente (con FK a `carriers`), o es un concepto separado?
- [ ] Catálogo de tipos de licencia: ¿categorías de Costa Rica, de Venezuela,
      o ambas? ¿Debe validar compatibilidad contra el tipo de vehículo?
- [ ] "Tendering" como tipo de tarifa — ¿mecánica exacta? ¿Quién define el
      ganador de la licitación (el sistema, o un operador)?
- [ ] "Porcentaje de ocupación" — ¿de volumen, de peso, o ambos? ¿Cómo pondera
      en la fórmula de costo/tarifa?
- [ ] ¿Se confirma que Dylan (Liquidación) adopta este modelo de costo/km
      (operativo vs. facturable vs. venta) tal cual, o se ajusta con lo que
      él ya investigó de otros TMS del mercado (§2.3 del contexto)?
- [ ] Prioridad por fecha de entrega (Planificación) vs. Regla 1 del OMS
      (fecha de despacho + día de ruta) — ¿mismo concepto, o dos reglas
      distintas que conviven?
- [ ] Alcance del "ruteo dinámico multi-fuente" — ¿es la Fase 2 ya prevista
      de Planificación, o un replanteo de alcance?
