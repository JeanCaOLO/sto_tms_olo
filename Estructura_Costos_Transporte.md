# Estructura de Costos de Transporte

Este documento contiene la información detallada extraída de las distintas pestañas del archivo de hoja de cálculo `Estructura_Costos_Transporte.xlsx`.

---

## 1. Resumen de Costos Fijos

### Base de Días Operativos
* **Días Operativos por Mes:** 30

### Detalle de Costos Mensuales
| Concepto | Monto Mensual (₡) |
| :--- | :--- |
| **Total Costos del Conductor** | ₡946,770.00 |
| **Total Costos del Ayudante** | ₡501,222.00 |
| **Cuota de Depreciación (Camión activo 3-4.5 Ton)** | ₡277,778.00 |
| **TOTAL COSTOS FIJOS MENSUALES** | **₡1,725,770.00** |

### Totales Operativos y Variables
* **COSTO FIJO DIARIO:** ₡57,525.70
* **Costo por KM (Mantenimiento, tipo activo T3):** ₡48.81

---

## 2. Costos del Conductor

> *Gastos mensuales divididos entre días operativos.*

| Concepto | Monto Mensual (₡) |
| :--- | :--- |
| Salario Chofer | ₡820,600.00 |
| Aguinaldo Chofer | ₡83,333.33 |
| Seguro (terceros) | ₡19,000.00 |
| Marchamo | ₡18,949.16 |
| DEKRA | ₡888.00 |
| Zapatos y chaleco | ₡4,000.00 |
| **TOTAL MENSUAL** | **₡946,770.49** |

---

## 3. Costos del Ayudante

> *Aplica según tipo de camión.*

| Concepto | Monto Mensual (₡) |
| :--- | :--- |
| Salario Ayudante | ₡462,666.84 |
| Aguinaldo Ayudante | ₡38,555.57 |
| **TOTAL MENSUAL** | **₡501,222.41** |

---

## 4. Depreciación por Tipo de Camión

> *Fórmula: Valor del vehículo ÷ Vida útil en meses = Cuota mensual (se suma a costos fijos).*

| Tipo de Camión | Valor Vehículo (₡) | Vida Útil (meses) | Cuota / Mes (₡) | Estado |
| :--- | :--- | :--- | :--- | :--- |
| **1 - 2.5 Ton** | ₡10,000,000.00 | 60 | ₡166,666.67 | Inactivo |
| **3 - 4.5 Ton** | ₡20,000,000.00 | 72 | ₡277,777.78 | **ACTIVO** |
| **5 - 7 Ton** | ₡35,000,000.00 | 72 | ₡486,111.11 | Inactivo |

---

## 5. Componentes de Mantenimiento

> *Costo por KM para todos los tipos de camión (Tipo activo actual: **T3 · 3-4.5 Ton**).*

| Componente | Tipo Frec. | Frec. T1 | Costo T1 (₡) | Frec. T3 | Costo T3 (₡) | Frec. T5 | Costo T5 (₡) | ₡/KM Activo | Cantidad |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Filtro de Agua | km | 15,000 | 9,040 | 15,000 | 11,300 | 15,000 | 15,820 | 0.7533 | 1 UND |
| Filtro de Aire | km | 15,000 | 14,464 | 15,000 | 18,080 | 15,000 | 24,860 | 1.2053 | 1 UND |
| Filtro de Aceite | km | 5,000 | 7,232 | 5,000 | 9,040 | 5,000 | 13,560 | 1.8080 | 1 UND |
| Lata de Aceite | km | 5,000 | 28,928 | 5,000 | 36,160 | 5,000 | 51,980 | 7.2320 | 8/11.5 L |
| Engrase General | km | 5,000 | 7,232 | 5,000 | 9,040 | 5,000 | 13,560 | 1.8080 | 1 Serv |
| Engrase de Cojinetes | km | 20,000 | 12,656 | 20,000 | 15,820 | 20,000 | 20,340 | 0.7910 | 2 Ejes |
| Engrase de Patas | km | 10,000 | 5,424 | 10,000 | 6,780 | 10,000 | 9,040 | 0.6780 | 1 Serv |
| Engrase Patas/Zapatas 4 Puntas | km | 10,000 | 7,232 | 10,000 | 9,040 | 10,000 | 11,300 | 0.9040 | 4 Ptos |
| MO General (por hora) | month | 1 | 9,040 | 1 | 11,300 | 1 | 13,560 | 3.7667 | 1 Hora |
| MO (por evento) | month | 1 | 9,040 | 1 | 11,300 | 1 | 13,560 | 3.7667 | 1 UND |
| MO Servicio de Frenos | km | 25,000 | 21,696 | 25,000 | 27,120 | 22,000 | 36,160 | 1.0848 | 2.5/3 H |
| Filtro de Diesel | km | 10,000 | 12,656 | 10,000 | 15,820 | 10,000 | 20,340 | 1.5820 | 1 UND |
| Trampa de Diesel | km | 10,000 | 10,848 | 10,000 | 13,560 | 10,000 | 18,080 | 1.3560 | 1 UND |
| Bateria | year | 2 | 72,320 | 2 | 90,400 | 2 | 113,000 | 1.2556 | 2 UND |
| Kit Clutch | km | 70,000 | 130,176 | 70,000 | 162,720 | 65,000 | 226,000 | 2.3246 | 1 Kit |
| MO Cambio de Clutch | km | 70,000 | 43,392 | 70,000 | 54,240 | 65,000 | 81,360 | 0.7749 | 5/6 H |
| Aceite diferencial (85W140) | km | 40,000 | 16,272 | 40,000 | 20,340 | 40,000 | 29,380 | 0.5085 | 4/6 L |
| Aceite de Caja (85W190) | km | 40,000 | 16,272 | 40,000 | 20,340 | 40,000 | 27,120 | 0.5085 | 4/5.5 L |
| MO Diferencial y Caja | km | 40,000 | 14,464 | 40,000 | 18,080 | 40,000 | 22,600 | 0.4520 | 1.5 H |
| Mantenimiento Arrancador | km | 80,000 | 50,624 | 80,000 | 63,280 | 80,000 | 85,880 | 0.7910 | 1 Serv |
| Monitoreo Sensores/Computadora | km | 10,000 | 16,272 | 10,000 | 20,340 | 10,000 | 24,860 | 2.0340 | 1 Escaneo |
| Bomba de Agua | km | 120,000 | 47,008 | 120,000 | 58,760 | 100,000 | 81,360 | 0.4897 | 1 UND |
| MO Cambio Balancines/Tensores | km | 100,000 | 32,544 | 100,000 | 40,680 | 100,000 | 54,240 | 0.4068 | 3/4 H |
| Balancines | km | 100,000 | 39,776 | 100,000 | 49,720 | 100,000 | 67,800 | 0.4972 | 1 Juego |
| Tensores | km | 100,000 | 25,312 | 100,000 | 31,640 | 100,000 | 42,940 | 0.3164 | 1 UND |
| Rach | km | 60,000 | 18,080 | 60,000 | 22,600 | 60,000 | 33,900 | 0.3767 | 2 UND |
| Empastado Zapatas 4 Puntas | km | 50,000 | 39,776 | 50,000 | 49,720 | 45,000 | 72,320 | 0.9944 | 1 Juego |
| Juego de Llantas (6 Nuevas) | km | 50,000 | 325,440 | 50,000 | 406,800 | 45,000 | 569,520 | 8.1360 | 6 UND |
| 2 Cojinetes de Rueda / UND | year | 4 | 10,848 | 4 | 13,560 | 4 | 18,080 | 0.0942 | 1 UND |
| Valvula Compensadora de Bolsas | year | 5 | 10,848 | 5 | 13,560 | 5 | 17,176 | 0.0753 | 1 UND |
| Bolsas / UND | year | 4 | 21,696 | 4 | 27,120 | 4 | 36,160 | 0.1883 | 1 UND |
| Rampa Hidraulica / UND | year | 8 | 144,640 | 8 | 180,800 | 8 | 254,250 | 0.6278 | 1 UND |
| Shocks / UND | year | 3 | 21,696 | 3 | 27,120 | 3 | 36,160 | 0.2511 | 1 UND |
| King Pin | year | 5 | 18,080 | 5 | 22,600 | 4 | 39,550 | 0.1256 | 1 UND |
| Crucetas / UND | year | 3 | 10,848 | 3 | 13,560 | 3 | 20,340 | 0.1256 | 1 UND |
| Cojinete Cardan c/Base | year | 4 | 9,944 | 4 | 12,430 | 4 | 18,080 | 0.0863 | 1 UND |
| Refuerzo de Resorte / UND | year | 5 | 14,464 | 5 | 18,080 | 5 | 27,120 | 0.1004 | 1 UND |
| Forrado de Madera / UND | year | 6 | 28,928 | 6 | 36,160 | 6 | 45,200 | 0.1674 | 1 UND |
| Piso / UND | year | 8 | 43,392 | 8 | 54,240 | 8 | 81,360 | 0.1883 | 1 UND |
| Persiana / UND | year | 7 | 36,160 | 7 | 45,200 | 7 | 58,760 | 0.1794 | 1 UND |
| **TOTAL COSTO / KM (T3)** | | | | | | | | **₡48.8118** | |

*Nota: La columna `₡/KM activo` se incluye tal como fue provista en el tablero de origen. Para los componentes con frecuencia anual (`year`) o mensual (`month`), el cálculo depende de un kilometraje promedio mensual/anual de referencia.*
