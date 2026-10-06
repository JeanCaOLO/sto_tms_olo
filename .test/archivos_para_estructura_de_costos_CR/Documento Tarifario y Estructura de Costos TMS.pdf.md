|JEANCA — TARIFARIO Y COSTEO TMS 1. TIPOS DE TARIFA E INTEGRACIÓN DE VARIABLES Por Kilómetro (km) Por Unidad Tarifa Fija Cluster de Tarifa (km, unidad, fija): Estructurado a partir de la integración directa de + Costo de Diésel + Utilidad 2. DETERMINACIÓN DEL COSTO REAL POR KILÓMETRO costos variables, costos fijos y el margen de utilidad esperado para cotizaciones.|MANUAL DE ESTRUCTURACIÓN DE TARIFAS Y LÓGICA DE CÁLCULO DE RENTABILIDAD El sistema contempla los siguientes esquemas para la definición y cobro de servicios de transporte: Por Volumen Tendering, ajustado según la variable de porcentaje de ocupación del vehículo. En un TMS (Transportation Management System), la mejor forma de calcular el valor/costo por kilómetro no es simplemente dividir combustible entre kilómetros. Lo ideal es obtener un costo real por km, incorporando|Costo Fijo + Costo Variable|
|---|---|---|
|FÓRMULA BASE: COSTO OPERATIVO POR KM|Costo por km = (Costos Fijos del Período / Km Productivos del Período) + Costos Variables por km||
|3. DESGLOSE ESTRUCTURADO DE COSTOS (EJEMPLO CAMIÓN) CONCEPTO|CÁLCULO BASE|COSTO / KM|
|Combustible|₡650/L ÷ 3 km/L|₡216.67|
|Llantas|₡1,200,000 ÷ 60,000 km|₡20.00|
|Mantenimiento|Histórico acumulado|₡45.00|
|Peajes|Promedio por ruta|₡15.00|
|Otros variables TOTAL VARIABLES|Promedio operativo|₡10.00 ₡306.67 / km|
|Salario + cargas sociales|₡900,000 ÷ 6,000 km|₡150.00|
|Seguro vehicular|₡120,000 ÷ 6,000 km|₡20.00|
|Depreciación / Leasing|₡600,000 ÷ 6,000 km|₡100.00|
|Gastos de Administración TOTAL FIJOS DISTRIBUIDOS|₡180,000 ÷ 6,000 km|₡30.00 ₡300.00 / km|
|COSTO REAL OPERATIVO POR KM Conclusión del desglose:|Este vehículo tiene un costo operativo real aproximado de ₡607 por kilómetro.|₡606.67 / km|

JEANCA-Sistema de Gestión de Transportes (TMS) Página 1 de 2

|regreso vacío con costo de ₡607/km:|4. GESTIÓN DE KILÓMETROS VACÍOS Y COSTO FACTURABLE Para evitar distorsiones financieras, el TMS no debe manejar un único "valor de km" genérico para toda la empresa; debe segmentarse por unidad o tipo de vehículo (cabezal, camión de 8 toneladas, camión de 3.5 toneladas), dado que poseen estructuras de costo totalmente diferentes. Un punto crítico es el impacto del retorno en vacío. Asumiendo un viaje de 100 km cargado + 100 km de|
|---|---|
|COSTO TOTAL DEL VIAJE|200 km Totales × ₡607 = ₡121,400 Si únicamente se le cobra al cliente los 100 km cargados, el costo efectivo por km facturable asciende a:|
|COSTO EFECTIVO FACTURABLE|₡121,400 / 100 km = ₡1,214 / km 5. DETERMINACIÓN DE TARIFA DE VENTA Y MARGEN DE RENTABILIDAD Por este motivo, el TMS debe estructurarse operativamente bajo tres métricas diferenciadas: Costo Operativo / km: Costo bruto por distancia recorrida. Costo por km Facturable: Costo absorbiendo los tramos en vacío. Tarifa de Venta / km: Precio final al cliente incorporando margen. FÓRMULA DE TARIFA DE VENTA (MARGEN SOBRE VENTA) Tarifa = Costo Efectivo / (1 − Margen Objetivo) Para un margen objetivo del 20% sobre la venta con un costo efectivo de ₡1,214:|
|Cálculo de Tarifa Final de Venta|Tarifa = ₡1,214 / (1 − 0.20) = ₡1,214 / 0.80 = ₡1,517.50 / km 6. VARIABLES DINÁMICAS A ALMACENAR EN LA BASE DE DATOS DEL TMS Para automatizar la rentabilidad en tiempo real sin depender de valores fijos, el módulo de base de datos del TMS debe registrar y actualizar periódicamente las siguientes variables: Rendimiento real: km/L actualizado por unidad. Combustible: Precio actual del diésel/gasolina por litro. Ruta: Distancia de km cargados vs. km vacíos. Mantenimiento y Llantas: Acumulado histórico actualizado por km recorrido. Costos fijos actualizados: Depreciación/leasing, seguros, cargas de conductores, peajes. Factor de Utilización: Kilometraje total mensual recorrido por vehículo. JEANCA-Sistema de Gestión de Transportes (TMS) Página 2 de 2|